import { CircleAlert } from "lucide-react";
import type { ImportJobState } from "@/services/importService";

const stageLabel = {
  queued: "Waiting…",
  copying: "Copying…",
  processing: "Preparing…",
  failed: "Failed",
};

/** Placeholder shown on the shelf while a file is being imported in the background. */
export function ImportCard({ job }: { job: ImportJobState }) {
  const failed = job.stage === "failed";
  const progress =
    job.stage === "processing" ? 1 : job.totalBytes > 0 ? job.copiedBytes / job.totalBytes : 0;
  const r = 16;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="flex flex-col" aria-busy={!failed}>
      <div className="flex aspect-[2/3] w-full flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-surface p-4">
        {failed ? (
          <CircleAlert className="size-8 text-danger" strokeWidth={1.5} />
        ) : (
          <svg viewBox="0 0 40 40" className="size-10 -rotate-90" aria-hidden>
            <circle cx="20" cy="20" r={r} fill="none" stroke="var(--border)" strokeWidth="3" />
            <circle
              cx="20"
              cy="20"
              r={r}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress)}
              className={
                job.stage === "processing"
                  ? "animate-pulse"
                  : "transition-[stroke-dashoffset] duration-200"
              }
            />
          </svg>
        )}
        <p className="text-center text-xs text-muted">
          {failed
            ? job.error
            : job.catalogId && job.stage === "copying"
              ? "Downloading…"
              : stageLabel[job.stage]}
        </p>
      </div>
      <p
        className="mt-[23px] line-clamp-2 text-[13px] leading-snug font-medium text-muted"
        title={job.fileName}
      >
        {job.fileName}
      </p>
    </div>
  );
}
