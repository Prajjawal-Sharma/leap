export type Theme = "light" | "dark" | "system";

/**
 * Theme and Solid surfaces live in cookies so the root layout can render the
 * right `<html>` class on the server: the first paint is correct with or
 * without JS, and no pre-paint script is needed. Not HttpOnly — the client
 * writes them.
 */
export const THEME_COOKIE = "leap-theme";
export const SOLID_COOKIE = "leap-solid";
export const PREFERENCE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * While this is set, every visitor gets the dark theme and `setTheme` is inert.
 * Half-migrated pages still carry literal dark colours, so letting someone pick
 * light today would show a broken page. UI PR 7 sets this to `undefined` once
 * every page uses tokens, which turns the toggle on.
 */
export const FORCED_THEME: "dark" | undefined = "dark";

export function parseTheme(raw: string | null | undefined): Theme | null {
  return raw === "light" || raw === "dark" || raw === "system" ? raw : null;
}

export function parseSolid(raw: string | null | undefined): boolean {
  return raw === "1";
}

export type HtmlThemeState = {
  theme: Theme;
  solid: boolean;
  /** Classes for `<html>`: the theme class (none for system) and `solid`. */
  className: string;
  /** `"system"` lets CSS follow prefers-color-scheme with no JS at all. */
  dataTheme: "system" | undefined;
};

/**
 * The one mapping from stored preferences to `<html>` attributes, used by the
 * root layout on the server and by the provider on the client so the two can
 * never disagree. A missing or unknown theme cookie means "system" (DESIGN
 * §12 decision 6); FORCED_THEME overrides everything.
 */
export function htmlThemeState(
  themeCookie: string | null | undefined,
  solidCookie: string | null | undefined,
  // null means "not forced". (undefined would trigger this default.)
  forced: Theme | null = FORCED_THEME ?? null
): HtmlThemeState {
  const theme = forced ?? parseTheme(themeCookie) ?? "system";
  const solid = parseSolid(solidCookie);
  const classes = [theme === "system" ? "" : theme, solid ? "solid" : ""];
  return {
    theme,
    solid,
    className: classes.filter(Boolean).join(" "),
    dataTheme: theme === "system" ? "system" : undefined,
  };
}

/**
 * A `document.cookie` assignment for a preference: Path=/, SameSite=Lax, one
 * year, Secure on https. `null` clears it (the Solid cookie is "1" or absent).
 */
export function serializePreference(
  name: typeof THEME_COOKIE | typeof SOLID_COOKIE,
  value: string | null,
  secure: boolean
): string {
  const parts = [
    `${name}=${value === null ? "" : encodeURIComponent(value)}`,
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${value === null ? 0 : PREFERENCE_MAX_AGE_SECONDS}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
