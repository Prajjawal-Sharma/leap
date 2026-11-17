// Tests for reading PDF text, on PDFs built here and read by the real
// pdf-parse. Runner: Node's built-in node:test via tsx — `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MAX_PDF_PAGES, readPdfText, UnreadablePdfError } from "./pdf-text";
import { fullestPageLength, hasReadableText } from "./upload-rules";

// A minimal PDF: one content stream per page, Helvetica for any text.
function buildPdf(pageContents: string[], leadingBytes = ""): Uint8Array {
  const count = pageContents.length;
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageContents
      .map((_, i) => `${3 + i * 2} 0 R`)
      .join(" ")}] /Count ${count} >>`,
  ];
  pageContents.forEach((content, i) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 ${3 + count * 2} 0 R >> >> >>`
    );
    objects.push(
      `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
    );
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let out = `${leadingBytes}%PDF-1.4\n`;
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}

const textPage = (lines: string[]) =>
  `BT /F1 10 Tf 40 750 Td 14 TL ${lines.map((l) => `(${l}) Tj T*`).join(" ")} ET`;
// A grey rectangle and no text: what a scanned page is to a text extractor.
const IMAGE_PAGE = "0.9 g 0 0 612 792 re f";

const FRESHER_CV = [
  "Meera Iyer",
  "meera@example.com",
  "Education",
  "B.Sc, Anna University, 2026",
  "Certifications",
  "Google Data Analytics Certificate",
];

describe("readPdfText", () => {
  it("returns the text of each page, and all of it with a marker after each page", async () => {
    const pdf = buildPdf([
      textPage(["Jane Doe", "Software Engineer"]),
      textPage(["Skills: Go, SQL"]),
    ]);
    const { text, pages } = await readPdfText(pdf);
    assert.deepEqual(pages, ["Jane Doe\nSoftware Engineer", "Skills: Go, SQL"]);
    assert.equal(
      text,
      "Jane Doe\nSoftware Engineer\n\n-- 1 of 2 --\n\nSkills: Go, SQL\n\n-- 2 of 2 --\n\n"
    );
  });

  it("gives empty pages for a PDF with no text layer", async () => {
    const { text, pages } = await readPdfText(buildPdf([IMAGE_PAGE, IMAGE_PAGE, IMAGE_PAGE]));
    assert.deepEqual(pages, ["", "", ""]);
    // The whole-file text is not empty: it is page markers, 44 characters of
    // them here, which is why the scan test looks at pages.
    assert.equal(text.trim().length, 44);
    assert.equal(hasReadableText(pages), false);
  });

  it("reads no more than the first 30 pages", async () => {
    const pdf = buildPdf(
      Array.from({ length: MAX_PDF_PAGES + 1 }, (_, i) => textPage([`Page ${i + 1}`]))
    );
    const { text, pages } = await readPdfText(pdf);
    assert.equal(pages.length, MAX_PDF_PAGES);
    assert.equal(pages[MAX_PDF_PAGES - 1], "Page 30");
    assert.ok(text.includes("-- 30 of 31 --"));
    assert.ok(!text.includes("Page 31"));
  });

  it("reads a PDF whose header is not at the first byte", async () => {
    const pdf = buildPdf([textPage(["Jane Doe"])], "ï»¿\r\n" + " ".repeat(95));
    assert.deepEqual((await readPdfText(pdf)).pages, ["Jane Doe"]);
  });

  it("leaves the caller's bytes usable", async () => {
    const pdf = buildPdf([textPage(["Jane Doe"])]);
    const before = pdf.length;
    await readPdfText(pdf);
    assert.equal(pdf.length, before);
    assert.equal(Buffer.from(pdf.subarray(0, 5)).toString("latin1"), "%PDF-");
  });

  it("throws UnreadablePdfError for a file that is not a PDF", async () => {
    const notPdf = new Uint8Array(Buffer.from("Jane Doe\nSoftware Engineer\n".repeat(20)));
    await assert.rejects(readPdfText(notPdf), UnreadablePdfError);
  });

  it("throws UnreadablePdfError for a file with the header and nothing else that parses", async () => {
    const broken = new Uint8Array(
      Buffer.from("%PDF-1.4\nthis is not really a pdf at all\n".repeat(30))
    );
    await assert.rejects(readPdfText(broken), UnreadablePdfError);
  });
});

describe("the scan test on text read from real PDFs", () => {
  it("accepts the sparse fresher CV the parse schema is tested against", async () => {
    const { pages } = await readPdfText(buildPdf([textPage(FRESHER_CV)]));
    assert.equal(fullestPageLength(pages), 115);
    assert.equal(hasReadableText(pages), true);
  });

  it("refuses a twelve-page scan with a stamp, a page label and a timestamp on every page", async () => {
    const pdf = buildPdf(
      Array.from({ length: 12 }, (_, i) =>
        [
          IMAGE_PAGE,
          textPage([
            "Scanned by CamScanner",
            `Page ${i + 1} of 12`,
            `2026-11-16 10:32:${String(i).padStart(2, "0")}`,
          ]),
        ].join("\n")
      )
    );
    const { text, pages } = await readPdfText(pdf);
    assert.equal(pages.length, 12);
    assert.ok(text.trim().length > 600, "the whole-file text is long");
    assert.ok(fullestPageLength(pages) < 60);
    assert.equal(hasReadableText(pages), false);
  });
});
