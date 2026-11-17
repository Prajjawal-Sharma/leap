// What an uploaded résumé has to be — small enough, a real PDF, with text
// that can be read — and what is kept of that text. Shared by the upload
// route, the parse route and the Resume page, so the browser and the server
// refuse the same files with the same words.

// --- size -------------------------------------------------------------------

/**
 * 4 MB. Vercel rejects request bodies over 4.5 MB before the route runs, with
 * a response the page cannot read, so the app's own limit sits below that.
 * The `resumes` bucket carries the same number (migration 0008).
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export const UPLOAD_TOO_LARGE_MESSAGE =
  "This file is larger than 4 MB. Export a smaller PDF and upload it again.";

// --- signature --------------------------------------------------------------

export const UPLOAD_NOT_PDF_MESSAGE =
  "This file isn't a PDF. Export your résumé as a PDF and upload it again.";

/**
 * PDF readers accept the header anywhere in the first 1,024 bytes, because
 * some producers write a few bytes ahead of it. The browser only has to read
 * this much of the file to run the same check as the server.
 */
export const PDF_SIGNATURE_WINDOW = 1024;

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/**
 * True when "%PDF-" lies wholly inside the first 1,024 bytes. The declared
 * MIME type proves nothing: a text file renamed to .pdf is sent as
 * application/pdf.
 */
export function hasPdfSignature(bytes: Uint8Array): boolean {
  const lastStart =
    Math.min(bytes.length, PDF_SIGNATURE_WINDOW) - PDF_SIGNATURE.length;
  for (let start = 0; start <= lastStart; start++) {
    if (PDF_SIGNATURE.every((byte, i) => bytes[start + i] === byte)) {
      return true;
    }
  }
  return false;
}

// --- extracted text ---------------------------------------------------------

/** Why a résumé can never be processed, as stored in resumes.parse_error. */
export type ParseErrorCode = "no_text" | "unreadable";

export const NO_TEXT_MESSAGE =
  "We couldn't read text from this PDF — it may be a scan. Export your résumé as a text-based PDF and upload it again.";

export const UNREADABLE_PDF_MESSAGE =
  "We couldn't open this PDF. Export your résumé as a PDF again and upload it.";

/** For an upload that the platform stopped while the PDF was being read. */
export const SLOW_PDF_MESSAGE =
  "This PDF took too long to read. Export your résumé as a PDF again and upload it.";

/** The message for a stored parse_error; an unknown code reads as unreadable. */
export function parseErrorMessage(code: string | null | undefined): string {
  return code === "no_text" ? NO_TEXT_MESSAGE : UNREADABLE_PDF_MESSAGE;
}

/**
 * A PDF is treated as a scan when none of its pages has this many readable
 * characters.
 *
 * The measure is the fullest page, not the whole file, because what a scan
 * carries as text is a little on every page: pdf-parse's own marker ("-- 1
 * of 4 --"), a scanner app's stamp, a page label, a timestamp. Added up over
 * pages those pass any total — four image-only pages are 60 raw characters
 * and passed the 50-character check this replaces, spending a Gemini call on
 * nothing — while one page of them stays in the tens. A line repeated on a
 * page (a tiled watermark) is counted once, for the same reason.
 *
 * The number is a trade between two mistakes, and both still happen at the
 * edges. A stamp, a page label and a timestamp on one page come to under 60
 * characters; a scan carrying more distinct text than that on one page gets
 * through and costs a Gemini call each time it is retried. On the other side,
 * the sparse fresher CV the parse schema is tested against (schemas.test.ts:
 * a name, an email, one degree, one certificate) is 90 characters as bare
 * lines and 115 with its two headings, and passes; a real résumé with less
 * than that on every page — or the same content in a denser script such as
 * Chinese — is refused, permanently, with a message about scans that is wrong
 * for it. Pitfall 3 (sparse real data must pass) is why the line is here and
 * not at the 200 first proposed.
 */
export const MIN_READABLE_CHARS = 80;

const PAGE_MARKER_RE = /^-- \d+ of \d+ --$/;

/**
 * Length of the text a person would recognise as content: blank lines and
 * pdf-parse page markers dropped, a line that repeats counted once, runs of
 * whitespace counted as one space.
 */
export function readableLength(text: string): number {
  const seen = new Set<string>();
  let length = 0;
  for (const raw of text.split(/\r\n?|\n/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (line.length === 0 || PAGE_MARKER_RE.test(line) || seen.has(line)) {
      continue;
    }
    seen.add(line);
    length += line.length + (length > 0 ? 1 : 0);
  }
  return length;
}

/** Readable length of the page with the most text; 0 for no pages. */
export function fullestPageLength(pages: string[]): number {
  return pages.reduce((max, page) => Math.max(max, readableLength(page)), 0);
}

/** False for a scan: no page has enough text to be a page of a résumé. */
export function hasReadableText(pages: string[]): boolean {
  return fullestPageLength(pages) >= MIN_READABLE_CHARS;
}

/**
 * The parse prompt reads at most this much of a résumé, so nothing past it
 * is worth keeping.
 */
export const MAX_STORED_TEXT_CHARS = 16_000;

/**
 * The copy of the extracted text kept in parsed_content._resume_text: capped,
 * and safe to store. Postgres jsonb rejects NUL and unpaired surrogates,
 * which PDFs with broken font maps do produce and which a cut in the middle
 * of a surrogate pair would create; either would fail the save after the
 * Gemini call was already spent.
 */
export function capStoredText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .slice(0, MAX_STORED_TEXT_CHARS)
    .toWellFormed();
}

/**
 * A copy of a JSON value with every string made storable in Postgres jsonb.
 * The model's reply is built from the same extracted text, so it can carry
 * the same NULs and unpaired surrogates into the fields it returns; the
 * schema accepts them and the save would then fail on every retry.
 */
export function jsonbSafe<T>(value: T): T {
  if (typeof value === "string") {
    return value.replace(/\u0000/g, "").toWellFormed() as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => jsonbSafe(item)) as T;
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, jsonbSafe(item)])
    ) as T;
  }
  return value;
}

/**
 * parsed_content as it leaves the server: every parsed field, without the
 * raw extracted text kept beside them for scoring.
 */
export function withoutResumeText(parsed: unknown): unknown {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return parsed;
  }
  const rest: Record<string, unknown> = { ...parsed };
  delete rest._resume_text;
  return rest;
}
