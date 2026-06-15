import React, { createContext, useContext, useState, useEffect } from "react";
import { buttonAnalytics } from "../../services/analytics/analytics";

type Theme = "light" | "dark" | "system";
type EffectiveTheme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  effectiveTheme: EffectiveTheme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const savedTheme = localStorage.getItem("theme");
    if (
      savedTheme === "light" ||
      savedTheme === "dark" ||
      savedTheme === "system"
    ) {
      return savedTheme as Theme;
    }
    return "system";
  });

  const [systemTheme, setSystemTheme] = useState<EffectiveTheme>(() => {
    if (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      return "dark";
    }
    return "light";
  });

  const effectiveTheme: EffectiveTheme =
    theme === "system" ? systemTheme : theme;

  useEffect(() => {
    if (theme !== "system") {
      localStorage.setItem("theme", theme);
    } else {
      localStorage.removeItem("theme");
    }
    document.documentElement.classList.toggle(
      "dark",
      effectiveTheme === "dark"
    );
  }, [theme, effectiveTheme]);

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? "dark" : "light");
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const toggleTheme = () => {
    const newTheme = effectiveTheme === "light" ? "dark" : "light";
    buttonAnalytics.trackButtonClick("Button Clicked", {
      button_name: "Toggle Theme",
      page_name: "Theme Context",
      feature_area: "UI",
      old_theme: effectiveTheme,
      new_theme: newTheme,
    });
    setThemeState(newTheme);
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  return (
    <ThemeContext.Provider
      value={{ theme, effectiveTheme, toggleTheme, setTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
