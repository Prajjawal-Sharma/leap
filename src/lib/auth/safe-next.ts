// Open-redirect guard for the post-auth `next` query param. Every place that
// reads `next` (middleware, /auth/callback, the login page) MUST route the
// value through safeNext before redirecting — the param is attacker-supplied
// (it arrives in a link the victim clicks), so a raw redirect turns the
// trusted app domain into a phishing hop.

const FALLBACK = "/jobs";

// Interior ASCII control chars (C0 range + DEL). The WHATWG URL parser
// STRIPS tab (0x09), LF (0x0A), and CR (0x0D) from anywhere in a URL before
// parsing, so "/<TAB>/evil.com" collapses to "//evil.com" — and the login
// site's router.replace resolves the value RELATIVE to location
// (new URL(next, location.href)), turning that into https://evil.com. The
// startsWith("//") screen can't see it: the stripped char sits between the
// two slashes. trim() only removes LEADING/TRAILING whitespace, never
// interior, so an explicit reject is required. A legitimate redirect path
// never contains a control char; rejecting the whole C0+DEL range is clean
// defense in depth (verified bypass 2026-07-19, caught by adversarial review
// after an earlier version shipped without it). Built via new RegExp with a
// string literal so the source stays plain ASCII (no raw control bytes).
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]");

// A target is safe only if it is an internal absolute path:
//   - contains no ASCII control char (see above);
//   - starts with exactly ONE "/" — a second slash ("//evil.com") is a
//     protocol-relative URL that browsers resolve cross-origin;
//   - contains no backslash — browsers normalize "\" to "/" when resolving
//     redirects, so "/\evil.com" becomes "//evil.com" client-side;
//   - has no ":" before the first "/" — blocks scheme smuggling
//     ("javascript:alert(1)", "data:...", "https://evil.com"). Vacuous while
//     the leading-slash rule holds (a leading "/" puts the first "/" at
//     index 0), but kept as defense in depth should the rules above change.
// Anything else — null, empty, whitespace, external, malformed — falls back
// to the app's default landing page.
export function safeNext(next: string | null | undefined): string {
  if (typeof next !== "string") return FALLBACK;
  const candidate = next.trim();
  if (candidate.length === 0) return FALLBACK;
  if (CONTROL_CHARS.test(candidate)) return FALLBACK;
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return FALLBACK;
  if (candidate.includes("\\")) return FALLBACK;
  const firstColon = candidate.indexOf(":");
  if (firstColon !== -1 && firstColon < candidate.indexOf("/")) return FALLBACK;
  return candidate;
}
