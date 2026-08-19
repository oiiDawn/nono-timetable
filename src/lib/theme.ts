/** Theme preference (system/light/dark) applied to <html> class and data-theme. */

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "nono-timetable-theme";

export function loadThemePreference(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== "system") return preference;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.classList.toggle("light", resolved === "light");
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
}

/** Apply the stored preference and keep a system-following theme in sync. */
export function initTheme(): () => void {
  applyTheme(resolveTheme(loadThemePreference()));
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (loadThemePreference() === "system") applyTheme(resolveTheme("system"));
  };
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function setThemePreference(preference: ThemePreference) {
  if (preference === "system") localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, preference);
  applyTheme(resolveTheme(preference));
}
