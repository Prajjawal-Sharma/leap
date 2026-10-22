export type Theme = "light" | "dark" | "system";

export const THEME_KEY = "leap:theme";
export const SOLID_KEY = "leap:solid-surfaces";

/**
 * While this is set, every visitor gets the dark theme and `setTheme` is inert.
 * Half-migrated pages still carry literal dark colours, so letting someone pick
 * light today would show a broken page. UI PR 7 sets this to `undefined` once
 * every page uses tokens, which turns the toggle on.
 */
export const FORCED_THEME: "dark" | undefined = "dark";
