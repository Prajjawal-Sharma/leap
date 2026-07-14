import { NextResponse, type NextRequest } from "next/server";

import { callGemini, GeminiError } from "@/lib/ai/gemini-client";
import {
  ResumeScoreAnalysisSchema,
  type ResumeScoreAnalysis,
} from "@/lib/ai/schemas";
import { createServerSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 60;

const SCORE_PROMPT = `You are an ATS expert. Analyze this resume and return ONLY valid JSON (no markdown fences):
{ "score": number (0-100), "strengths": string[], "improvements": string[], "keywords_missing": string[], "verdict": string }

Resume:
"""
`;

type ParsedResume = {
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

const stripFences = (s: string) =>
  s
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

function computeHeuristic(parsed: ParsedResume): {
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
  if (experience.length > 0 && expWithDescriptions.length === experience.length) {
    score += 10;
    signals.experience_has_descriptions = true;
  }

  return { score: clamp(score, 0, 100), signals };
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { resume_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const resumeId = typeof body.resume_id === "string" ? body.resume_id : null;
  if (!resumeId) {
    return NextResponse.json(
      { error: "resume_id is required" },
      { status: 400 }
    );
  }

  const { data: resume, error: fetchError } = await supabase
    .from("resumes")
    .select("id, user_id, parsed_content")
    .eq("id", resumeId)
    .single();

  if (fetchError || !resume) {
    return NextResponse.json({ error: "Resume not found" }, { status: 404 });
  }

  if (resume.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!resume.parsed_content) {
    return NextResponse.json(
      { error: "Resume has not been parsed yet" },
      { status: 409 }
    );
  }

  const parsed = resume.parsed_content as ParsedResume;
  const heuristic = computeHeuristic(parsed);

  const resumeText = (parsed._resume_text ?? "").trim();
  const sourceForGemini = resumeText.length > 0
    ? resumeText
    : JSON.stringify(parsed, null, 2);

  const MAX_CHARS = 16000;
  const promptInput =
    sourceForGemini.length > MAX_CHARS
      ? sourceForGemini.slice(0, MAX_CHARS)
      : sourceForGemini;

  let geminiAnalysis: ResumeScoreAnalysis;
  try {
    const raw = await callGemini(SCORE_PROMPT + promptInput + '\n"""', {
      temperature: 0.3,
    });
    const rawJson: unknown = JSON.parse(stripFences(raw));
    const validated = ResumeScoreAnalysisSchema.safeParse(rawJson);
    if (!validated.success) {
      console.error(
        `[resume/score] schema validation failed for resume ${resumeId}:`,
        validated.error.message
      );
      return NextResponse.json(
        {
          error: "Gemini returned a malformed score payload",
          retryable: true,
        },
        { status: 502 }
      );
    }
    geminiAnalysis = validated.data;
  } catch (err) {
    if (err instanceof GeminiError) {
      const status = err.status === 429 ? 429 : 502;
      return NextResponse.json(
        { error: err.message, retryable: err.retryable, gemini_status: err.status },
        { status }
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to score resume: ${message}`, retryable: false },
      { status: 502 }
    );
  }

  const geminiScoreRaw =
    typeof geminiAnalysis.score === "number" ? geminiAnalysis.score : 0;
  const geminiScore = clamp(Math.round(geminiScoreRaw), 0, 100);
  const finalScore = Math.round((heuristic.score + geminiScore) / 2);

  const breakdown = {
    heuristic: {
      score: heuristic.score,
      signals: heuristic.signals,
    },
    gemini_analysis: {
      score: geminiScore,
      strengths: geminiAnalysis.strengths ?? [],
      improvements: geminiAnalysis.improvements ?? [],
      keywords_missing: geminiAnalysis.keywords_missing ?? [],
      verdict: geminiAnalysis.verdict ?? "",
    },
  };

  const { error: updateError } = await supabase
    .from("resumes")
    .update({ ats_score: finalScore, ats_breakdown: breakdown })
    .eq("id", resumeId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ats_score: finalScore, ats_breakdown: breakdown });
}
