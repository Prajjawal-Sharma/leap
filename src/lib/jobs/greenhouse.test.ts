// Unit tests for Greenhouse text cleanup. Runner: Node's built-in node:test
// via tsx (no new dependencies) — `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decodeEntities, stripHtml } from "./greenhouse";

describe("decodeEntities — named, decimal and hex, layer by layer", () => {
  it("decodes a double-encoded ampersand", () =>
    assert.equal(decodeEntities("R&amp;amp;D"), "R&D"));
  it("decodes a single-encoded ampersand", () =>
    assert.equal(decodeEntities("R&amp;D"), "R&D"));
  it("decodes a decimal reference", () =>
    assert.equal(decodeEntities("don&#8217;t"), "don’t"));
  it("decodes a hex reference", () =>
    assert.equal(decodeEntities("a&#x2014;b"), "a—b"));
  it("decodes curly quotes, dashes and bullets by name", () =>
    assert.equal(
      decodeEntities("&lsquo;&rsquo;&ldquo;&rdquo;&ndash;&mdash;&hellip;&bull;&middot;"),
      "‘’“”–—…•·"
    ));
  it("turns &nbsp; into a plain space", () =>
    assert.equal(decodeEntities("a&nbsp;b"), "a b"));
  it("turns &#160; into a plain space", () =>
    assert.equal(decodeEntities("a&#160;b"), "a b"));

  it("leaves an unknown named entity as written", () =>
    assert.equal(decodeEntities("a &foo; b"), "a &foo; b"));
  it("leaves a bare ampersand alone", () =>
    assert.equal(decodeEntities("M&A, AT&T"), "M&A, AT&T"));
  it("leaves out-of-range and control references as written", () => {
    assert.equal(decodeEntities("&#0;"), "&#0;");
    assert.equal(decodeEntities("&#7;"), "&#7;");
    assert.equal(decodeEntities("&#127;"), "&#127;");
    assert.equal(decodeEntities("&#xD800;"), "&#xD800;");
    assert.equal(decodeEntities("&#x110000;"), "&#x110000;");
  });

  it("stops after three layers", () =>
    assert.equal(decodeEntities("&amp;amp;amp;amp;"), "&amp;"));

  it("is idempotent on everything it fully decodes", () => {
    for (const input of [
      "R&amp;amp;D",
      "don&#8217;t",
      "&#x2014;",
      "&rsquo;",
      "a&nbsp;b",
      "a &foo; b",
      "M&A",
      "&amp;lt;5000",
    ]) {
      const once = decodeEntities(input);
      assert.equal(decodeEntities(once), once, input);
    }
  });
});

