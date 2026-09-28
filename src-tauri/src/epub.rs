//! EPUB reading for import: detection, package metadata, cover and DRM checks.
//!
//! Only the ZIP central directory and a few small entries are read (container, package
//! document, encryption info, cover image), each with a size cap, so large or hostile files
//! never load into memory.

use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;

use quick_xml::escape::resolve_predefined_entity;
use quick_xml::events::{BytesStart, Event};
use quick_xml::{Reader, XmlVersion};
use zip::ZipArchive;

use crate::error::{AppError, AppResult};

const MIMETYPE: &str = "application/epub+zip";
const CONTAINER: &str = "META-INF/container.xml";
const ENCRYPTION: &str = "META-INF/encryption.xml";
const RIGHTS: &str = "META-INF/rights.xml";
/// Font obfuscation (IDPF and Adobe) is allowed; any other encryption means DRM.
const FONT_OBFUSCATION: [&str; 2] = [
    "http://www.idpf.org/2008/embedding",
    "http://ns.adobe.com/pdf/enc#RC",
];
const MAX_XML_BYTES: u64 = 4 * 1024 * 1024;
const MAX_COVER_BYTES: u64 = 20 * 1024 * 1024;
/// Authors beyond this are dropped from the shelf label.
const MAX_AUTHORS: usize = 3;

type Archive = ZipArchive<BufReader<File>>;

#[derive(Debug, Default, PartialEq)]
pub struct Package {
    pub title: Option<String>,
    pub author: Option<String>,
    /// Archive path of the cover image.
    cover: Option<String>,
}

impl Package {
    pub fn has_cover(&self) -> bool {
        self.cover.is_some()
    }
}

fn unreadable(detail: impl std::fmt::Display) -> AppError {
    AppError::Unreadable(format!("EPUB: {detail}"))
}

/// True when `path` is a ZIP whose `mimetype` entry declares an EPUB. The OCF spec wants that
/// entry first and uncompressed, but many real files break this, so its position is not checked.
pub fn is_epub(path: &Path) -> AppResult<bool> {
    let mut magic = [0u8; 4];
    let mut file = File::open(path)?;
    if file.read(&mut magic)? < 4 || &magic != b"PK\x03\x04" {
        return Ok(false);
    }
    let Ok(mut archive) = ZipArchive::new(BufReader::new(File::open(path)?)) else {
        return Ok(false);
    };
    let Ok(entry) = archive.by_name("mimetype") else {
        return Ok(false);
    };
    let mut content = String::new();
    if entry.take(64).read_to_string(&mut content).is_err() {
        return Ok(false);
    }
    Ok(content.trim() == MIMETYPE)
}

/// Reads the package metadata. Fails with `Drm` for protected books and `Unreadable` for
/// broken ones.
pub fn read_package(path: &Path) -> AppResult<Package> {
    let mut archive = open(path)?;
    read_package_from(&mut archive)
}

/// The cover image bytes, if the package declares one that exists in the archive.
pub fn read_cover(path: &Path) -> AppResult<Option<Vec<u8>>> {
    let mut archive = open(path)?;
    let Some(cover) = read_package_from(&mut archive)?.cover else {
        return Ok(None);
    };
    let Ok(entry) = archive.by_name(&cover) else {
        return Ok(None);
    };
    if entry.size() > MAX_COVER_BYTES {
        return Ok(None);
    }
    let mut bytes = Vec::with_capacity(entry.size() as usize);
    entry
        .take(MAX_COVER_BYTES)
        .read_to_end(&mut bytes)
        .map_err(unreadable)?;
    Ok(Some(bytes))
}

fn open(path: &Path) -> AppResult<Archive> {
    let file = BufReader::new(File::open(path)?);
    ZipArchive::new(file).map_err(unreadable)
}

