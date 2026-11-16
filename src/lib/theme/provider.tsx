"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

import {
  FORCED_THEME,
  SOLID_COOKIE,
  THEME_COOKIE,
  htmlThemeState,
  serializePreference,
  type Theme,
} from "./config";

type ThemeContextValue = {
  /** What the user picked. Always FORCED_THEME while that is set. */
  theme: Theme;
  /** What is actually on screen — "system" resolved against the OS setting. */
  resolvedTheme: "light" | "dark";
  /** Inert while FORCED_THEME is set. */
  setTheme: (next: Theme) => void;
  /** True while the theme is locked and a picker should read as disabled. */
  forced: boolean;
  solid: boolean;
  setSolid: (next: boolean) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = "(prefers-color-scheme: dark)";
/** Same-tab notification. Cookies fire no event of their own. */
const CHANGE_EVENT = "leap:preferences-change";
/** Cross-tab notification, replacing the `storage` event localStorage had. */
const CHANNEL_NAME = "leap:preferences";

function systemTheme(): "light" | "dark" {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function readCookie(name: string): string | undefined {
  const prefix = `${name}=`;
  for (const part of document.cookie.split("; ")) {
    if (part.startsWith(prefix)) {
      try {
        return decodeURIComponent(part.slice(prefix.length));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/** The current preferences, from the same mapping the root layout uses. */
function readState() {
  return htmlThemeState(readCookie(THEME_COOKIE), readCookie(SOLID_COOKIE));
}

let channel: BroadcastChannel | null | undefined;
function getChannel(): BroadcastChannel | null {
  if (channel === undefined) {
    channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel(CHANNEL_NAME);
  }
  return channel;
}

/**
 * Preferences live in cookies and on <html>, not in React state, so they are
 * read through useSyncExternalStore: one source of truth and no
 * setState-on-mount cascade. A cookie change in another tab arrives over the
 * BroadcastChannel; this tab re-reads the cookie, not the DOM class, so the
 * two tabs cannot drift apart.
 */
function subscribe(callback: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY);
  const bc = getChannel();
  media.addEventListener("change", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  bc?.addEventListener("message", callback);
  return () => {
    media.removeEventListener("change", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
    bc?.removeEventListener("message", callback);
  };
}

function getTheme(): Theme {
  return readState().theme;
}

function getSolid(): boolean {
  return readState().solid;
}

function getResolvedTheme(): "light" | "dark" {
  const theme = getTheme();
  return theme === "system" ? systemTheme() : theme;
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
  getChannel()?.postMessage("changed");
}

function writeCookie(
  name: typeof THEME_COOKIE | typeof SOLID_COOKIE,
  value: string | null
) {
  document.cookie = serializePreference(
    name,
    value,
    window.location.protocol === "https:"
  );
}

export function ThemeProvider({
  initialTheme,
  initialSolid,
  children,
}: {
  /** What the root layout rendered from the cookies, for hydration. */
  initialTheme: Theme;
  initialSolid: boolean;
  children: React.ReactNode;
}) {
  const theme = useSyncExternalStore(subscribe, getTheme, () => initialTheme);
  const solid = useSyncExternalStore(subscribe, getSolid, () => initialSolid);
  const resolvedTheme = useSyncExternalStore(subscribe, getResolvedTheme, () =>
    // The server cannot see the OS setting; "system" hydrates as dark, which
    // only matters to the toaster and settles on the next snapshot.
    initialTheme === "light" ? "light" : "dark"
  );

  // Keep <html> in step with the cookies. The server already rendered the
  // right attributes, so on mount this is a no-op; it earns its keep when the
  // user picks a value or another tab changes one.
  useEffect(() => {
    const root = document.documentElement;
    const state = htmlThemeState(theme, solid ? "1" : null);
    const wantDark = state.theme === "dark";
    const wantLight = state.theme === "light";
    const wantSystem = state.dataTheme === "system";
    const inStep =
      root.classList.contains("dark") === wantDark &&
      root.classList.contains("light") === wantLight &&
      (root.dataset.theme === "system") === wantSystem &&
      root.classList.contains("solid") === state.solid;
    if (inStep) return;
    withoutTransitions(() => {
      root.classList.toggle("dark", wantDark);
      root.classList.toggle("light", wantLight);
      root.classList.toggle("solid", state.solid);
      if (wantSystem) root.dataset.theme = "system";
      else delete root.dataset.theme;
    });
  }, [theme, solid]);

  const setTheme = useCallback((next: Theme) => {
    if (FORCED_THEME) return;
    writeCookie(THEME_COOKIE, next);
    notify();
  }, []);

  const setSolid = useCallback((next: boolean) => {
    writeCookie(SOLID_COOKIE, next ? "1" : null);
    notify();
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      forced: FORCED_THEME !== undefined,
      solid,
      setSolid,
    }),
    [theme, resolvedTheme, setTheme, solid, setSolid]
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
 * Server-rendered from the `leap-solid` cookie, so it survives a reload with
 * no flash.
 */
export function useSolidSurfaces(): [boolean, (next: boolean) => void] {
  const { solid, setSolid } = useTheme();
  return [solid, setSolid];
}
