// Sidebar open-state cookie, shared by the dashboard layout (server, reads it)
// and the sidebar component (client, writes it). Kept out of the "use client"
// module: a server component cannot call a function exported from one.

export const SIDEBAR_COOKIE_NAME = "sidebar_state";
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * `true` / `false` once the user has chosen; `undefined` before that, which the
 * sidebar renders as "auto" (collapsed on tablets, expanded on desktop).
 */
export function parseSidebarCookie(
  raw: string | null | undefined
): boolean | undefined {
  if (raw === "true") return true;
  if (raw === "false") return false;
  return undefined;
}
