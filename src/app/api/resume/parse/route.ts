// IMPORTANT: pdf-parse/worker must be imported before pdf-parse — the worker
// entry polyfills browser globals (DOMMatrix, ImageData, …) that pdfjs-dist
// expects but Node's serverless runtime does not provide.
import { CanvasFactory } from "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import { NextResponse, type NextRequest } from "next/server";

import { callGemini, GeminiError } from "@/lib/ai/gemini-client";
import {
  buildParseAndScorePrompt,
  combineWithHeuristic,
  computeHeuristic,
} from "@/lib/ai/resume-analysis";
import {
  ResumeParseAndScoreSchema,
  type ParsedResume,
  type ResumeScoreAnalysis,
} from "@/lib/ai/schemas";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { createServerSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 30;

const BUCKET = "resumes";

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
    .select("id, user_id, storage_path")
    .eq("id", resumeId)
    .single();

  if (fetchError || !resume) {
    return NextResponse.json({ error: "Resume not found" }, { status: 404 });
  }

  if (resume.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Generated tailored resumes have no stored PDF (storage_path is null
  // since migration 0006) — there is nothing to download and parse.
  if (!resume.storage_path) {
    return NextResponse.json(
      { error: "Resume has no stored file to parse" },
      { status: 409 }
    );
  }

  const admin = createAdminSupabase();
  const { data: blob, error: downloadError } = await admin.storage
    .from(BUCKET)
    .download(resume.storage_path);

  if (downloadError || !blob) {
    return NextResponse.json(
      { error: `Failed to download resume: ${downloadError?.message ?? "unknown"}` },
      { status: 500 }
    );
  }

  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  let extractedText: string;
  let parser: PDFParse | null = null;
  try {
    parser = new PDFParse({ data: bytes, CanvasFactory });
    const result = await parser.getText();
    extractedText = result.text ?? "";
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to parse PDF: ${message}` },
      { status: 422 }
    );
  } finally {
    if (parser) await parser.destroy().catch(() => {});
  }

  const trimmed = extractedText.trim();
  if (trimmed.length < 50) {
    return NextResponse.json(
      { error: "Could not extract enough text from PDF" },
      { status: 422 }
    );
  }

  // ONE Gemini call for BOTH parse and ATS analysis — free-tier quota is 20
  // requests/day/key (~140/day pool), so the old parse-then-score pair of
  // calls per upload was 50% waste. The combined reply passes through
  // ResumeParseAndScoreSchema before ANYTHING persists: on validation
  // failure nothing is written and the client gets a retryable 502, exactly
  // like the single-purpose routes.
  let parsedContent: ParsedResume;
  let analysis: ResumeScoreAnalysis;
  try {
    const raw = await callGemini(buildParseAndScorePrompt(trimmed), {
      temperature: 0.2,
    });
    const rawJson: unknown = JSON.parse(stripFences(raw));
    const validated = ResumeParseAndScoreSchema.safeParse(rawJson);
    if (!validated.success) {
      console.error(
        `[resume/parse] combined schema validation failed for resume ${resumeId}:`,
        validated.error.message
      );
      return NextResponse.json(
        {
          error: "Gemini returned a malformed resume payload",
          retryable: true,
        },
        { status: 502 }
      );
    }
    parsedContent = validated.data.resume;
    analysis = validated.data.ats_analysis;
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
      { error: `Failed to parse Gemini response: ${message}`, retryable: false },
      { status: 502 }
    );
  }

  // Stash raw extracted text alongside the parsed fields so score heuristics
  // (here and in the standalone /score route) can use it without
  // re-downloading and re-parsing the PDF.
  const enriched = { ...parsedContent, _resume_text: trimmed };
  const heuristic = computeHeuristic(enriched);
  const { finalScore, breakdown } = combineWithHeuristic(heuristic, analysis);

  // Parse and score persist together — one update, after the single
  // validation gate above. The columns stay independent downstream: the
  // standalone /score route can still recompute ats_score/ats_breakdown for
  // a resume whose parsed_content is already saved.
  const { error: updateError } = await supabase
    .from("resumes")
    .update({
      parsed_content: enriched,
      ats_score: finalScore,
      ats_breakdown: breakdown,
    })
    .eq("id", resumeId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    parsed: parsedContent,
    ats_score: finalScore,
    ats_breakdown: breakdown,
  });
}
