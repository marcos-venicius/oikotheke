import { MemoryRouter, Route, Routes } from "react-router";
import { ThemeProvider } from "./app/theme";
import { Toaster } from "./components/toast";
import { LibraryPage } from "./features/library/LibraryPage";
import { BookDetailsPage } from "./features/book/BookDetailsPage";
import { ReaderPage } from "./features/reader/ReaderPage";

export default function App() {
  return (
    <ThemeProvider>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<LibraryPage />} />
          <Route path="/book/:id" element={<BookDetailsPage />} />
          <Route path="/read/:id" element={<ReaderPage />} />
        </Routes>
      </MemoryRouter>
      <Toaster />
    </ThemeProvider>
  );
}
