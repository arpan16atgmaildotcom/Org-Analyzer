export const THEMES = {
  dark: {
    name: "dark",
    bg:          "#0a0e1a",
    panel:       "#0f1628",
    panelBorder: "#1e2d4a",
    accent:      "#00d4ff",
    accentSoft:  "#0099cc",
    critical:    "#ff3b5c",
    warning:     "#ffb800",
    info:        "#00d4ff",
    success:     "#00e5a0",
    text:        "#e0eaff",
    muted:       "#6b84a8",
    highlight:   "#1a2540",
  },
  light: {
    name: "light",
    bg:          "#ffffe6",
    panel:       "#ffffff",
    panelBorder: "#d0daea",
    accent:      "#0070a8",
    accentSoft:  "#005a87",
    critical:    "#d9213a",
    warning:     "#c47a00",
    info:        "#0070a8",
    success:     "#007a55",
    text:        "#0d1a2e",
    muted:       "#5a6f8a",
    highlight:   "#e6edf7",
  },
};

// Kept for components that still import it directly; resolves to the current
// theme stored in localStorage (or dark as default). This is a static read —
// components that need live reactivity should use useTheme() from ThemeContext.
const saved = typeof localStorage !== "undefined" ? localStorage.getItem("theme") : null;
export const COLORS = THEMES[(saved === "light" || saved === "dark") ? saved : "dark"];
