import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/app/theme";
import type { ThemePreference } from "@/lib/types";
import { IconButton } from "./Button";

const order: ThemePreference[] = ["system", "light", "dark"];
const icons = { system: Monitor, light: Sun, dark: Moon };

/** Cycles system → light → dark. */
export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const Icon = icons[preference];
  const next = order[(order.indexOf(preference) + 1) % order.length];
  return (
    <IconButton label={`Theme: ${preference} (switch to ${next})`} onClick={() => setPreference(next)}>
      <Icon className="size-[18px]" strokeWidth={1.75} />
    </IconButton>
  );
}
