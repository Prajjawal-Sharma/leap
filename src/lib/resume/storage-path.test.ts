// Unit tests for résumé storage paths. Runner: Node's built-in node:test via
// tsx — `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildStoragePath,
  isOwnStoragePath,
  safeFileName,
} from "./storage-path";

const ME = "1a2b3c4d-1111-4111-8111-aaaaaaaaaaaa";
const VICTIM = "9f8e7d6c-2222-4222-8222-bbbbbbbbbbbb";
const OBJECT_URL = "https://project.supabase.co/storage/v1/object/resumes/";

describe("safeFileName", () => {
  it("keeps letters, digits, dot, underscore and hyphen", () => {
    assert.equal(safeFileName("Jane_Doe-CV.v2.pdf"), "Jane_Doe-CV.v2.pdf");
  });
  it("replaces each run of anything else with one underscore", () => {
    assert.equal(safeFileName("résumé final (2).pdf"), "r_sum_final_2_.pdf");
    assert.equal(safeFileName("../../etc/passwd"), ".._.._etc_passwd");
  });
  it("cuts the name at 120 characters", () => {
    assert.equal(safeFileName(`${"a".repeat(300)}.pdf`).length, 120);
  });
  it("falls back to a fixed name when nothing is left", () => {
    assert.equal(safeFileName(""), "resume.pdf");
  });
});

describe("buildStoragePath", () => {
  it("is the user's folder, then the timestamp and the safe name", () => {
    assert.equal(
      buildStoragePath(ME, "Jane Doe CV.pdf", 1700000000000),
      `${ME}/1700000000000-Jane_Doe_CV.pdf`
    );
  });
  it("always produces a path the ownership check accepts", () => {
    const names = [
      "cv.pdf",
      "",
      ".",
      "..",
      "../../etc/passwd",
      "..\\..\\secret.pdf",
      "%2e%2e/%2e%2e/x.pdf",
      ".hidden",
      "résumé final (2).pdf",
      "a b\tc\nd.pdf",
      "x?download=1#top.pdf",
      "a".repeat(500),
    ];
    for (const name of names) {
      const path = buildStoragePath(ME, name, 1700000000000);
      assert.equal(isOwnStoragePath(path, ME), true, `rejected: ${path}`);
    }
  });
});

describe("isOwnStoragePath", () => {
  it("accepts a path the upload route wrote", () => {
    assert.equal(isOwnStoragePath(`${ME}/1700000000000-cv.pdf`, ME), true);
  });
  it("accepts plain sub-folders", () => {
    assert.equal(isOwnStoragePath(`${ME}/tailored/job-42/cv_v2.pdf`, ME), true);
  });

  it("rejects another user's folder", () => {
    assert.equal(isOwnStoragePath(`${VICTIM}/1700000000000-cv.pdf`, ME), false);
  });

  // Each of these starts with the caller's own folder, so a prefix check
  // passes it, and each resolves somewhere else once it is part of a URL.
  const traversals = [
    `${ME}/../${VICTIM}/1700000000000-cv.pdf`,
    `${ME}/%2e%2e/${VICTIM}/1700000000000-cv.pdf`,
    `${ME}/.%2E/${VICTIM}/1700000000000-cv.pdf`,
    `${ME}/a/../../${VICTIM}/1700000000000-cv.pdf`,
    `${ME}/..\\${VICTIM}\\1700000000000-cv.pdf`,
  ];
  for (const path of traversals) {
    it(`rejects ${path.slice(ME.length)}`, () => {
      assert.equal(path.startsWith(`${ME}/`), true);
      assert.equal(
        new URL(OBJECT_URL + path).pathname,
        `/storage/v1/object/resumes/${VICTIM}/1700000000000-cv.pdf`
      );
      assert.equal(isOwnStoragePath(path, ME), false);
    });
  }

  it("rejects dot segments, hidden names and empty segments", () => {
    for (const rest of [".", "..", "./cv.pdf", ".env", "a/.b", "", "a//b", "a/", "/a"]) {
      assert.equal(isOwnStoragePath(`${ME}/${rest}`, ME), false, rest);
    }
  });
  it("rejects characters that change how a URL is read", () => {
    for (const rest of [
      "cv.pdf?download=1",
      "cv.pdf#frag",
      "a\\b.pdf",
      "a b.pdf",
      "a%2fb.pdf",
      "cv.pdf\n",
      "cv\u0000.pdf",
      "cv\t.pdf",
      "rés.pdf",
    ]) {
      assert.equal(isOwnStoragePath(`${ME}/${rest}`, ME), false, rest);
    }
  });
  it("rejects the folder itself and anything outside it", () => {
    assert.equal(isOwnStoragePath(ME, ME), false);
    assert.equal(isOwnStoragePath(`${ME}/`, ME), false);
    assert.equal(isOwnStoragePath(`/${ME}/cv.pdf`, ME), false);
    assert.equal(isOwnStoragePath(`x/${ME}/cv.pdf`, ME), false);
    assert.equal(isOwnStoragePath(`${ME}x/cv.pdf`, ME), false);
    assert.equal(isOwnStoragePath(`${ME.toUpperCase()}/cv.pdf`, ME), false);
  });
  it("rejects values that are not strings", () => {
    for (const value of [null, undefined, 42, {}, [`${ME}/cv.pdf`]]) {
      assert.equal(isOwnStoragePath(value, ME), false);
    }
  });
  it("rejects every path when the user id is not a uuid", () => {
    assert.equal(isOwnStoragePath("/cv.pdf", ""), false);
    assert.equal(isOwnStoragePath("a/cv.pdf", "a"), false);
    assert.equal(isOwnStoragePath("../cv.pdf", ".."), false);
    assert.equal(
      isOwnStoragePath(`${ME.toUpperCase()}/cv.pdf`, ME.toUpperCase()),
      false
    );
  });

  it("only accepts paths that stay in the user's folder as a URL", () => {
    for (const rest of ["1700000000000-cv.pdf", "a/b/c.pdf", "-x", "_x.y-z"]) {
      const path = `${ME}/${rest}`;
      assert.equal(isOwnStoragePath(path, ME), true, rest);
      assert.equal(
        new URL(OBJECT_URL + path).pathname,
        `/storage/v1/object/resumes/${path}`
      );
    }
  });
});
