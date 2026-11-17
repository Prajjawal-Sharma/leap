// IMPORTANT: pdf-parse/worker must be imported before pdf-parse — the worker
// entry polyfills browser globals (DOMMatrix, ImageData, …) that pdfjs-dist
// expects but Node's serverless runtime does not provide.
import { CanvasFactory } from "pdf-parse/worker";
import { PDFParse } from "pdf-parse";

// Reading the text of an uploaded PDF, in one place for the two routes that
// do it.
//
// There is no time limit in here, because none can work: in Node pdf.js runs
// on the main thread and passes its work along as promise callbacks, so while
// it reads a document no timer fires and nothing else in the process gets a
// turn. A file can be built to keep it busy for as long as the function is
// allowed to live. The limit is therefore the function's own, and the order
// the routes call this in is what keeps that limit short:
//   - /api/resume/upload reads every file here BEFORE storing it, under a
//     30 s maxDuration. A file that does not finish in that time ends the
//     upload and never reaches storage. Files that do are stored in the
//     user's "checked" folder (storage-path.ts), which only that route can
//     write to.
//   - /api/resume/parse, which may run for 300 s for Gemini's sake, reads
//     only files from that folder — files that already finished here once.
// Do not call this from a long-running route on bytes that did not come
// through the upload route.

/**
 * A résumé is a few pages and the prompt reads 16,000 characters; pages past
 * this are not read at all.
 */
export const MAX_PDF_PAGES = 30;

// Errors from pdf-parse that describe the file itself. Reading it again
// cannot change them. Any other error may pass.
const UNREADABLE_PDF_ERRORS = new Set([
  "InvalidPDFException",
  "PasswordException",
  "FormatError",
]);

/** The file is not a PDF that can be opened, and never will be. */
export class UnreadablePdfError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "UnreadablePdfError";
  }
}

export type PdfText = {
  /** All pages read, with pdf-parse's "-- 1 of 3 --" marker after each. */
  text: string;
  /** The text of each page read, without markers. */
  pages: string[];
};

export async function readPdfText(bytes: Uint8Array): Promise<PdfText> {
  // pdf.js takes over the buffer it is handed; the caller keeps its own.
  const parser = new PDFParse({ data: bytes.slice(), CanvasFactory });
  try {
    const result = await parser.getText({ first: MAX_PDF_PAGES });
    if (result.total < 1) {
      throw new UnreadablePdfError("the PDF has no pages");
    }
    return {
      text: result.text ?? "",
      pages: result.pages.map((page) => page.text ?? ""),
    };
  } catch (err) {
    if (err instanceof Error && UNREADABLE_PDF_ERRORS.has(err.name)) {
      throw new UnreadablePdfError(`${err.name}: ${err.message}`);
    }
    throw err;
  } finally {
    await parser.destroy().catch(() => {});
  }
}
