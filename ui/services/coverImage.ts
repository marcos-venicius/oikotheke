/** Shelf covers are JPEG thumbnails of this width (smaller images are kept as they are). */
export const COVER_WIDTH = 480;

export async function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85),
  );
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error("Could not encode cover");
  return new Uint8Array(await blob.arrayBuffer());
}

/** Decodes any image the webview supports and re-encodes it as a cover thumbnail. */
export async function imageToCover(bytes: ArrayBuffer): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(new Blob([bytes]));
  try {
    const scale = Math.min(1, COVER_WIDTH / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is not available");
    // JPEG has no transparency; keep transparent covers readable.
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await canvasToJpeg(canvas);
  } finally {
    bitmap.close();
  }
}
