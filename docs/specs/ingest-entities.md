fix: decode HTML entities correctly in Greenhouse ingest
deep: false

Commit this spec verbatim as docs/specs/ingest-entities.md in the PR.

## Goal
Job text shows "R D" instead of "R&D", and curly quotes/dashes become spaces. Cause (verify): src/lib/jobs/greenhouse.ts stripHtml decodes entities in one pass — `&amp;` first — so double-encoded input like `&amp;amp;` leaves `&amp;`, which the catch-all `.replace(/&[a-zA-Z0-9#]+;/gi, " ")` then turns into a space; numeric (`&#8217;`, `&#x2014;`) and common named entities (`&rsquo; &lsquo; &ldquo; &rdquo; &mdash; &ndash; &hellip; &bull; &middot;`) are also spaced out. Fix decoding so stored job titles and descriptions read correctly.

## Context verified by recon (TRUE/FALSE with file:line)
- greenhouse.ts:68-110 stripHtml order: remove style/script/comments → structural tags to newlines → strip tags → decode a fixed entity list → catch-all entity → space → strip tag residue.
- Whether Greenhouse `content` is entity-escaped HTML (check one real payload shape in code comments / the fetch path) and whether `title` goes through any decoding.
- Whether re-ingest overwrites description/title for existing rows (upsert on (source, source_id)) — i.e. whether stored "R D" text self-heals on the next 02:00 UTC cron.
- test-strip.mjs at repo root is a stray manual debug script.

## Changes
1. Decode entities properly: unescape the outer layer first when the content is escaped HTML, then strip tags, then decode named + decimal + hex numeric entities in a single pass with a lookup map; repeat decoding until stable (max 3 passes) so double-encoding is handled. Unknown named entities are left as-is (never turned into spaces). Never re-introduce markup: the tag-residue strip still runs after decoding.
2. Apply the same decode to job titles (and company/location if they pass through) — a decode-only helper, no tag stripping on titles.
3. Export the pure helpers and add src/lib/jobs/greenhouse.test.ts with cases: "R&amp;amp;D", "R&amp;D", "&lt;p&gt;Hi&lt;/p&gt;", "don&#8217;t", "&#x2014;", "&rsquo;", "&nbsp;", unknown "&foo;", script/style stripping still works, a decoded "&lt;script&gt;" never becomes a live tag, and idempotence (decoding decoded text changes nothing).
4. Delete test-strip.mjs.
5. If re-ingest does NOT overwrite existing rows, say so and propose (do not run) a one-off fix — no migrations, no DB writes from the agent.

## Do NOT touch
Chat, AI, auth, middleware, UI, theme, gate.sh, package.json, migrations, embeddings logic.

## Acceptance
- gate.sh green with the new tests.
- Before/after output of stripHtml on 3 real-looking samples pasted in the PR.
- Human must do: after merge + release, the next ingest cron (02:00 UTC) — check one MongoDB job containing "R&D" reads correctly in /jobs.
