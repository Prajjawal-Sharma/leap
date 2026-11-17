// Unit tests for the upload rules. Runner: Node's built-in node:test via tsx
// — `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  capStoredText,
  fullestPageLength,
  hasPdfSignature,
  hasReadableText,
  jsonbSafe,
  MAX_STORED_TEXT_CHARS,
  MAX_UPLOAD_BYTES,
  MIN_READABLE_CHARS,
  NO_TEXT_MESSAGE,
  parseErrorMessage,
  PDF_SIGNATURE_WINDOW,
  readableLength,
  UNREADABLE_PDF_MESSAGE,
  UPLOAD_NOT_PDF_MESSAGE,
  UPLOAD_TOO_LARGE_MESSAGE,
  withoutResumeText,
} from "./upload-rules";

const bytes = (s: string) => new Uint8Array(Buffer.from(s, "latin1"));

describe("upload size", () => {
  it("is 4 MB, the number the resumes bucket is given in migration 0008", () => {
    assert.equal(MAX_UPLOAD_BYTES, 4194304);
  });
  it("is named in the message a refused file gets", () => {
    assert.match(UPLOAD_TOO_LARGE_MESSAGE, /4 MB/);
    assert.match(UPLOAD_NOT_PDF_MESSAGE, /isn't a PDF/);
  });
});

describe("hasPdfSignature", () => {
  it("accepts a file that starts with %PDF-", () => {
    assert.equal(hasPdfSignature(bytes("%PDF-1.7\n%âãÏÓ\n1 0 obj")), true);
  });
  it("accepts the header after leading bytes, as PDF readers do", () => {
    assert.equal(hasPdfSignature(bytes("ï»¿\r\n%PDF-1.4")), true);
    assert.equal(hasPdfSignature(bytes(`${"x".repeat(900)}%PDF-1.4`)), true);
  });
  it("accepts a header that ends exactly at byte 1,024", () => {
    const start = PDF_SIGNATURE_WINDOW - "%PDF-".length;
    assert.equal(hasPdfSignature(bytes(`${" ".repeat(start)}%PDF-1.4`)), true);
  });
  it("rejects a header that crosses or starts after byte 1,024", () => {
    const start = PDF_SIGNATURE_WINDOW - "%PDF-".length + 1;
    assert.equal(hasPdfSignature(bytes(`${" ".repeat(start)}%PDF-1.4`)), false);
    assert.equal(hasPdfSignature(bytes(`${" ".repeat(5000)}%PDF-1.4`)), false);
  });
  it("rejects a text file renamed to .pdf", () => {
    assert.equal(hasPdfSignature(bytes("Jane Doe\nSoftware Engineer\n")), false);
  });
  it("rejects near misses, short input and nothing at all", () => {
    assert.equal(hasPdfSignature(bytes("%PDF 1.4")), false);
    assert.equal(hasPdfSignature(bytes("%pdf-1.4")), false);
    assert.equal(hasPdfSignature(bytes("PDF-1.4")), false);
    assert.equal(hasPdfSignature(bytes("%PDF")), false);
    assert.equal(hasPdfSignature(new Uint8Array(0)), false);
  });
  it("gives the same answer for the first 1,024 bytes as for the whole file", () => {
    const whole = bytes(`${"x".repeat(300)}%PDF-1.4${"y".repeat(5000)}`);
    const head = whole.subarray(0, PDF_SIGNATURE_WINDOW);
    assert.equal(hasPdfSignature(head), hasPdfSignature(whole));
    assert.equal(hasPdfSignature(head), true);
  });
});

// One page of a scan, as pdf-parse returns it: nothing, or whatever the
// scanner wrote on it as text.
const STAMP = "Scanned by CamScanner";
const stampedPage = (n: number, total: number) =>
  [STAMP, `Page ${n} of ${total}`, `2026-11-16 10:32:${String(n).padStart(2, "0")}`].join("\n");
const scan = (pages: number, page: (n: number, total: number) => string) =>
  Array.from({ length: pages }, (_, i) => page(i + 1, pages));
// The whole-file text for the same scans, with pdf-parse's page markers.
const wholeFile = (pages: string[]) =>
  pages.map((text, i) => `${text}\n-- ${i + 1} of ${pages.length} --\n\n`).join("");

// The sparse-but-real fresher CV from schemas.test.ts (Pitfall 3), which
// ResumeParseAndScoreSchema is written to accept, as the page it came from.
const FRESHER_CV = [
  "Meera Iyer",
  "meera@example.com",
  "Education",
  "B.Sc, Anna University, 2026",
  "Certifications",
  "Google Data Analytics Certificate",
].join("\n");
const FRESHER_CV_NO_HEADINGS = [
  "Meera Iyer",
  "meera@example.com",
  "B.Sc, Anna University, 2026",
  "Google Data Analytics Certificate",
].join("\n");

const SHORT_CV = [
  "Rahul Sharma",
  "rahul.sharma@example.com | +91 98765 43210 | Bengaluru",
  "Education",
  "B.Tech, Computer Science — ABC Institute of Technology, 2025",
  "Skills",
  "Java, Python, SQL, React",
  "Projects",
  "Library management system (Java, MySQL)",
].join("\n");

describe("readableLength", () => {
  it("is 0 for empty and blank text", () => {
    assert.equal(readableLength(""), 0);
    assert.equal(readableLength(" \n\t\r\n  "), 0);
  });
  it("does not count pdf-parse's page markers", () => {
    assert.equal(readableLength("-- 1 of 4 --"), 0);
    assert.equal(readableLength("-- 12 of 40 --\n\n\n\n-- 13 of 40 --"), 0);
    assert.equal(readableLength("Jane Doe\n-- 1 of 1 --\n\n"), 8);
  });
  it("counts runs of whitespace as one space and joins lines with one", () => {
    assert.equal(readableLength("a   b\t\tc"), 5);
    assert.equal(readableLength("ab\ncd"), 5);
    assert.equal(readableLength("ab\r\n\r\n   cd   "), 5);
    assert.equal(readableLength("ab\rcd"), 5);
  });
  it("counts every line, repeated or not, and text set one character a line", () => {
    assert.equal(readableLength("2021\n2021\n2021"), 14);
    assert.equal(readableLength("J\na\nn\ne"), 7);
  });
  it("measures the sample résumés used below", () => {
    assert.equal(readableLength(FRESHER_CV), 115);
    assert.equal(readableLength(FRESHER_CV_NO_HEADINGS), 90);
    assert.equal(readableLength(SHORT_CV), 219);
    assert.equal(readableLength(stampedPage(3, 12)), 54);
  });
});

describe("fullestPageLength", () => {
  it("is the readable length of the page with the most text", () => {
    assert.equal(fullestPageLength(["", SHORT_CV, "References on request"]), 219);
  });
  it("is 0 for no pages and for pages with no text", () => {
    assert.equal(fullestPageLength([]), 0);
    assert.equal(fullestPageLength(["", "  \n ", ""]), 0);
  });
  it("does not grow with the number of pages", () => {
    assert.equal(fullestPageLength(scan(1, () => STAMP)), 21);
    assert.equal(fullestPageLength(scan(40, () => STAMP)), 21);
  });
});

describe("hasReadableText", () => {
  it("draws the line at 80 readable characters on one page", () => {
    assert.equal(MIN_READABLE_CHARS, 80);
    assert.equal(hasReadableText(["x".repeat(79)]), false);
    assert.equal(hasReadableText(["x".repeat(80)]), true);
    assert.equal(hasReadableText(["x".repeat(79), "y".repeat(79)]), false);
  });
  it("refuses an image-only PDF of any length", () => {
    for (const pages of [1, 4, 40]) {
      assert.equal(hasReadableText(scan(pages, () => "")), false, `${pages} pages`);
    }
    assert.equal(hasReadableText([]), false);
  });
  it("refuses a scan stamped on every page, however many pages", () => {
    for (const pages of [1, 6, 40]) {
      assert.equal(hasReadableText(scan(pages, () => STAMP)), false, `${pages} pages`);
    }
  });
  it("refuses a scan whose stamp differs on every page", () => {
    // Adding the pages up, as a whole-file total does, would let these through.
    const pages = scan(12, stampedPage);
    assert.ok(readableLength(wholeFile(pages)) > 600);
    assert.equal(hasReadableText(pages), false);
  });
  it("refuses scans the old 50-character check on the whole file let through", () => {
    assert.ok(wholeFile(scan(4, () => "")).trim().length >= 50);
    assert.ok(wholeFile(scan(3, () => STAMP)).trim().length >= 50);
    assert.equal(hasReadableText(scan(4, () => "")), false);
    assert.equal(hasReadableText(scan(3, () => STAMP)), false);
  });
  it("accepts the sparse résumé the parse schema is written to accept", () => {
    assert.equal(hasReadableText([FRESHER_CV]), true);
    assert.equal(hasReadableText([FRESHER_CV_NO_HEADINGS]), true);
  });
  it("accepts short résumés, in any script", () => {
    assert.equal(hasReadableText([SHORT_CV]), true);
    assert.equal(
      hasReadableText([
        "मीरा अय्यर\nmeera@example.com\nशिक्षा\nबी.एससी, अन्ना विश्वविद्यालय, 2026\nप्रमाणपत्र\nगूगल डेटा एनालिटिक्स सर्टिफिकेट",
      ]),
      true
    );
  });
  it("accepts a résumé whose text sits on a later page", () => {
    assert.equal(hasReadableText(["", STAMP, SHORT_CV]), true);
  });
  it("does not count padding towards the threshold", () => {
    assert.equal(hasReadableText([`${" ".repeat(500)}short${"\n".repeat(500)}`]), false);
  });
});

describe("capStoredText", () => {
  it("leaves shorter text alone", () => {
    assert.equal(capStoredText("Jane Doe — résumé"), "Jane Doe — résumé");
  });
  it("cuts at 16,000 characters", () => {
    assert.equal(MAX_STORED_TEXT_CHARS, 16000);
    assert.equal(capStoredText("a".repeat(16000)).length, 16000);
    assert.equal(capStoredText("a".repeat(50000)).length, 16000);
  });
  it("removes NUL, which Postgres jsonb cannot store", () => {
    assert.equal(capStoredText("Ja\u0000ne\u0000"), "Jane");
  });
  it("never leaves half a surrogate pair at the cut", () => {
    const capped = capStoredText(`${"a".repeat(15999)}😀tail`);
    assert.equal(capped.length, 16000);
    assert.equal(capped.isWellFormed(), true);
    assert.equal(capped.endsWith("�"), true);
  });
  it("replaces unpaired surrogates anywhere in the text", () => {
    const capped = capStoredText("ok \ud83d and \ude00 done 😀");
    assert.equal(capped, "ok � and � done 😀");
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(capped)));
  });
});

