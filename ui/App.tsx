import { MemoryRouter, Route, Routes, useNavigate } from "react-router";
import { ThemeProvider } from "./app/theme";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Toaster } from "./components/toast";
import { LibraryPage } from "./features/library/LibraryPage";
import { BookDetailsPage } from "./features/book/BookDetailsPage";
import { ReaderPage } from "./features/reader/ReaderPage";

function AppRoutes() {
  const navigate = useNavigate();
  return (
    <ErrorBoundary onReset={() => navigate("/")}>
      <Routes>
        <Route path="/" element={<LibraryPage />} />
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
