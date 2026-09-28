import { useNavigate } from "react-router";
import { Button } from "@/components/Button";

export function ReaderLoading() {
  return (
    <div className="flex h-full items-center justify-center bg-reader">
      <span className="size-6 animate-spin rounded-full border-2 border-border border-t-accent" />
    </div>
  );
}

export function ReaderError({ message }: { message: string }) {
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <p className="text-sm font-medium">This book can't be opened</p>
      <p className="max-w-sm text-sm text-muted">{message}</p>
      <Button onClick={() => navigate("/")}>Back to library</Button>
    </div>
  );
}
