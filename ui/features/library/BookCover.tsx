import { useState } from "react";
import type { Book } from "@/lib/types";
import { coverUrl } from "@/services/bookFile";
import { cn } from "@/lib/cn";

/** Deterministic hue so a book without a cover always gets the same placeholder. */
function hue(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function BookCover({ book, className }: { book: Book; className?: string }) {
  const url = coverUrl(book);
  const [failed, setFailed] = useState(false);

  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setFailed(true)}
        className={cn("size-full object-cover object-top", className)}
      />
    );
  }
  return <PlaceholderCover title={book.title} author={book.author} className={className} />;
}

/** Typographic cover for books without an image (and for Discover, which loads none). */
export function PlaceholderCover({
  title,
  author,
  className,
}: {
  title: string;
  author: string | null;
  className?: string;
}) {
  const h = hue(title);
  return (
    <div
      className={cn("flex size-full flex-col justify-between p-3.5 text-left", className)}
      style={{
        background: `linear-gradient(160deg, hsl(${h} 32% 46%), hsl(${(h + 30) % 360} 36% 30%))`,
      }}
    >
      <span className="line-clamp-5 text-[13px] leading-snug font-semibold text-white/95">
        {title}
      </span>
      {author && <span className="line-clamp-2 text-[11px] text-white/70">{author}</span>}
    </div>
  );
}
