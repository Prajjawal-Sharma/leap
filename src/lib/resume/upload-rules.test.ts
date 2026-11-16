// Unit tests for the upload rules. Runner: Node's built-in node:test via tsx
// — `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  capStoredText,
  hasPdfSignature,
  hasReadableText,
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

// What pdf-parse returns for a PDF with no text layer: only its own page
// markers. Captured from pdf-parse 2.4.5 on generated image-only files.
const imageOnly = (pages: number) =>
  Array.from({ length: pages }, (_, i) => `-- ${i + 1} of ${pages} --`).join(
    "\n\n\n\n"
  );
// The same with the line a scanner app stamps on every page.
const stampedScan = (pages: number) =>
  Array.from(
    { length: pages },
    (_, i) => `Scanned by CamScanner\n\n-- ${i + 1} of ${pages} --`
  ).join("\n\n");

const SPARSE_CV = [
  "Rahul Sharma",
  "rahul.sharma@example.com | +91 98765 43210 | Bengaluru",
  "Education",
  "B.Tech, Computer Science — ABC Institute of Technology, 2025",
  "Skills",
  "Java, Python, SQL, React",
  "Projects",
  "Library management system (Java, MySQL)",
  "",
  "-- 1 of 1 --",
].join("\n");

describe("readableLength", () => {
  it("is 0 for an image-only PDF of any length", () => {
    for (const pages of [1, 4, 8, 40]) {
      assert.equal(readableLength(imageOnly(pages)), 0, `${pages} pages`);
    }
  });
  it("counts a line stamped on every page once", () => {
    for (const pages of [1, 6, 40]) {
      assert.equal(readableLength(stampedScan(pages)), 21, `${pages} pages`);
    }
  });
  it("is 0 for empty and blank text", () => {
    assert.equal(readableLength(""), 0);
    assert.equal(readableLength(" \n\t\r\n  "), 0);
  });
  it("counts runs of whitespace as one space and joins lines with one", () => {
    assert.equal(readableLength("a   b\t\tc"), 5);
    assert.equal(readableLength("ab\ncd"), 5);
    assert.equal(readableLength("ab\r\n\r\n   cd   "), 5);
  });
});

describe("hasReadableText", () => {
  it("refuses scans the old 50-character check let through", () => {
    // Four image-only pages are 60 raw characters; six stamped pages are 220.
    assert.ok(imageOnly(4).length >= 50);
    assert.ok(stampedScan(6).length >= 200);
    assert.equal(hasReadableText(imageOnly(4)), false);
    assert.equal(hasReadableText(stampedScan(6)), false);
    assert.equal(hasReadableText(stampedScan(40)), false);
  });
  it("accepts the shortest plausible real résumé", () => {
    assert.ok(readableLength(SPARSE_CV) >= MIN_READABLE_CHARS);
    assert.equal(hasReadableText(SPARSE_CV), true);
  });
  it("draws the line at exactly 200 readable characters", () => {
    assert.equal(MIN_READABLE_CHARS, 200);
    assert.equal(hasReadableText("x".repeat(199)), false);
    assert.equal(hasReadableText("x".repeat(200)), true);
  });
  it("does not count padding towards the threshold", () => {
    assert.equal(hasReadableText(`${" ".repeat(500)}short${"\n".repeat(500)}`), false);
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
