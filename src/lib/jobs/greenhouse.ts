import type { NormalizedJob } from "./normalize";

// Greenhouse public board API — no auth required.
//   GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true
//
// `content` is the full job posting (responsibilities, requirements, perks,
// etc.) as entity-ESCAPED HTML: the payload carries `&lt;p&gt;R&amp;amp;D&lt;/p&gt;`,
// not `<p>R&amp;D</p>` (true of all 4,310 jobs across our 20 boards when
// checked on 2026-10-26). We strip it to plain text before storing so the
// jobs.description column stays human-readable for downstream embedding.
// `title` and `location.name` arrive unescaped but are entity-decoded anyway.
const GREENHOUSE_BASE = "https://boards-api.greenhouse.io/v1/boards";
const REQUEST_TIMEOUT_MS = 15_000;

type GreenhouseJob = {
  id: number | string;
  title: string;
  location?: { name?: string | null } | null;
  content?: string | null;
  absolute_url: string;
  updated_at?: string | null;
  departments?: Array<{ name?: string | null } | null> | null;
  offices?: Array<{ name?: string | null } | null> | null;
  metadata?: unknown;
};

type GreenhouseResponse = {
  jobs?: GreenhouseJob[];
};

// Slugs whose default title-case rendering is wrong. Add new entries here as
// we onboard companies whose brand capitalization isn't a straight Title-Case
// of the slug.
const COMPANY_OVERRIDES: Record<string, string> = {
  stripe: "Stripe",
  airbnb: "Airbnb",
  figma: "Figma",
  gitlab: "GitLab",
  mongodb: "MongoDB",
  // Board slug is "doordashusa" but the brand (and any future rows from other
  // regional boards) should read plain "DoorDash".
  doordashusa: "DoorDash",
};

export function humanizeCompany(slug: string): string {
  const lower = slug.toLowerCase();
  const override = COMPANY_OVERRIDES[lower];
  if (override) return override;
  return lower
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// Named entities we decode. Unknown names are left exactly as written —
// turning them into spaces is what produced "R D" for "R&D". `nbsp` becomes a
// plain space so the whitespace collapse below treats it like one.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  AMP: "&",
  lt: "<",
  LT: "<",
  gt: ">",
  GT: ">",
  quot: '"',
  QUOT: '"',
  apos: "'",
  nbsp: " ",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  bull: "•",
  middot: "·",
  copy: "©",
  reg: "®",
  trade: "™",
  euro: "€",
  pound: "£",
};

const ENTITY_RE =
  /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]{0,31}));/g;

// Numeric references outside Unicode, lone surrogates, and control characters
// other than tab/newline/CR stay as written rather than smuggling invisible
// bytes into stored text.
function codePointToText(cp: number): string | null {
  if (cp === 0xa0) return " ";
  if (cp > 0x10ffff) return null;
  if (cp >= 0xd800 && cp <= 0xdfff) return null;
  if (cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) return null;
  if (cp >= 0x7f && cp <= 0x9f) return null;
  return String.fromCodePoint(cp);
}

// One layer: every entity in a single left-to-right pass, so `&amp;lt;`
// becomes `&lt;` — never `<` — no matter which entity a chain of replaces
// would have handled first.
function decodeEntityLayer(text: string): string {
  return text.replace(
    ENTITY_RE,
    (match, dec: string | undefined, hex: string | undefined, name: string | undefined) => {
      if (name !== undefined) return NAMED_ENTITIES[name] ?? match;
      const cp = dec !== undefined ? parseInt(dec, 10) : parseInt(hex ?? "", 16);
      return codePointToText(cp) ?? match;
    }
  );
}

// Greenhouse double-encodes text inside its already-escaped HTML
// (`R&amp;amp;D`), so decode layer by layer until nothing changes. Capped so a
// pathological input can't loop; three layers covers everything observed.
const MAX_DECODE_PASSES = 3;

export function decodeEntities(text: string): string {
  let out = text;
  for (let i = 0; i < MAX_DECODE_PASSES; i++) {
    const next = decodeEntityLayer(out);
    if (next === out) break;
    out = next;
  }
  return out;
}

// Escaped HTML has encoded tags and no real ones.
function isEscapedHtml(text: string): boolean {
  return /&lt;\/?[a-zA-Z]/i.test(text) && !/<\/?[a-zA-Z][^<>]*>/.test(text);
}

// Only tag-shaped text: a name right after `<`, then attributes on the same
// line. Text such as "India <Karnataka, Tamil Nadu>", "(<5000 FTEs)" or "0>1"
// survives — the old `<[^>]*>` deleted everything between a stray `<` and the
// next `>`. Repeated until stable so `<scr<b>ipt>` can't reassemble a tag.
const TAG_RESIDUE_RE = /<!--[\s\S]*?-->|<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>\n]*)?\/?>/g;

function stripTagResidue(text: string): string {
  let out = text;
  let prev: string;
  do {
    prev = out;
    out = out.replace(TAG_RESIDUE_RE, "");
  } while (out !== prev);
  return out;
}