fn read_package_from(archive: &mut Archive) -> AppResult<Package> {
    check_drm(archive)?;
    let container = read_text(archive, CONTAINER)?.ok_or_else(|| unreadable("no container"))?;
    let opf_path = rootfile(&container)?;
    let opf = read_text(archive, &opf_path)?
        .ok_or_else(|| unreadable(format!("missing package document {opf_path}")))?;
    parse_package(&opf, &opf_path)
}

/// A small text entry, or None when it does not exist.
fn read_text(archive: &mut Archive, name: &str) -> AppResult<Option<String>> {
    let entry = match archive.by_name(name) {
        Ok(entry) => entry,
        Err(zip::result::ZipError::FileNotFound) => return Ok(None),
        Err(err) => return Err(unreadable(err)),
    };
    if entry.size() > MAX_XML_BYTES {
        return Err(unreadable(format!("{name} is too large")));
    }
    let mut bytes = Vec::with_capacity(entry.size() as usize);
    entry
        .take(MAX_XML_BYTES)
        .read_to_end(&mut bytes)
        .map_err(unreadable)?;
    let text = String::from_utf8(bytes).map_err(|_| unreadable(format!("{name} is not UTF-8")))?;
    Ok(Some(text.trim_start_matches('\u{feff}').to_owned()))
}

fn check_drm(archive: &mut Archive) -> AppResult<()> {
    if archive.index_for_name(RIGHTS).is_some() {
        return Err(AppError::Drm);
    }
    let Some(encryption) = read_text(archive, ENCRYPTION)? else {
        return Ok(());
    };
    let mut drm = false;
    walk(&encryption, |element, attr| {
        if element == "EncryptionMethod" {
            if let Some(algorithm) = attr("Algorithm") {
                drm |= !FONT_OBFUSCATION.contains(&algorithm.as_str());
            }
        }
    })?;
    if drm {
        return Err(AppError::Drm);
    }
    Ok(())
}

/// `full-path` of the first package document listed in `META-INF/container.xml`.
fn rootfile(container: &str) -> AppResult<String> {
    let mut path = None;
    walk(container, |element, attr| {
        if element == "rootfile" && path.is_none() {
            path = attr("full-path");
        }
    })?;
    path.filter(|p| !p.is_empty())
        .ok_or_else(|| unreadable("no package document"))
}

struct Item {
    id: String,
    href: String,
    media_type: String,
    properties: String,
}

