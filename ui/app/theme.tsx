import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { settingsService } from "@/services/settingsService";
import type { ThemePreference } from "@/lib/types";

const STORAGE_KEY = "pdf-shelf:theme";
const SETTING_KEY = "theme";

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: "light" | "dark";
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

function isPreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function readCachedPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isPreference(value) ? value : "system";
  } catch {
    return "system";
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readCachedPreference);
  const [systemDark, setSystemDark] = useState(() => darkQuery().matches);

  // The database is the source of truth; localStorage only avoids a flash on startup.
  useEffect(() => {
    settingsService
      .getAll()
      .then((settings) => {
        const stored = settings[SETTING_KEY];
        if (isPreference(stored)) setPreferenceState(stored);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const query = darkQuery();
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const resolved = preference === "system" ? (systemDark ? "dark" : "light") : preference;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Cache only; the setting below is what persists.
    }
    settingsService.set(SETTING_KEY, next).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const ctx = use(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
