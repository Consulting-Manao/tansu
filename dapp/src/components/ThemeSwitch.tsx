import { useState } from "react";
import { IconButton } from "components/ui";

type Theme = "system" | "light" | "dark";

const NEXT: Record<Theme, Theme> = {
  system: "light",
  light: "dark",
  dark: "system",
};
// Each theme's ground (--ds-ground), for the browser's bar.
const GROUND = { light: "#f6f4f9", dark: "#0e0a16" };

const read = (): Theme => {
  const theme = document.documentElement.dataset.theme;
  return theme === "light" || theme === "dark" ? theme : "system";
};

const Icon = ({ theme }: { theme: Theme }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {theme === "light" ? (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ) : theme === "dark" ? (
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
    ) : (
      <>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </>
    )}
  </svg>
);

/**
 * The theme: the device's (System), Light or Dark, in turn. The choice is
 * kept in this browser; Layout's head script applies it before the first
 * paint.
 */
const ThemeSwitch = () => {
  const [theme, setTheme] = useState<Theme>(read);

  const pick = () => {
    const next = NEXT[theme];
    setTheme(next);
    const root = document.documentElement;
    if (next === "system") delete root.dataset.theme;
    else root.dataset.theme = next;
    try {
      if (next === "system") localStorage.removeItem("tansu-theme");
      else localStorage.setItem("tansu-theme", next);
    } catch {
      // Without storage, the theme holds for this page only.
    }
    document
      .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
      .forEach((meta) => {
        const scheme = meta.media.includes("dark") ? "dark" : "light";
        meta.content = GROUND[next === "system" ? scheme : next];
      });
  };

  const name = { system: "System", light: "Light", dark: "Dark" }[theme];
  return (
    <IconButton
      label={`Theme: ${name}`}
      onClick={pick}
      className="text-band-ink"
    >
      <Icon theme={theme} />
    </IconButton>
  );
};

export default ThemeSwitch;