fn parse_package(opf: &str, opf_path: &str) -> AppResult<Package> {
    let mut reader = Reader::from_str(opf);
    let mut items = Vec::new();
    let mut cover_id = None;
    let mut titles = Vec::new();
    let mut creators = Vec::new();
    // The Dublin Core element whose text is being read, if any.
    let mut capturing: Option<&'static str> = None;
    let mut text = String::new();
    // Truncated documents parse without errors, so check that every element was closed.
    let mut depth = 0usize;
    let mut root = None;

    loop {
        let event = reader.read_event().map_err(unreadable)?;
        match &event {
            Event::Start(e) | Event::Empty(e) => {
                let get = |name: &str| attribute(e, name);
                let is_start = matches!(event, Event::Start(_));
                let name = local(e);
                root.get_or_insert_with(|| name.clone());
                if is_start {
                    depth += 1;
                }
                match name.as_str() {
                    "title" | "creator" if is_start && capturing.is_none() => {
                        capturing = Some(if name == "title" { "title" } else { "creator" });
                        text.clear();
                    }
                    "meta" if get("name").as_deref() == Some("cover") => {
                        cover_id = get("content");
                    }
                    "item" => items.push(Item {
                        id: get("id").unwrap_or_default(),
                        href: get("href").unwrap_or_default(),
                        media_type: get("media-type").unwrap_or_default(),
                        properties: get("properties").unwrap_or_default(),
                    }),
                    _ => {}
                }
            }
            Event::Text(t) if capturing.is_some() => text.push_str(&t.xml10_content()),
            Event::CData(t) if capturing.is_some() => text.push_str(t),
            Event::GeneralRef(r) if capturing.is_some() => {
                if let Ok(Some(ch)) = r.resolve_char_ref() {
                    text.push(ch);
                } else if let Some(value) = resolve_predefined_entity(r) {
                    text.push_str(value);
                }
            }
            Event::End(e) => {
                depth = depth.saturating_sub(1);
                if let Some(field) = capturing.filter(|f| e.local_name().as_ref() == *f) {
                    let value = collapse_whitespace(&text);
                    if !value.is_empty() {
                        if field == "title" {
                            titles.push(value);
                        } else {
                            creators.push(value);
                        }
                    }
                    capturing = None;
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    if depth != 0 || root.as_deref() != Some("package") {
        return Err(unreadable("incomplete package document"));
    }

    let author = (!creators.is_empty()).then(|| {
        creators.truncate(MAX_AUTHORS);
        creators.join(", ")
    });
    let cover =
        find_cover(&items, cover_id.as_deref()).map(|item| resolve_href(opf_path, &item.href));
    Ok(Package {
        title: titles.into_iter().next(),
        author,
        cover,
    })
}

/// EPUB 3 `cover-image` property, then the EPUB 2 `<meta name="cover">`, then an image whose
/// id or file name mentions "cover".
fn find_cover<'a>(items: &'a [Item], cover_id: Option<&str>) -> Option<&'a Item> {
    let images = || items.iter().filter(|i| i.media_type.starts_with("image/"));
    images()
        .find(|i| i.properties.split_whitespace().any(|p| p == "cover-image"))
        .or_else(|| cover_id.and_then(|id| images().find(|i| i.id == id)))
        .or_else(|| {
            images().find(|i| {
                let file = i.href.rsplit('/').next().unwrap_or_default();
                i.id.to_lowercase().contains("cover") || file.to_lowercase().contains("cover")
            })
        })
}

/// Calls `visit(element_local_name, attribute_lookup)` for every element.
fn walk(xml: &str, mut visit: impl FnMut(&str, &dyn Fn(&str) -> Option<String>)) -> AppResult<()> {
    let mut reader = Reader::from_str(xml);
    loop {
        match reader.read_event().map_err(unreadable)? {
            Event::Start(e) | Event::Empty(e) => visit(&local(&e), &|name| attribute(&e, name)),
            Event::Eof => return Ok(()),
            _ => {}
        }
    }
}

fn local(e: &BytesStart) -> String {
    e.local_name().as_ref().to_owned()
}

/// Attribute value by local name (ignores namespace prefixes such as `opf:`).
fn attribute(e: &BytesStart, name: &str) -> Option<String> {
    e.attributes().flatten().find_map(|a| {
        (a.key.local_name().as_ref() == name)
            .then(|| a.normalized_value(XmlVersion::Implicit1_0).ok())
            .flatten()
            .map(|v| v.trim().to_owned())
    })
}

fn collapse_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Resolves a manifest href (relative to the package document, maybe percent-encoded) to an
/// archive path.
fn resolve_href(opf_path: &str, href: &str) -> String {
    let href = percent_decode(href.split('#').next().unwrap_or_default());
    let mut parts: Vec<&str> = match opf_path.rsplit_once('/') {
        Some((dir, _)) => dir.split('/').collect(),
        None => Vec::new(),
    };
    for part in href.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            part => parts.push(part),
        }
    }
    parts.join("/")
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        let hex = |b: u8| (b as char).to_digit(16);
        match (bytes[i], bytes.get(i + 1), bytes.get(i + 2)) {
            (b'%', Some(&h), Some(&l)) if hex(h).is_some() && hex(l).is_some() => {
                out.push((hex(h).unwrap() * 16 + hex(l).unwrap()) as u8);
                i += 3;
            }
            (b, _, _) => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(test)]
pub(crate) mod tests {
    use std::io::Write;
    use std::path::PathBuf;

    use zip::write::SimpleFileOptions;
    use zip::{CompressionMethod, ZipWriter};

    use super::*;

    pub const CONTAINER_XML: &str = r#"<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>"#;

    pub fn opf(metadata: &str, manifest: &str) -> String {
        format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">{metadata}</metadata>
  <manifest>{manifest}</manifest>
  <spine><itemref idref="c1"/></spine>
</package>"#
        )
    }

    /// Writes a ZIP with the given entries, `mimetype` first and stored as the spec requires.
    pub fn write_zip(dir: &Path, name: &str, entries: &[(&str, &[u8])]) -> PathBuf {
        let path = dir.join(name);
        let mut zip = ZipWriter::new(File::create(&path).unwrap());
        let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        let deflated = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        for (entry, bytes) in entries {
            let options = if *entry == "mimetype" {
                stored
            } else {
                deflated
            };
            zip.start_file(*entry, options).unwrap();
            zip.write_all(bytes).unwrap();
        }
        zip.finish().unwrap();
        path
    }

    pub fn write_epub(dir: &Path, name: &str, package: &str, extra: &[(&str, &[u8])]) -> PathBuf {
        let mut entries: Vec<(&str, &[u8])> = vec![
            ("mimetype", MIMETYPE.as_bytes()),
            (CONTAINER, CONTAINER_XML.as_bytes()),
            ("OEBPS/content.opf", package.as_bytes()),
        ];
        entries.extend_from_slice(extra);
        write_zip(dir, name, &entries)
    }

    const JPEG: &[u8] = b"\xff\xd8\xff\xe0fake-jpeg";

    #[test]
    fn detects_epubs_by_content() {
        let tmp = tempfile::tempdir().unwrap();
        let epub = write_epub(tmp.path(), "book.bin", &opf("", ""), &[]);
        assert!(is_epub(&epub).unwrap());

        let plain_zip = write_zip(tmp.path(), "a.zip", &[("readme.txt", b"hi")]);
        let odt = write_zip(
            tmp.path(),
            "doc.epub",
            &[("mimetype", b"application/vnd.oasis.opendocument.text")],
        );
        let text = tmp.path().join("notes.epub");
        std::fs::write(&text, b"PK\x03\x04 but not a zip").unwrap();
        for path in [plain_zip, odt, text] {
            assert!(!is_epub(&path).unwrap(), "{path:?}");
        }
    }

    #[test]
    fn reads_epub3_metadata_and_cover() {
        let tmp = tempfile::tempdir().unwrap();
        let package = opf(
            r#"<dc:title>  Clean
                 Code &amp; <i>More</i> </dc:title>
               <dc:creator>Robert C. Martin</dc:creator><dc:creator>Someone Else</dc:creator>"#,
            r#"<item id="c1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
               <item id="img" href="images/Cover%20Art.jpg" media-type="image/jpeg" properties="cover-image"/>"#,
        );
        let path = write_epub(
            tmp.path(),
            "a.epub",
            &package,
            &[("OEBPS/images/Cover Art.jpg", JPEG)],
        );

        let package = read_package(&path).unwrap();
        assert_eq!(package.title.as_deref(), Some("Clean Code & More"));
        assert_eq!(
            package.author.as_deref(),
            Some("Robert C. Martin, Someone Else")
        );
        assert_eq!(read_cover(&path).unwrap().unwrap(), JPEG);
    }

    #[test]
    fn finds_epub2_and_fallback_covers() {
        let tmp = tempfile::tempdir().unwrap();
        let epub2 = opf(
            r#"<dc:title>Old</dc:title><meta name="cover" content="cov"/>"#,
            r#"<item id="cov" href="../art/front.png" media-type="image/png"/>"#,
        );
        let path = write_epub(tmp.path(), "a.epub", &epub2, &[("art/front.png", b"png")]);
        assert_eq!(read_cover(&path).unwrap().unwrap(), b"png");

        let by_name = opf(
            "",
            r#"<item id="i1" href="img/logo.png" media-type="image/png"/>
               <item id="i2" href="img/cover.gif" media-type="image/gif"/>"#,
        );
        let path = write_epub(
            tmp.path(),
            "b.epub",
            &by_name,
            &[("OEBPS/img/cover.gif", b"gif")],
        );
        assert_eq!(read_cover(&path).unwrap().unwrap(), b"gif");
    }

    #[test]
    fn missing_metadata_is_not_an_error() {
        let tmp = tempfile::tempdir().unwrap();
        let path = write_epub(
            tmp.path(),
            "a.epub",
            &opf("<dc:title>   </dc:title>", ""),
            &[],
        );
        assert_eq!(read_package(&path).unwrap(), Package::default());
        assert!(read_cover(&path).unwrap().is_none());

        // Declared cover that isn't in the archive.
        let dangling = opf(
            "",
            r#"<item id="x" href="gone.jpg" media-type="image/jpeg" properties="cover-image"/>"#,
        );
        let path = write_epub(tmp.path(), "b.epub", &dangling, &[]);
        assert!(read_package(&path).unwrap().has_cover());
        assert!(read_cover(&path).unwrap().is_none());
    }

    #[test]
    fn rejects_broken_packages() {
        let tmp = tempfile::tempdir().unwrap();
        let no_container = write_zip(tmp.path(), "a.epub", &[("mimetype", MIMETYPE.as_bytes())]);
        let no_opf = write_zip(
            tmp.path(),
            "b.epub",
            &[
                ("mimetype", MIMETYPE.as_bytes()),
                (CONTAINER, CONTAINER_XML.as_bytes()),
            ],
        );
        let bad_xml = write_epub(tmp.path(), "c.epub", "<package><metadata>", &[]);
        let not_zip = tmp.path().join("d.epub");
        std::fs::write(&not_zip, b"garbage").unwrap();
        for path in [no_container, no_opf, bad_xml, not_zip] {
            assert!(
                matches!(read_package(&path), Err(AppError::Unreadable(_))),
                "{path:?}"
            );
        }
    }

    #[test]
    fn detects_drm_but_allows_font_obfuscation() {
        let tmp = tempfile::tempdir().unwrap();
        let package = opf("<dc:title>T</dc:title>", "");
        let encryption = |algorithm: &str| {
            format!(
                r#"<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container"
                     xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
                   <enc:EncryptedData><enc:EncryptionMethod Algorithm="{algorithm}"/></enc:EncryptedData>
                 </encryption>"#
            )
        };

        let fonts = encryption("http://www.idpf.org/2008/embedding");
        let ok = write_epub(
            tmp.path(),
            "a.epub",
            &package,
            &[(ENCRYPTION, fonts.as_bytes())],
        );
        assert_eq!(read_package(&ok).unwrap().title.as_deref(), Some("T"));

        let aes = encryption("http://www.w3.org/2001/04/xmlenc#aes128-cbc");
        let locked = write_epub(
            tmp.path(),
            "b.epub",
            &package,
            &[(ENCRYPTION, aes.as_bytes())],
        );
        let rights = write_epub(tmp.path(), "c.epub", &package, &[(RIGHTS, b"<rights/>")]);
        for path in [locked, rights] {
            assert!(matches!(read_package(&path), Err(AppError::Drm)));
        }
    }

    #[test]
    fn resolves_hrefs() {
        assert_eq!(
            resolve_href("OEBPS/content.opf", "img/a.jpg"),
            "OEBPS/img/a.jpg"
        );
        assert_eq!(resolve_href("OEBPS/content.opf", "../a%20b.jpg"), "a b.jpg");
        assert_eq!(resolve_href("content.opf", "./x/./y.png#frag"), "x/y.png");
    }
}
