"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

import { FORCED_THEME, SOLID_KEY, THEME_KEY, type Theme } from "./config";

type ThemeContextValue = {
  /** What the user picked. Always FORCED_THEME while that is set. */
  theme: Theme;
  /** What is actually on screen — "system" resolved against the OS setting. */
  resolvedTheme: "light" | "dark";
  /** Inert while FORCED_THEME is set. */
  setTheme: (next: Theme) => void;
  /** True while the theme is locked and a picker should read as disabled. */
  forced: boolean;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = "(prefers-color-scheme: dark)";
/** Same-tab notification; the `storage` event only fires in *other* tabs. */
const CHANGE_EVENT = "leap:theme-change";

function systemTheme(): "light" | "dark" {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function readStoredTheme(): Theme | null {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    return raw === "light" || raw === "dark" || raw === "system" ? raw : null;
  } catch {
    // Safari in private mode throws on localStorage access.
    return null;
  }
}

/**
 * The theme lives in localStorage and on <html>, not in React state, so it is
 * read through useSyncExternalStore: one source of truth, correct on the server,
 * and no setState-on-mount cascade.
 */
function subscribe(callback: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener("change", callback);
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    media.removeEventListener("change", callback);
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function getTheme(): Theme {
  return FORCED_THEME ?? readStoredTheme() ?? "system";
}

function getServerTheme(): Theme {
  return FORCED_THEME ?? "system";
}

function getResolvedTheme(): "light" | "dark" {
  if (FORCED_THEME) return FORCED_THEME;
  const stored = readStoredTheme() ?? "system";
  return stored === "system" ? systemTheme() : stored;
}

function getServerResolvedTheme(): "light" | "dark" {
  // Matches what the server puts on <html>; the script corrects it before paint
  // once the theme is user-controlled.
  return FORCED_THEME ?? "dark";
}

function readSolid(): boolean {
  return document.documentElement.classList.contains("solid");
}

function getServerSolid(): boolean {
  return false;
}

/**
 * Swapping the theme class re-paints every themed surface at once. Without this
 * every element with a colour transition animates to the new palette and the
 * swap reads as a smear. Kill transitions for one frame instead.
 */
function withoutTransitions(apply: () => void) {
  const style = document.createElement("style");
  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{transition:none!important;animation:none!important}"
    )
  );
  document.head.appendChild(style);

  apply();

  // Force a reflow so the class change is flushed while transitions are off.
  void document.body.offsetHeight;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => style.remove());
  });
}

function notify() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getTheme, getServerTheme);
  const resolvedTheme = useSyncExternalStore(
    subscribe,
    getResolvedTheme,
    getServerResolvedTheme
  );

  // Keep <html> in step with the resolved theme. The pre-paint script has
  // normally already done this, so only act when the DOM actually disagrees.
  useEffect(() => {
    const wantsDark = resolvedTheme === "dark";
    if (document.documentElement.classList.contains("dark") === wantsDark) {
      return;
    }
    withoutTransitions(() => {
      document.documentElement.classList.toggle("dark", wantsDark);
    });
  }, [resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    if (FORCED_THEME) return;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Private mode: the choice just will not survive a reload.
    }
    notify();
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      forced: FORCED_THEME !== undefined,
    }),
    [theme, resolvedTheme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside <ThemeProvider>");
  }
  return context;
}

/**
 * Solid surfaces: opaque chrome instead of glass. Covers Safari, which has no
 * prefers-reduced-transparency support, and anyone who simply wants it off.
 *
 * The class on <html> is the source of truth and the pre-paint script sets it,
 * so nothing here writes on mount — that would flash glass before going solid.
 */
export function useSolidSurfaces(): [boolean, (next: boolean) => void] {
  const solid = useSyncExternalStore(subscribe, readSolid, getServerSolid);

  const setSolid = useCallback((next: boolean) => {
    document.documentElement.classList.toggle("solid", next);
    try {
      localStorage.setItem(SOLID_KEY, next ? "1" : "0");
    } catch {
      // Private mode: the choice just will not survive a reload.
    }
    notify();
  }, []);

  return [solid, setSolid];
}