describe("jsonbSafe", () => {
  it("cleans every string in a parsed résumé, however deep", () => {
    const cleaned = jsonbSafe({
      full_name: "Ra\u0000hul",
      skills: ["Ja\ud83dva", "SQL"],
      experience: [{ company: "Ac\u0000me", role: "Engineer \ude00" }],
    });
    assert.deepEqual(cleaned, {
      full_name: "Rahul",
      skills: ["Ja�va", "SQL"],
      experience: [{ company: "Acme", role: "Engineer �" }],
    });
    assert.equal(JSON.stringify(cleaned).includes("\\u0000"), false);
  });
  it("leaves numbers, booleans, null and clean text as they are", () => {
    const value = {
      score: 74,
      signals: { has_summary: true, word_count: 310 },
      verdict: "Solid — résumé 😀",
      missing: null,
    };
    assert.deepEqual(jsonbSafe(value), value);
  });
  it("does not change the value it was given", () => {
    const value = { full_name: "Ra\u0000hul", skills: ["a\u0000"] };
    jsonbSafe(value);
    assert.equal(value.full_name, "Ra\u0000hul");
    assert.equal(value.skills[0], "a\u0000");
  });
});

describe("parseErrorMessage", () => {
  it("gives the scan message for no_text, word for word", () => {
    assert.equal(
      parseErrorMessage("no_text"),
      "We couldn't read text from this PDF — it may be a scan. Export your résumé as a text-based PDF and upload it again."
    );
    assert.equal(parseErrorMessage("no_text"), NO_TEXT_MESSAGE);
  });
  it("gives the unreadable message for unreadable and for anything unknown", () => {
    assert.equal(parseErrorMessage("unreadable"), UNREADABLE_PDF_MESSAGE);
    assert.equal(parseErrorMessage("something_new"), UNREADABLE_PDF_MESSAGE);
    assert.equal(parseErrorMessage(null), UNREADABLE_PDF_MESSAGE);
    assert.equal(parseErrorMessage(undefined), UNREADABLE_PDF_MESSAGE);
  });
});

describe("withoutResumeText", () => {
  it("removes only the raw extracted text", () => {
    const parsed = {
      full_name: "Jane Doe",
      skills: ["Go", "SQL"],
      experience: [{ company: "Acme", role: "Engineer" }],
      _resume_text: "Jane Doe\nEngineer at Acme…",
    };
    assert.deepEqual(withoutResumeText(parsed), {
      full_name: "Jane Doe",
      skills: ["Go", "SQL"],
      experience: [{ company: "Acme", role: "Engineer" }],
    });
  });
  it("does not change the object it was given", () => {
    const parsed = { full_name: "Jane Doe", _resume_text: "text" };
    withoutResumeText(parsed);
    assert.equal(parsed._resume_text, "text");
  });
  it("passes through a row that was never parsed, and anything not an object", () => {
    assert.equal(withoutResumeText(null), null);
    assert.equal(withoutResumeText(undefined), undefined);
    assert.equal(withoutResumeText("text"), "text");
    assert.deepEqual(withoutResumeText(["_resume_text"]), ["_resume_text"]);
  });
});
