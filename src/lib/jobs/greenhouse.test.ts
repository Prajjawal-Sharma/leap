// Unit tests for Greenhouse text cleanup. Runner: Node's built-in node:test
// via tsx (no new dependencies) — `npm test`.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decodeEntities, fetchGreenhouseJobs, stripHtml } from "./greenhouse";

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

  it("never resolves a name through the object prototype", () => {
    for (const name of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"]) {
      assert.equal(decodeEntities(`R&${name};D`), `R&${name};D`);
    }
  });

  it("leaves invisible and bidi references as written", () => {
    for (const ref of [
      "&#x61C;",
      "&#xAD;",
      "&#x180E;",
      "&#x34F;",
      "&#xFFF9;",
      "&#x3164;",
      "&#x200B;",
      "&#x202E;",
      "&#x2066;",
      "&#xFEFF;",
      "&#xE0041;",
      "&#xFFFF;",
      "&#xFDD0;",
      "&#x2028;",
    ]) {
      assert.equal(decodeEntities(ref), ref);
    }
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

  it("strips tags whose attributes use / or newlines as separators", () => {
    // Shapes browsers parse as tags; review round 1 found these surviving.
    for (const input of [
      "&lt;p&gt;&amp;lt;svg/onload=alert(1)&amp;gt;&lt;/p&gt;",
      "&lt;p&gt;&amp;lt;img/src=x/onerror=alert(1)&amp;gt;&lt;/p&gt;",
      "&lt;p&gt;&amp;lt;img&#10;src=x&#10;onerror=alert(1)&amp;gt;&lt;/p&gt;",
      "<p>&lt;img src=x&#10;onerror=alert(1)&gt;</p>",
      "<p>&lt;iframe/src=javascript:alert(1)&gt;</p>",
      '<p>&lt;img alt=&quot;&lt;&quot; src=x onerror=alert(1)&gt;</p>',
      "<p>&lt;script/src=//e.example&gt;&lt;/script&gt;</p>",
    ]) {
      assert.doesNotMatch(stripHtml(input), /<[a-z/!]/i, input);
    }
  });

  // A browser starts markup only at `<` + letter, `/`, `!` or `?`.
  const TAG_OPENER = /<[a-zA-Z/!?]/;

  it("never leaves a tag behind however deeply it is nested", () => {
    const nested = "<p>" + "&lt;".repeat(50) + "b&gt;".repeat(50) + "x</p>";
    assert.doesNotMatch(stripHtml(nested), TAG_OPENER);
    assert.doesNotMatch(stripHtml("<p>&lt;!-- hidden</p><p>rest</p>"), TAG_OPENER);
  });

  it("never reassembles a tag around a removed comment or odd name", () => {
    // Review round 2: shapes the residue grammar doesn't model, and
    // fragments a `<!--` removal used to join back into a live tag.
    for (const inner of [
      "&lt;scr&lt;!--ipt&gt;alert(1)&lt;/scr&lt;!--ipt&gt;",
      "&lt;img&lt;!-- src=x onerror=alert(1)&gt;",
      "&lt;a&lt;!--b&gt;",
      "&lt;!-&lt;!--- hidden &gt;",
      "&lt;a_b&gt;",
      "&lt;svg:x onload=1&gt;",
      "&lt;img&quot;x&quot; onerror=alert(1)&gt;",
      "&lt;img src=x onerror=alert(1) x=a&quot;b&gt;",
      "&lt;!x&gt;",
      "&lt;/1&gt;",
      "&lt;?x&gt;",
      "&lt;img src=x onerror=alert(1)",
    ]) {
      const escaped = "&lt;p&gt;Role&lt;/p&gt;" + inner.replace(/&/g, "&amp;");
      for (const input of [escaped, "<p>Role</p>" + inner]) {
        assert.doesNotMatch(stripHtml(input), TAG_OPENER, input);
      }
    }
  });

  it("stays fast on adversarial runs of unclosed tags", () => {
    for (const input of [
      "<a ".repeat(200_000),
      "<p " .repeat(200_000),
      "<p>" + "&lt;".repeat(20_000) + "b&gt;".repeat(20_000) + "</p>",
      "&lt;p&gt;" + "&amp;lt;a".repeat(20_000) + "&amp;gt;".repeat(20_000) + "&lt;/p&gt;",
      "<p>" + '&lt;a "'.repeat(100_000) + "</p>",
      "</style>" + "<style".repeat(100_000),
      "<script>" + "<script".repeat(100_000),
      "<!--".repeat(200_000),
      "<p>" + "&lt;!--".repeat(200_000) + "</p>",
      "<br" + " ".repeat(500_000),
      // Five-deep nesting hits the residue pass cap, then a long `<` run.
      "&lt;p&gt;x&lt;/p&gt;" +
        "&amp;lt;a".repeat(5) + "&amp;gt;".repeat(5) +
        "&amp;lt;".repeat(150_000) + "1",
      "<p>x</p>" + "&lt;a".repeat(7) + "&gt;".repeat(7) + "&lt;".repeat(150_000) + "1",
    ]) {
      const started = performance.now();
      stripHtml(input);
      assert.ok(performance.now() - started < 1_000, input.slice(0, 20));
    }
  });

  it("keeps angle brackets that are plain text", () => {
    // Real snippets from the 2026-10-26 board payloads (Twilio, Cloudflare,
    // Figma, Airbnb); the old `<[^>]*>` residue strip deleted the first two.
    // A `<` before a letter gains a space so it can never open a tag.
    assert.equal(
      stripHtml(
        "&lt;p&gt;based in India &amp;lt;Karnataka, Tamil Nadu and New Delhi&amp;gt;.&lt;/p&gt;"
      ),
      "based in India < Karnataka, Tamil Nadu and New Delhi>."
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

  it("is idempotent on its own output", () => {
    for (const input of [
      "&lt;p&gt;VPs of R&amp;amp;D&lt;/p&gt;",
      "&lt;p&gt;based in India &amp;lt;Karnataka, Tamil Nadu&amp;gt;.&lt;/p&gt;",
      "&lt;p&gt;Role&lt;/p&gt;&amp;lt;scr&amp;lt;!--ipt&amp;gt;",
      "&lt;li&gt;customers (&amp;lt;5000 FTEs) from 0&amp;gt;1&lt;/li&gt;",
      "&lt;p&gt;don&amp;#8217;t&amp;nbsp;stop&lt;/p&gt;",
      "<p>&lt;script&gt;x&lt;/script&gt;</p>",
    ]) {
      const once = stripHtml(input);
      assert.equal(stripHtml(once), once, input);
    }
  });
});

describe("fetchGreenhouseJobs — titles and locations are decoded", () => {
  const board = (jobs: unknown[]) => async () =>
    new Response(JSON.stringify({ jobs }), { status: 200 });
  const job = (over: Record<string, unknown>) => ({
    id: 1,
    title: "Engineer",
    absolute_url: "https://boards.greenhouse.io/x/jobs/1",
    content: "&lt;p&gt;Body&lt;/p&gt;",
    ...over,
  });

  it("decodes the title and location without stripping tags", async (t) => {
    t.mock.method(
      globalThis,
      "fetch",
      board([
        job({
          title: "Head of R&amp;D &#8212; Platform",
          location: { name: "S&atilde;o Paulo &amp; Remote" },
        }),
      ])
    );
    const [j] = await fetchGreenhouseJobs("mongodb");
    assert.equal(j.title, "Head of R&D — Platform");
    assert.equal(j.location, "S&atilde;o Paulo & Remote");
    assert.equal(j.is_remote, true);
    assert.equal(j.description, "Body");
  });

  it("drops a job whose title decodes to nothing", async (t) => {
    t.mock.method(
      globalThis,
      "fetch",
      board([job({ id: 1, title: "&nbsp;" }), job({ id: 2, title: "Designer" })])
    );
    const jobs = await fetchGreenhouseJobs("figma");
    assert.deepEqual(
      jobs.map((j) => j.source_id),
      ["2"]
    );
  });
});
