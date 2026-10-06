import { useEffect } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router";
import { isQuitShortcut, quit } from "./app/quit";
import { ThemeProvider } from "./app/theme";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Toaster } from "./components/toast";
import { LibraryPage } from "./features/library/LibraryPage";
import { BookDetailsPage } from "./features/book/BookDetailsPage";
import { DiscoverPage } from "./features/discover/DiscoverPage";
import { ReaderPage } from "./features/reader/ReaderPage";

function AppRoutes() {
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isQuitShortcut(e)) return;
      e.preventDefault();
      quit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <ErrorBoundary onReset={() => navigate("/")}>
      <Routes>
        <Route path="/" element={<LibraryPage />} />
        <Route path="/discover" element={<DiscoverPage />} />
        <Route path="/book/:id" element={<BookDetailsPage />} />
        <Route path="/read/:id" element={<ReaderPage />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <MemoryRouter>
        <AppRoutes />
      </MemoryRouter>
      <Toaster />
    </ThemeProvider>
  );
}
