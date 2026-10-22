/**
 * Initial and tint for a CompanyMark. Pure and deterministic: the same company
 * name must always produce the same tile, in every session and on both the
 * server and the client, or lists would flicker on hydration.
 */

/** The four tints from DESIGN §5.1; each --mk-*-bg/-fg pair measures >= 6:1. */
export const COMPANY_MARK_TINTS = ["slate", "teal", "amber", "sky"] as const;

export type CompanyMarkTint = (typeof COMPANY_MARK_TINTS)[number];

/** Shown when a name carries no letter or digit at all. */
export const COMPANY_MARK_FALLBACK = "?";

/**
 * First letter or digit of the name, uppercased.
 *
 * Iterating the string yields code points, not UTF-16 units, so an emoji-led
 * name ("🚀 Rocket Labs") steps past the emoji instead of slicing it in half,
 * and a non-Latin name ("株式会社…") keeps its first character. Uppercasing can
 * expand one character into several ("ß" -> "SS"); only the first survives,
 * because the tile has room for exactly one.
 *
 * Modifier letters (\p{Lm}) are deliberately excluded from \p{L}: a name led by
 * a modifier such as U+02BC or an Arabic tatweel would otherwise tile the
 * modifier on its own, which renders as a stray mark rather than an initial.
 */
export function companyInitial(name: string): string {
  for (const character of name) {
    if (/\p{Lu}|\p{Ll}|\p{Lt}|\p{Lo}|\p{N}/u.test(character)) {
      return Array.from(character.toUpperCase())[0] ?? COMPANY_MARK_FALLBACK;
    }
  }
  return COMPANY_MARK_FALLBACK;
}

/**
 * Stable tint for a name. Case, surrounding whitespace, Unicode composition and
 * invisible formatting characters are all normalised first, so "MongoDB",
 * " mongodb " and a decomposed "Café Co" vs a precomposed one land on the same
 * tile — two job boards spelling a company differently must not produce two
 * different colours.
 */
export function companyTint(name: string): CompanyMarkTint {
  const key = name
    .normalize("NFC")
    .replace(/\p{Cf}/gu, "")
    .trim()
    .toLowerCase();
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    // |0 keeps this in int32 the whole way, so the result cannot drift with
    // string length the way floating-point accumulation would.
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return COMPANY_MARK_TINTS[Math.abs(hash) % COMPANY_MARK_TINTS.length];
}
