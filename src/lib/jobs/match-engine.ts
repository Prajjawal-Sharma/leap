import { embedText } from "@/lib/ai/embeddings";
import { createServerSupabase } from "@/lib/supabase-server";

export type Job = {
  id: string;
  source: string;
  source_id: string;
  title: string;
  company: string;
  location: string | null;
  is_remote: boolean;
  description: string | null;
  requirements: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  employment_type: string | null;
  experience_min_years: number | null;
  experience_max_years: number | null;
  apply_url: string;
  posted_at: string | null;
  ingested_at: string;
  is_active: boolean;
};

export interface MatchResult {
  job: Job;
  similarity: number;
  match_score: number;
}

export type MatchEngineError =
  | { kind: "no_resume" }
  | { kind: "no_parsed_content" };

export class MatchEngineFailure extends Error {
  readonly code: MatchEngineError["kind"];
  constructor(code: MatchEngineError["kind"], message: string) {
    super(message);
    this.code = code;
  }
}

type ResumeExperience = {
  company?: string;
  role?: string;
  duration?: string;
  description?: string;
};

type ParsedResume = {
  full_name?: string;
  summary?: string;
  skills?: string[];
  experience?: ResumeExperience[];
};

const JOB_COLUMNS =
  "id, source, source_id, title, company, location, is_remote, description, requirements, salary_min, salary_max, salary_currency, employment_type, experience_min_years, experience_max_years, apply_url, posted_at, ingested_at, is_active";

// Cosine similarity threshold below which a match is too weak to surface.
// Empirically tuned for gemini-embedding-001 / 768-dim job text vs resume
// query text — under 0.3 the results turn into noise (different industries,
// unrelated roles).
const MATCH_THRESHOLD = 0.3;

// Upper bound on RPC results before client-side limit/offset slicing. The
// RPC is the heaviest step; over-fetching by ~3x the requested page lets
// callers paginate without re-running the vector search per page.
const RPC_MATCH_COUNT = 150;

function buildQueryText(parsed: ParsedResume): string {
  const skills = Array.isArray(parsed.skills)
    ? parsed.skills.filter((s) => typeof s === "string" && s.trim().length > 0)
    : [];
  const summary =
    typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  const experience = Array.isArray(parsed.experience)
    ? parsed.experience
        .map((e) => {
          const role = (e?.role ?? "").trim();
          const company = (e?.company ?? "").trim();
          if (!role && !company) return "";
          if (role && company) return `${role} at ${company}`;
          return role || company;
        })
        .filter((s) => s.length > 0)
    : [];

  const lines: string[] = [];
  if (skills.length > 0) {
    lines.push(`Software engineer with experience in: ${skills.join(", ")}.`);
  }
  if (summary.length > 0) {
    lines.push(`Background: ${summary}.`);
  }
  if (experience.length > 0) {
    lines.push(`Previous roles: ${experience.join(", ")}.`);
  }
  lines.push("Target: software engineering roles.");
  return lines.join(" ");
}

export async function matchJobsForResume(
  userId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<{ matches: MatchResult[]; total_searched: number }> {
  const limit = Math.max(1, Math.min(options.limit ?? 20, 50));
  const offset = Math.max(0, options.offset ?? 0);

  const supabase = await createServerSupabase();

  // Defensive: a historical bug let multiple resumes carry is_primary=true
  // for the same user. .maybeSingle() raises on >1 row, so order by
  // created_at desc and take the first — works for 0, 1, or N primaries
  // and naturally prefers the most recent upload. kind='uploaded' keeps
  // generated tailored rows out of the match query even if one ever ends up
  // flagged primary.
  const { data: resumeRows, error: resumeErr } = await supabase
    .from("resumes")
    .select("id, parsed_content")
    .eq("user_id", userId)
    .eq("is_primary", true)
    .eq("kind", "uploaded")
    .order("created_at", { ascending: false })
    .limit(1);

  if (resumeErr) {
    throw new Error(`fetch primary resume failed: ${resumeErr.message}`);
  }
  const resume = resumeRows?.[0] ?? null;
  if (!resume) {
    throw new MatchEngineFailure("no_resume", "No primary resume found");
  }

  const parsed = (resume.parsed_content ?? null) as ParsedResume | null;
  if (!parsed || typeof parsed !== "object") {
    throw new MatchEngineFailure(
      "no_parsed_content",
      "Primary resume has not been parsed yet"
    );
  }

  const queryText = buildQueryText(parsed);
  const queryEmbedding = await embedText(queryText, "RETRIEVAL_QUERY");

  const { data: matchRows, error: rpcErr } = await supabase.rpc("match_jobs", {
    query_embedding: queryEmbedding,
    match_count: RPC_MATCH_COUNT,
    match_threshold: MATCH_THRESHOLD,
  });

  if (rpcErr) {
    throw new Error(`match_jobs rpc failed: ${rpcErr.message}`);
  }

  const rows = (matchRows ?? []) as Array<{
    job_id: string;
    similarity: number;
  }>;

  if (rows.length === 0) {
    return { matches: [], total_searched: 0 };
  }

  const totalSearched = rows.length;
  const page = rows.slice(offset, offset + limit);
  if (page.length === 0) {
    return { matches: [], total_searched: totalSearched };
  }

  const pageIds = page.map((r) => r.job_id);
  const { data: jobs, error: jobsErr } = await supabase
    .from("jobs")
    .select(JOB_COLUMNS)
    .in("id", pageIds);

  if (jobsErr) {
    throw new Error(`fetch job details failed: ${jobsErr.message}`);
  }

  const jobById = new Map<string, Job>();
  for (const j of (jobs ?? []) as Job[]) {
    jobById.set(j.id, j);
  }

  const matches: MatchResult[] = [];
  for (const row of page) {
    const job = jobById.get(row.job_id);
    if (!job) continue;
    const similarity = Number(row.similarity);
    matches.push({
      job,
      similarity,
      match_score: Math.round(similarity * 100),
    });
  }
  matches.sort((a, b) => b.similarity - a.similarity);

  return { matches, total_searched: totalSearched };
}
