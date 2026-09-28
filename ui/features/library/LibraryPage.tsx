import { ThemeToggle } from "@/components/ThemeToggle";

export function LibraryPage() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between px-6">
        <h1 className="text-[15px] font-semibold tracking-tight">Library</h1>
        <ThemeToggle />
      </header>
    </div>
  );
}
