"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { classNames } from "./utils.js";

export type ThemePreference = "system" | "light" | "dark";

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const storageKey = "flicksend-theme-preference";
export const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

function applyTheme(preference: ThemePreference): void {
  if (preference === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = preference;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    const nextPreference = isThemePreference(stored) ? stored : "system";
    setPreferenceState(nextPreference);
    applyTheme(nextPreference);
  }, []);

  function setPreference(nextPreference: ThemePreference): void {
    setPreferenceState(nextPreference);
    window.localStorage.setItem(storageKey, nextPreference);
    applyTheme(nextPreference);
  }

  return (
    <ThemeContext.Provider value={{ preference, setPreference }}>{children}</ThemeContext.Provider>
  );
}

export function ThemeControl({
  preference,
  onPreferenceChange
}: {
  preference: ThemePreference;
  onPreferenceChange: (preference: ThemePreference) => void;
}) {
  return (
    <div aria-label="Theme preference" className="fs-theme-control" role="group">
      {(["system", "light", "dark"] as const).map((option) => (
        <button
          aria-pressed={preference === option}
          className={classNames("fs-theme-control__button", preference === option && "is-selected")}
          key={option}
          onClick={() => onPreferenceChange(option)}
          type="button"
        >
          {option.slice(0, 1).toUpperCase() + option.slice(1)}
        </button>
      ))}
    </div>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider");
  return context;
}