// Best-effort HTML → plain text. Greenhouse content is well-formed marketing
// HTML (no scripts, no styles in practice) but we strip both anyway.
//
// Order matters here:
//   0. If the content is escaped HTML, unescape exactly ONE layer so the
//      tags become real tags. Only one: text that was itself encoded
//      (`&amp;lt;5000`) must stay encoded through the tag strip, or it would
//      be mistaken for markup and deleted.
//   1. Drop entire <style>/<script> blocks (content + bounding tags).
//   2. Convert structural tags to newlines BEFORE stripping, so the layout
//      survives in plain text (each <li> on its own line, paragraph breaks
//      become blank lines, etc.). Both opening and closing variants are
//      covered to handle pages with attributes (`<p class="foo">`) and
//      self-closing forms (`<br />`).
//   3. Strip every remaining tag — anything that looks like `<...>`.
//   4. Decode entities (named + decimal + hex), layer by layer.
//   5. Defensive pass on tag-shaped residue — in case a double-encoded
//      `&amp;lt;p&amp;gt;` was decoded into a literal `<p>` by step 4.
//   6. Collapse whitespace.
export function stripHtml(html: string): string {
  let out = html;

  // 0. Outer escaping layer
  if (isEscapedHtml(out)) out = decodeEntityLayer(out);

  // 1. Block elements that carry their own content
  out = out.replace(/<style\b[\s\S]*?<\/style>/gi, "");
  out = out.replace(/<script\b[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<!--[\s\S]*?-->/g, "");

  // 2. Structural tags → newlines (do this before the catch-all strip)
  out = out.replace(/<br\s*\/?\s*>/gi, "\n");
  // Opening + closing of block-level tags both produce a line break so we
  // preserve list/paragraph boundaries even when the source HTML is sloppy.
  out = out.replace(
    /<\/?(p|div|li|ul|ol|tr|table|h[1-6]|section|article|header|footer|nav|aside)\b[^>]*>/gi,
    "\n"
  );

  // 3. Strip everything else (spans, anchors with hrefs, strong, em, …)
  out = out.replace(/<\/?[a-zA-Z][^>]*>/g, "");

  // 4. Decode entities
  out = decodeEntities(out);

  // 5. Defensive: any tag-shaped residue left after entity decoding
  out = stripTagResidue(out);

  // 6. Whitespace cleanup. Blank-line runs collapse AFTER lines are trimmed:
  //    a `<p>&nbsp;</p>` spacer leaves a spaces-only line, which would
  //    otherwise split one run into two and keep four newlines.
  out = out
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/^[ \t]+|[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return out;
}

function toIsoOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function detectRemote(locationName: string, officeNames: string[]): boolean {
  const remoteRe = /\bremote\b/i;
  if (remoteRe.test(locationName)) return true;
  return officeNames.some((n) => remoteRe.test(n));
}

function normalizeJob(
  job: GreenhouseJob,
  company: string
): NormalizedJob | null {
  if (!job?.id || !job.title || !job.absolute_url) {
    return null;
  }

  const locationName = decodeEntities(job.location?.name ?? "").trim();
  const officeNames = (job.offices ?? [])
    .map((o) => decodeEntities(o?.name ?? "").trim())
    .filter((n): n is string => n.length > 0);

  const location =
    locationName.length > 0
      ? locationName
      : officeNames.length > 0
        ? officeNames.join(" / ")
        : null;

  const description = job.content ? stripHtml(job.content) : null;

  return {
    source: "greenhouse",
    source_id: String(job.id),
    title: decodeEntities(job.title).trim(),
    company,
    location,
    is_remote: detectRemote(locationName, officeNames),
    description: description && description.length > 0 ? description : null,
    requirements: null,
    salary_min: null,
    salary_max: null,
    salary_currency: "USD",
    employment_type: null,
    experience_min_years: null,
    experience_max_years: null,
    apply_url: job.absolute_url,
    posted_at: toIsoOrNull(job.updated_at),
    is_active: true,
  };
}

export async function fetchGreenhouseJobs(
  companySlug: string
): Promise<NormalizedJob[]> {
  const url = `${GREENHOUSE_BASE}/${encodeURIComponent(companySlug)}/jobs?content=true`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "network error";
    throw new Error(`Greenhouse fetch failed for "${companySlug}": ${reason}`);
  }

  // Boards that have been deleted or never existed return 404. Treat as
  // empty rather than fatal so the cron handler can keep going.
  if (res.status === 404) return [];

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Greenhouse ${res.status} for "${companySlug}"${detail ? `: ${detail.slice(0, 200)}` : ""}`
    );
  }

  let json: GreenhouseResponse;
  try {
    json = (await res.json()) as GreenhouseResponse;
  } catch (err) {
    const reason = err instanceof Error ? err.message : "invalid JSON";
    throw new Error(
      `Greenhouse response parse failed for "${companySlug}": ${reason}`
    );
  }

  const company = humanizeCompany(companySlug);
  const rawJobs = json.jobs ?? [];

  return rawJobs
    .map((j) => normalizeJob(j, company))
    .filter((j): j is NormalizedJob => j !== null);
}
