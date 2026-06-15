import { createContext, useContext, useState, useEffect } from "react";
import { THEMES } from "./colors";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [themeName, setThemeNameState] = useState(() => {
    const saved = localStorage.getItem("theme");
    return saved === "light" ? "light" : "dark";
  });

  const colors = THEMES[themeName];

  function setTheme(name) {
    localStorage.setItem("theme", name);
    setThemeNameState(name);
  }

  function toggleTheme() {
    setTheme(themeName === "dark" ? "light" : "dark");
  }

  // Keep <html> background in sync so there's no flash on the edges of the viewport
  useEffect(() => {
    document.documentElement.style.background = colors.bg;
    document.documentElement.style.color = colors.text;
  }, [colors]);

  return (
    <ThemeContext.Provider value={{ themeName, colors, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
