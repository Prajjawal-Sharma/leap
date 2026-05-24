import type { SupabaseClient } from "@supabase/supabase-js";

import type { Profile } from "@/types/profile";

// Shape of resume.parsed_content as produced by /api/resume/parse. The Gemini
// parser may omit fields, so every property is optional here.
type ResumeParsed = {
  full_name?: string;
  email?: string;
  phone?: string;
  location?: string;
  summary?: string;
  experience?: Array<{
    company?: string;
    role?: string;
    duration?: string;
    description?: string;
  }>;
  education?: Array<{
    institution?: string;
    degree?: string;
    year?: string;
  }>;
  skills?: string[];
  certifications?: string[];
  languages?: string[];
};

const SYSTEM_PROMPT = `You are Leap Career Coach, a candid, specific, and supportive AI assistant for software engineers in India who are job hunting. The person you are talking to has shared their profile, resume, and application history with you below.

Ground every answer in their actual situation. Reference roles, companies, and skills they have when relevant. If they ask something where their context matters and a field is missing, say so and ask for it. Never invent experience, certifications, or applications they don't have.

Style:
- Plain prose. No emojis. No "As an AI..." disclaimers. No headings unless the user asks for a list.
- Concise by default — long answers only when the question genuinely needs depth.
- Direct about tradeoffs. You can disagree with the user respectfully.
- India-aware: assume INR salaries unless otherwise stated, familiarity with TCS/Infosys/Wipro background, GCC/product-company target outcomes.`;

const truncate = (s: string, n: number): string =>
  s.length > n ? `${s.slice(0, n).trim()}…` : s;

function formatProfile(p: Profile | null): string {
  if (!p) return "Profile: not yet filled in.";

  const lines: string[] = ["Profile:"];
  if (p.full_name) lines.push(`- Name: ${p.full_name}`);
  if (p.current_job_title || p.current_company) {
    const role = p.current_job_title ?? "Engineer";
    const where = p.current_company ? ` at ${p.current_company}` : "";
    lines.push(`- Current role: ${role}${where}`);
  }
  if (p.years_experience != null) {
    lines.push(`- Experience: ${p.years_experience} years`);
  }
  if (p.location) lines.push(`- Based in: ${p.location}`);
  if (p.target_roles && p.target_roles.length > 0) {
    lines.push(`- Target roles: ${p.target_roles.join(", ")}`);
  }
  if (p.target_companies && p.target_companies.length > 0) {
    lines.push(`- Target companies: ${p.target_companies.join(", ")}`);
  }
  if (p.expected_salary_min != null || p.expected_salary_max != null) {
    const ccy = p.expected_salary_currency ?? "INR";
    const min = p.expected_salary_min ?? "—";
    const max = p.expected_salary_max ?? "—";
    lines.push(`- Salary expectation: ${ccy} ${min} – ${max}`);
  }
  if (p.notice_period_days != null) {
    lines.push(`- Notice period: ${p.notice_period_days} days`);
  }
  return lines.join("\n");
}

function formatResume(parsed: ResumeParsed | null): string {
  if (!parsed) return "Resume: not uploaded yet.";

  const lines: string[] = ["Resume:"];
  if (parsed.summary) {
    lines.push(`- Summary: ${truncate(parsed.summary, 500)}`);
  }
  if (parsed.experience && parsed.experience.length > 0) {
    lines.push("- Experience:");
    for (const e of parsed.experience.slice(0, 6)) {
      const role = e.role ?? "Role";
      const company = e.company ?? "Company";
      const duration = e.duration ? ` (${e.duration})` : "";
      const desc = e.description ? ` — ${truncate(e.description, 220)}` : "";
      lines.push(`  · ${role} @ ${company}${duration}${desc}`);
    }
  }
  if (parsed.skills && parsed.skills.length > 0) {
    lines.push(`- Skills: ${parsed.skills.slice(0, 40).join(", ")}`);
  }
  if (parsed.education && parsed.education.length > 0) {
    lines.push("- Education:");
    for (const ed of parsed.education.slice(0, 3)) {
      const degree = ed.degree ?? "Degree";
      const inst = ed.institution ?? "Institution";
      const year = ed.year ? ` (${ed.year})` : "";
      lines.push(`  · ${degree}, ${inst}${year}`);
    }
  }
  if (parsed.certifications && parsed.certifications.length > 0) {
    lines.push(
      `- Certifications: ${parsed.certifications.slice(0, 8).join(", ")}`
    );
  }
  return lines.join("\n");
}

type ApplicationRow = {
  status: string;
  updated_at: string;
  job:
    | { title: string | null; company: string | null }
    | Array<{ title: string | null; company: string | null }>
    | null;
};

function formatApplications(rows: ApplicationRow[]): string {
  if (rows.length === 0) {
    return "Applications: none tracked yet.";
  }
  const lines: string[] = [`Applications (last ${rows.length}):`];
  for (const r of rows) {
    const j = Array.isArray(r.job) ? r.job[0] : r.job;
    if (!j || !j.title || !j.company) continue;
    lines.push(`- ${j.title} @ ${j.company} — ${r.status}`);
  }
  return lines.join("\n");
}

// Builds the system prompt by composing the base persona with a User Context
// block sourced from the user's profile, primary resume, and recent
// applications. All three queries run under the caller's authenticated
// supabase client so RLS does the user_id filtering implicitly.
export async function buildSystemPrompt(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const [profileRes, resumeRes, appsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, full_name, phone, location, current_company, current_job_title, years_experience, target_roles, target_companies, notice_period_days, expected_salary_min, expected_salary_max, expected_salary_currency, linkedin_url, github_url, created_at, updated_at"
      )
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("resumes")
      .select("parsed_content")
      .eq("user_id", userId)
      .eq("is_primary", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("applications")
      .select("status, updated_at, job:jobs!inner(title, company)")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(10),
  ]);

  const profile = (profileRes.data ?? null) as Profile | null;
  const parsed =
    (resumeRes.data?.parsed_content as ResumeParsed | null | undefined) ??
    null;
  const apps = ((appsRes.data ?? []) as unknown as ApplicationRow[]) ?? [];

  const contextBlock = [
    "User Context:",
    "",
    formatProfile(profile),
    "",
    formatResume(parsed),
    "",
    formatApplications(apps),
  ].join("\n");

  return `${SYSTEM_PROMPT}\n\n${contextBlock}`;
}
