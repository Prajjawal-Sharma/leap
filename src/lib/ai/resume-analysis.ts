import type { ResumeScoreAnalysis } from "./schemas";

// Shared between /api/resume/parse (combined parse+score Gemini call) and
// /api/resume/score (standalone re-score): the deterministic half of the ATS
// score plus the prompt/scoring glue. Extracted from the score route when the
// upload flow merged parse and score into ONE Gemini call — free-tier quota
// is 20 requests/day/key (~140/day across the pool), so the second call per
// upload was pure waste. Keeping the formula and the heuristic in one place
// guarantees the standalone path and the combined path can never drift.

// Structural input type rather than ParsedResume: the score route feeds
// persisted parsed_content (which may predate the schema boundary), and the
// heuristic must tolerate missing fields either way.
export type HeuristicResumeInput = {
  full_name?: string;
  email?: string;
  phone?: string;
  summary?: string;
  experience?: Array<{ description?: string }>;
  education?: unknown[];
  skills?: string[];
  certifications?: unknown[];
  _resume_text?: string;
};

export const clamp = (n: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, n));

export function computeHeuristic(parsed: HeuristicResumeInput): {
  score: number;
  signals: Record<string, boolean | number>;
} {
  let score = 0;
  const signals: Record<string, boolean | number> = {};

  const summary = (parsed.summary ?? "").trim();
  if (summary.length > 0) {
    score += 15;
    signals.has_summary = true;
  }

  const experience = parsed.experience ?? [];
  if (experience.length >= 2) {
    score += 20;
    signals.has_two_plus_experience = true;
  }

  if ((parsed.education ?? []).length > 0) {
    score += 10;
    signals.has_education = true;
  }

  const skills = parsed.skills ?? [];
  if (skills.length >= 5) {
    score += 15;
    signals.has_five_plus_skills = true;
  }
  if (skills.length > 10) {
    score += 5;
    signals.skills_bonus = true;
  }
  signals.skills_count = skills.length;

  const resumeText = parsed._resume_text ?? "";
  const wordCount = resumeText.split(/\s+/).filter(Boolean).length;
  signals.word_count = wordCount;
  if (wordCount > 300) {
    score += 10;
    signals.long_enough = true;
  }

  const hasEmail = Boolean((parsed.email ?? "").trim());
  const hasPhone = Boolean((parsed.phone ?? "").trim());
  if (hasEmail && hasPhone) {
    score += 10;
    signals.has_contact_info = true;
  }

  if ((parsed.certifications ?? []).length > 0) {
    score += 5;
    signals.has_certifications = true;
  }

  const expWithDescriptions = experience.filter(
    (e) => typeof e?.description === "string" && e.description.trim().length > 0
  );
  if (
    experience.length > 0 &&
    expWithDescriptions.length === experience.length
  ) {
    score += 10;
    signals.experience_has_descriptions = true;
  }

  return { score: clamp(score, 0, 100), signals };
}

export type AtsBreakdown = {
  heuristic: { score: number; signals: Record<string, boolean | number> };
  gemini_analysis: {
    score: number;
    strengths: string[];
    improvements: string[];
    keywords_missing: string[];
    verdict: string;
  };
};

// Final score = mean of the deterministic heuristic and Gemini's judgment,
// exactly as the score route always computed it.
export function combineWithHeuristic(
  heuristic: { score: number; signals: Record<string, boolean | number> },
  analysis: ResumeScoreAnalysis
): { finalScore: number; breakdown: AtsBreakdown } {
  const geminiScoreRaw = typeof analysis.score === "number" ? analysis.score : 0;
  const geminiScore = clamp(Math.round(geminiScoreRaw), 0, 100);
  const finalScore = Math.round((heuristic.score + geminiScore) / 2);
  return {
    finalScore,
    breakdown: {
      heuristic: { score: heuristic.score, signals: heuristic.signals },
      gemini_analysis: {
        score: geminiScore,
        strengths: analysis.strengths ?? [],
        improvements: analysis.improvements ?? [],
        keywords_missing: analysis.keywords_missing ?? [],
        verdict: analysis.verdict ?? "",
      },
    },
  };
}

// Cap parity with the previous single-purpose prompts: both routes fed at
// most 16k chars of resume text.
const MAX_RESUME_CHARS = 16000;

// One prompt, both jobs. The instruction text deliberately reuses the
// wording of the old PARSE_PROMPT and SCORE_PROMPT so extraction and scoring
// behavior stay as close as possible to the two-call era; only the envelope
// ({"resume", "ats_analysis"}) is new. Validated by
// ResumeParseAndScoreSchema — the combined reply is a Gemini JSON output
// site behind the same safeParse boundary as every other one.
export function buildParseAndScorePrompt(resumeText: string): string {
  const trimmed = resumeText.trim();
  const capped =
    trimmed.length > MAX_RESUME_CHARS
      ? trimmed.slice(0, MAX_RESUME_CHARS)
      : trimmed;
  return `You are a precise resume parser and an ATS expert. Perform BOTH tasks on the resume text below and return ONLY valid JSON (no markdown fences, no commentary) with exactly this shape:

{
  "resume": {
    "full_name": string,
    "email": string,
    "phone": string,
    "location": string,
    "summary": string,
    "experience": [{ "company": string, "role": string, "duration": string, "description": string }],
    "education": [{ "institution": string, "degree": string, "year": string }],
    "skills": string[],
    "certifications": string[],
    "languages": string[]
  },
  "ats_analysis": { "score": number (0-100), "strengths": string[], "improvements": string[], "keywords_missing": string[], "verdict": string }
}

Parsing rules: extract the "resume" fields from the resume text. Use empty string "" for missing string fields and empty arrays for missing list fields. Do not invent data.
Scoring rules: for "ats_analysis", analyze the resume as an ATS expert and score it 0-100 with concrete strengths, improvements, and missing keywords.

Resume text:
"""
${capped}
"""`;
}
