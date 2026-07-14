// IMPORTANT: pdf-parse/worker must be imported before pdf-parse — the worker
// entry polyfills browser globals (DOMMatrix, ImageData, …) that pdfjs-dist
// expects but Node's serverless runtime does not provide.
import { CanvasFactory } from "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import { NextResponse, type NextRequest } from "next/server";

import { callGemini, GeminiError } from "@/lib/ai/gemini-client";
import { ParsedResumeSchema, type ParsedResume } from "@/lib/ai/schemas";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { createServerSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 30;

const BUCKET = "resumes";

const PARSE_PROMPT = `You are a precise resume parser. Extract the following fields from the resume text and return ONLY valid JSON (no markdown fences, no commentary). Use empty string "" for missing string fields and empty arrays for missing list fields. Do not invent data.

Schema:
{
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
}

Resume text:
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
    .select("id, user_id, storage_path")
    .eq("id", resumeId)
    .single();

  if (fetchError || !resume) {
    return NextResponse.json({ error: "Resume not found" }, { status: 404 });
  }

  if (resume.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  // Cap input size to keep prompt lean and avoid runaway tokens.
  const MAX_CHARS = 16000;
  const promptText =
    PARSE_PROMPT +
    (trimmed.length > MAX_CHARS ? trimmed.slice(0, MAX_CHARS) : trimmed) +
    '\n"""';

  let parsedContent: ParsedResume;
  try {
    const raw = await callGemini(promptText, { temperature: 0.2 });
    const rawJson: unknown = JSON.parse(stripFences(raw));
    const validated = ParsedResumeSchema.safeParse(rawJson);
    if (!validated.success) {
      console.error(
        `[resume/parse] schema validation failed for resume ${resumeId}:`,
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
    parsedContent = validated.data;
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

  // Stash raw extracted text alongside the parsed fields so /score can
  // compute heuristics without re-downloading and re-parsing the PDF.
  const enriched = { ...parsedContent, _resume_text: trimmed };

  const { error: updateError } = await supabase
    .from("resumes")
    .update({ parsed_content: enriched })
    .eq("id", resumeId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json(parsedContent);
}
