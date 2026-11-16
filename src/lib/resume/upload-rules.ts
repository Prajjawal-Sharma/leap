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

/** The message for a stored parse_error; an unknown code reads as unreadable. */
export function parseErrorMessage(code: string | null | undefined): string {
  return code === "no_text" ? NO_TEXT_MESSAGE : UNREADABLE_PDF_MESSAGE;
}

/**
 * Fewer readable characters than this and the PDF is treated as a scan.
 *
 * Measured with readableLength, not the raw length: pdf-parse adds a marker
 * for every page ("-- 1 of 4 --"), so an image-only PDF of four pages is 60
 * raw characters and passed the 50-character check this replaces, spending a
 * Gemini call on nothing. Scanner apps also stamp a line on every page.
 * With markers and repeated lines left out an image-only file measures 0 and
 * a stamped scan about 21 at any page count, while the shortest real résumé —
 * name, contact line, one degree, a few skills, one project — is a little
 * over 200. Below roughly 30 words there is nothing to parse, score or match
 * on either.
 */
export const MIN_READABLE_CHARS = 200;

const PAGE_MARKER_RE = /^-- \d+ of \d+ --$/;

/**
 * Length of the text a person would recognise as content: page markers and
 * blank lines dropped, a line that repeats counted once, runs of whitespace
 * counted as one space.
 */
export function readableLength(text: string): number {
  const seen = new Set<string>();
  let length = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (line.length === 0 || PAGE_MARKER_RE.test(line) || seen.has(line)) {
      continue;
    }
    seen.add(line);
    length += line.length + (length > 0 ? 1 : 0);
  }
  return length;
}

export function hasReadableText(text: string): boolean {
  return readableLength(text) >= MIN_READABLE_CHARS;
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
