import { NextResponse, type NextRequest } from "next/server";

import { callGemini, GeminiError } from "@/lib/ai/gemini-client";
import {
  combineWithHeuristic,
  computeHeuristic,
  type HeuristicResumeInput,
} from "@/lib/ai/resume-analysis";
import {
  ResumeScoreAnalysisSchema,
  type ResumeScoreAnalysis,
} from "@/lib/ai/schemas";
import { createServerSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 60;

// STANDALONE re-score path. The upload flow no longer calls this route — it
// gets its score from /api/resume/parse's combined parse+score Gemini call
// (one call per upload; free tier is 20 requests/day/key). This route stays
// for re-scoring a resume whose parsed_content is already persisted, and
// shares the heuristic + composition code with the combined path via
// @/lib/ai/resume-analysis so the two can never drift.
const SCORE_PROMPT = `You are an ATS expert. Analyze this resume and return ONLY valid JSON (no markdown fences):
{ "score": number (0-100), "strengths": string[], "improvements": string[], "keywords_missing": string[], "verdict": string }

Resume:
"""
`;

const stripFences = (s: string) =>
  s
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

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
    .select("id, user_id, parsed_content, kind")
    .eq("id", resumeId)
    .single();

  if (fetchError || !resume) {
    return NextResponse.json({ error: "Resume not found" }, { status: 404 });
  }

  if (resume.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ATS scoring is an uploaded-resume concept — generated tailored rows
  // have no _resume_text (skewing the heuristic) and nothing reads their
  // ats_score. Mirrors the parse route's guard.
  if (resume.kind !== "uploaded") {
    return NextResponse.json(
      { error: "Only uploaded resumes can be scored" },
      { status: 409 }
    );
  }

  if (!resume.parsed_content) {
    return NextResponse.json(
      { error: "Resume has not been parsed yet" },
      { status: 409 }
    );
  }

  const parsed = resume.parsed_content as HeuristicResumeInput;
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

  const { finalScore, breakdown } = combineWithHeuristic(
    heuristic,
    geminiAnalysis
  );

  const { error: updateError } = await supabase
    .from("resumes")
    .update({ ats_score: finalScore, ats_breakdown: breakdown })
    .eq("id", resumeId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ats_score: finalScore, ats_breakdown: breakdown });
}