describe("stripHtml — escaped Greenhouse content to plain text", () => {
  it("decodes R&amp;amp;D inside escaped HTML", () =>
    assert.equal(stripHtml("&lt;p&gt;VPs of R&amp;amp;D&lt;/p&gt;"), "VPs of R&D"));
  it("decodes R&amp;D inside raw HTML", () =>
    assert.equal(stripHtml("<p>VPs of R&amp;D</p>"), "VPs of R&D"));
  it("unescapes the outer layer before stripping tags", () =>
    assert.equal(stripHtml("&lt;p&gt;Hi&lt;/p&gt;"), "Hi"));
  it("keeps list items on their own lines", () =>
    assert.equal(
      stripHtml("&lt;ul&gt;&lt;li&gt;One&lt;/li&gt;&lt;li&gt;Two&lt;/li&gt;&lt;/ul&gt;"),
      "One\n\nTwo"
    ));
  it("decodes &nbsp; and numeric references", () =>
    assert.equal(
      stripHtml("&lt;p&gt;don&amp;#8217;t&amp;nbsp;stop &amp;#x2014; ever&lt;/p&gt;"),
      "don’t stop — ever"
    ));
  it("never turns an unknown entity into a space", () =>
    assert.equal(stripHtml("&lt;p&gt;a&amp;foo;b&lt;/p&gt;"), "a&foo;b"));

  it("still drops style and script blocks", () => {
    assert.equal(stripHtml("<style>p{color:red}</style><p>Hi</p>"), "Hi");
    assert.equal(stripHtml("<script>alert(1)</script><p>Hi</p>"), "Hi");
    assert.equal(
      stripHtml("&lt;script&gt;alert(1)&lt;/script&gt;&lt;p&gt;Hi&lt;/p&gt;"),
      "Hi"
    );
  });

  it("never lets a decoded <script> through as a tag", () => {
    // Encoded text inside raw HTML.
    assert.equal(stripHtml("<p>&lt;script&gt;x&lt;/script&gt;</p>"), "x");
    // Double-encoded inside escaped HTML.
    assert.equal(
      stripHtml("&lt;p&gt;&amp;lt;script&amp;gt;x&amp;lt;/script&amp;gt;&lt;/p&gt;"),
      "x"
    );
    // A tag split around another tag can't reassemble.
    assert.doesNotMatch(
      stripHtml("<p>&lt;scr&lt;b&gt;ipt&gt;x</p>"),
      /<script/i
    );
  });

  it("keeps angle brackets that are plain text", () => {
    // Real snippets from the 2026-10-26 board payloads (Twilio, Cloudflare,
    // Figma, Airbnb); the old `<[^>]*>` residue strip deleted the first two.
    assert.equal(
      stripHtml(
        "&lt;p&gt;based in India &amp;lt;Karnataka, Tamil Nadu and New Delhi&amp;gt;.&lt;/p&gt;"
      ),
      "based in India <Karnataka, Tamil Nadu and New Delhi>."
    );
    assert.equal(
      stripHtml("&lt;ul&gt;&lt;li&gt;Ensure customer satisfaction&lt;/li&gt;&lt;li&gt;&amp;lt; 60% travel&lt;/li&gt;&lt;/ul&gt;"),
      "Ensure customer satisfaction\n\n< 60% travel"
    );
    assert.equal(
      stripHtml("&lt;li&gt;customers (&amp;lt;5000 FTEs) from 0&amp;gt;1&lt;/li&gt;"),
      "customers (<5000 FTEs) from 0>1"
    );
  });

  it("decodes the Airbnb pay-range dash", () =>
    assert.equal(
      stripHtml(
        "&lt;div class=&quot;pay-range&quot;&gt;&lt;span&gt;$102,000&lt;/span&gt;&lt;span class=&quot;divider&quot;&gt;&amp;mdash;&lt;/span&gt;&lt;span&gt;$120,000 USD&lt;/span&gt;&lt;/div&gt;"
      ),
      "$102,000—$120,000 USD"
    ));

  it("collapses blank lines around &nbsp; spacer paragraphs", () =>
    assert.equal(
      stripHtml("&lt;p&gt;One&lt;/p&gt;\n&lt;p&gt;&amp;nbsp;&lt;/p&gt;\n&lt;p&gt;Two&lt;/p&gt;"),
      "One\n\nTwo"
    ));

  it("still drops a single bracketed word — it is indistinguishable from a tag", () =>
    assert.equal(
      stripHtml("&lt;p&gt;based in India &amp;lt;Karnataka&amp;gt;.&lt;/p&gt;"),
      "based in India ."
    ));

  // Ingest strips raw payloads once; it never re-strips stored text. Output
  // that legitimately keeps `<Word, …>` (see above) is not HTML and is left
  // out of this list on purpose.
  it("is idempotent on its own output", () => {
    for (const input of [
      "&lt;p&gt;VPs of R&amp;amp;D&lt;/p&gt;",
      "&lt;li&gt;customers (&amp;lt;5000 FTEs) from 0&amp;gt;1&lt;/li&gt;",
      "&lt;p&gt;don&amp;#8217;t&amp;nbsp;stop&lt;/p&gt;",
      "<p>&lt;script&gt;x&lt;/script&gt;</p>",
    ]) {
      const once = stripHtml(input);
      assert.equal(stripHtml(once), once, input);
    }
  });
});
