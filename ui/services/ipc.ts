import { invoke, type InvokeArgs, type InvokeOptions } from "@tauri-apps/api/core";

export type AppErrorKind =
  | "notFound"
  | "unsupportedFormat"
  | "unreadable"
  | "drm"
  | "permissionDenied"
  | "diskFull"
  | "invalid"
  | "database"
  | "io"
  | "unknown";

/** Error raised by the Rust backend, serialized as `{ kind, message }`. */
export class AppError extends Error {
  constructor(
    readonly kind: AppErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }

  static from(error: unknown): AppError {
    if (error instanceof AppError) return error;
    if (error && typeof error === "object" && "kind" in error && "message" in error) {
      return new AppError(error.kind as AppErrorKind, String(error.message));
    }
    return new AppError("unknown", error instanceof Error ? error.message : String(error));
  }
}

/** User-facing message for an error. */
export function describeError(error: unknown): string {
  const err = AppError.from(error);
  switch (err.kind) {
    case "unsupportedFormat":
      return "This file is not a PDF or EPUB.";
    case "unreadable":
      return "This book is damaged or can't be read.";
    case "drm":
      return "This book is protected by DRM and can't be imported.";
    case "permissionDenied":
      return "Permission denied while reading or writing the file.";
    case "diskFull":
      return "There is not enough disk space.";
    case "notFound":
      return "The file could not be found.";
    default:
      return err.message;
  }
}

export async function call<T>(cmd: string, args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  try {
    return await invoke<T>(cmd, args, options);
  } catch (error) {
    throw AppError.from(error);
  }
}
