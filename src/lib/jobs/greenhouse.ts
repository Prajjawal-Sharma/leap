import type { NormalizedJob } from "./normalize";

// Greenhouse public board API — no auth required.
//   GET https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true
//
// `content` is HTML and includes the full job posting (responsibilities,
// requirements, perks, etc.). We strip it to plain text before storing so the
// jobs.description column stays human-readable for downstream embedding.
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
  shopify: "Shopify",
  figma: "Figma",
  gitlab: "GitLab",
  hashicorp: "HashiCorp",
  mongodb: "MongoDB",
  datadoghq: "Datadog",
  doordash: "DoorDash",
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

// Best-effort HTML → plain text. Greenhouse content is well-formed marketing
// HTML (no scripts, no styles in practice) but we strip both anyway.
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .replace(/^[ \t]+|[ \t]+$/gm, "")
    .trim();
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

  const locationName = (job.location?.name ?? "").trim();
  const officeNames = (job.offices ?? [])
    .map((o) => o?.name?.trim() ?? "")
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
    title: job.title.trim(),
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
