// Pure helpers for the app shell: who the account menu says you are, and
// which nav item is the current page.

/**
 * The name the account menu shows: profiles.full_name, else the part of the
 * email before "@", else a neutral fallback. Whitespace-only names count as
 * missing.
 */
export function displayName(
  fullName: string | null | undefined,
  email: string | null | undefined
): string {
  const name = (fullName ?? "").replace(/\s+/g, " ").trim();
  if (name) return name;
  const local = (email ?? "").split("@")[0]?.trim() ?? "";
  return local || "Your account";
}

/**
 * Up to two initials for the avatar: first and last word of the name, or the
 * first two letters of a single word. Letters only, so "prajjawal.s" gives
 * "PS" and a stray digit or symbol never becomes an initial. Uses grapheme
 * segmentation so an accented or non-Latin first letter stays whole.
 */
export function initials(name: string): string {
  const words = name
    .split(/[\s._-]+/)
    .map((w) => w.replace(/[^\p{L}\p{M}]/gu, ""))
    .filter(Boolean);
  if (words.length === 0) return "?";
  const first = (w: string) => {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return [...seg.segment(w)][0]?.segment ?? "";
  };
  if (words.length === 1) {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const letters = [...seg.segment(words[0])].map((s) => s.segment);
    return letters.slice(0, 2).join("").toUpperCase();
  }
  return (first(words[0]) + first(words[words.length - 1])).toUpperCase();
}

/** A nav item is current on its own path and any path below it. */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
