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
import { resumeStatus } from "@/lib/resume/lifecycle";
import {
  readPdfText,
  UnreadablePdfError,
  type PdfText,
} from "@/lib/resume/pdf-text";
import { isOwnStoragePath, isReadCheckedPath } from "@/lib/resume/storage-path";
import {
  capStoredText,
  fullestPageLength,
  hasReadableText,
  jsonbSafe,
  NO_TEXT_MESSAGE,
  UNREADABLE_PDF_MESSAGE,
  withoutResumeText,
  type ParseErrorCode,
} from "@/lib/resume/upload-rules";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { createServerSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";
// The most Vercel allows a function, with Fluid compute on. The free keys
// are slow when they are busy, and the 30 s this used to be ended parses that
// would have finished.
export const maxDuration = 300;

const BUCKET = "resumes";

// The Gemini loop has to be over well before the platform stops the function:
// a request that is killed returns nothing the page can read, and the calls
// already made are wasted. The deadline is counted from the moment the
// request arrived, so a slow download or extraction shortens the loop and
// not the margin. 30 s are left for saving the result and answering.
const PARSE_BUDGET_MS = 270_000;
// One attempt. The loop makes up to five, but starts none with under 30 s
// left (attempt-budget.ts), which is four when every attempt hangs.
const GEMINI_ATTEMPT_TIMEOUT_MS = 60_000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const stripFences = (s: string) =>
  s
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

export async function POST(request: NextRequest) {
  const startedAt = Date.now();

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

  const resumeId =
    typeof body.resume_id === "string" ? body.resume_id.trim() : "";
  if (!resumeId) {
    return NextResponse.json(
      { error: "resume_id is required" },
      { status: 400 }
    );
  }
  if (!UUID_RE.test(resumeId)) {
    return NextResponse.json(
      { error: "resume_id must be a resume UUID" },
      { status: 400 }
    );
  }

  const { data: resume, error: fetchError } = await supabase
    .from("resumes")
    .select(
      "id, user_id, kind, storage_path, parsed_content, ats_score, ats_breakdown, parse_error"
    )
    .eq("id", resumeId)
    .single();

  // PGRST116 is "no such row" (or not the caller's: RLS hides it). Anything
  // else is the query failing — a timeout, or a column missing because
  // migration 0008 was not applied — and says nothing about the row, so it is
  // logged and answered as a failure that can be retried, not as a 404.
  if (fetchError && fetchError.code !== "PGRST116") {
    console.error(
      `[resume/parse] could not read resume ${resumeId}: ${fetchError.message}`
    );
    return NextResponse.json(
      {
        error: "We couldn't load this résumé just now. Try again.",
        retryable: true,
      },
      { status: 500 }
    );
  }
  if (fetchError || !resume) {
    return NextResponse.json({ error: "Resume not found" }, { status: 404 });
  }

  if (resume.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Generated tailored resumes have no stored PDF (storage_path is null
  // since migration 0006) — there is nothing to download and parse.
  if (resume.kind !== "uploaded" || !resume.storage_path) {
    return NextResponse.json(
      { error: "Resume has no stored file to parse" },
      { status: 409 }
    );
  }

  // Users can write storage_path on their own rows, and the download below
  // runs with the service role, which no storage policy restrains. Only a
  // path inside the caller's own folder, with nothing in it a URL could
  // resolve elsewhere, is ever fetched (see storage-path.ts; the same rule is
  // a CHECK constraint since migration 0008). Checked before anything else is
  // done for the row, so no answer is given for one that fails it.
  if (!isOwnStoragePath(resume.storage_path, user.id)) {
    console.error(
      `[resume/parse] refused resume ${resumeId}: storage_path is outside user ${user.id}'s folder`
    );
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Already parsed and scored: answer from the row. Retry is offered whenever
  // an upload looks unprocessed, and by the time it is pressed an earlier
  // request may have finished the job; a second Gemini call would buy
  // nothing (free tier: 20 requests/day/key).
  if (resumeStatus(resume) === "parsed") {
    return NextResponse.json({
      parsed: withoutResumeText(resume.parsed_content),
      ats_score: resume.ats_score,
      ats_breakdown: resume.ats_breakdown,
      already_processed: true,
    });
  }

  // Records that this upload can never be processed, so the Resume page can
  // say why after a reload instead of offering a retry that cannot work.
  // Written through the user's own client; RLS limits it to their rows.
  const markFailed = async (code: ParseErrorCode) => {
    const { error } = await supabase
      .from("resumes")
      .update({ parse_error: code })
      .eq("id", resumeId)
      .eq("user_id", user.id);
    if (error) {
      console.error(
        `[resume/parse] could not mark resume ${resumeId} as ${code}: ${error.message}`
      );
    }
  };

  // Reading a PDF cannot be time-limited from inside the process, and this
  // route may run for 300 s. So it reads only files the upload route has
  // already read once, under its own 30 s limit, before storing them — which
  // is what the user's "checked" folder holds (storage-path.ts, pdf-text.ts).
  // A file stored before that check existed is refused for good; the row is
  // unprocessed, so nothing the user had is lost by uploading it again.
  if (!isReadCheckedPath(resume.storage_path, user.id)) {
    await markFailed("unreadable");
    return NextResponse.json(
      {
        error: "This upload can no longer be processed. Upload your résumé again.",
        code: "unreadable",
        retryable: false,
      },
      { status: 422 }
    );
  }

  const admin = createAdminSupabase();
  const { data: blob, error: downloadError } = await admin.storage
    .from(BUCKET)
    .download(resume.storage_path);

  if (downloadError || !blob) {
    // Retryable, so the page offers Retry now as it would after a reload:
    // the row stays unprocessed either way. Storage's own text goes to the
    // log, not the page.
    console.error(
      `[resume/parse] download failed for resume ${resumeId}: ${downloadError?.message ?? "no data"}`
    );
    return NextResponse.json(
      {
        error: "We couldn't fetch your file just now. Try again.",
        retryable: true,
      },
      { status: 500 }
    );
  }

  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // The same read the upload route did before storing this file.
  let pdf: PdfText;
  try {
    pdf = await readPdfText(bytes);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(
      `[resume/parse] text extraction failed for resume ${resumeId}: ${message}`
    );
    if (err instanceof UnreadablePdfError) {
      await markFailed("unreadable");
      return NextResponse.json(
        { error: UNREADABLE_PDF_MESSAGE, code: "unreadable", retryable: false },
        { status: 422 }
      );
    }
    return NextResponse.json(
      {
        error: "We couldn't read this PDF just now. Try again.",
        retryable: true,
      },
      { status: 500 }
    );
  }
  const pageTexts = pdf.pages;

  // A scan has no text layer, and a model cannot parse what is not there.
  // Stop before the Gemini call rather than spend one to find that out. The
  // test is on the fullest page (see MIN_READABLE_CHARS), and the measurement
  // is logged so a refusal that should not have happened can be found.
  const trimmed = pdf.text.trim();
  if (!hasReadableText(pageTexts)) {
    console.warn(
      `[resume/parse] resume ${resumeId} refused as a scan: the fullest of ${pageTexts.length} page(s) read has ${fullestPageLength(pageTexts)} readable characters`
    );
    await markFailed("no_text");
    return NextResponse.json(
      { error: NO_TEXT_MESSAGE, code: "no_text", retryable: false },
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
      attemptTimeoutMs: GEMINI_ATTEMPT_TIMEOUT_MS,
      deadlineAt: startedAt + PARSE_BUDGET_MS,
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
    // A SyntaxError is malformed model output, which a resample fixes —
    // retryable per the Definition of Done. Anything else here is a bug.
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        error: `Failed to parse Gemini response: ${message}`,
        retryable: err instanceof SyntaxError,
      },
      { status: 502 }
    );
  }

  // Stash raw extracted text alongside the parsed fields so score heuristics
  // (here and in the standalone /score route) can use it without
  // re-downloading and re-parsing the PDF. Capped at what the prompt reads.
  // jsonbSafe: the model's strings come from the same text and can carry the
  // characters Postgres refuses to store.
  const enriched = jsonbSafe({
    ...parsedContent,
    _resume_text: capStoredText(trimmed),
  });
  const heuristic = computeHeuristic(enriched);
  const { finalScore, breakdown } = combineWithHeuristic(
    heuristic,
    jsonbSafe(analysis)
  );

  // The one write of a successful parse, after the single validation gate
  // above. promote_parsed_resume (migration 0008) saves parse and score and
  // makes this row the primary in one transaction, so the feed, tailoring
  // and chat move from the previous résumé to a complete new one and never
  // see a primary without content. It runs as the user, under RLS.
  const { data: outcome, error: saveError } = await supabase.rpc(
    "promote_parsed_resume",
    {
      p_resume_id: resumeId,
      p_parsed_content: enriched,
      p_ats_score: finalScore,
      p_ats_breakdown: breakdown,
    }
  );

  if (saveError) {
    console.error(
      `[resume/parse] promote_parsed_resume failed for resume ${resumeId}: ${saveError.message}`
    );
    return NextResponse.json(
      {
        error: "We couldn't save your résumé analysis. Try again.",
        retryable: true,
      },
      { status: 500 }
    );
  }

  // The row went away while the parse ran: deleted by the user, or cleaned
  // up by a newer upload.
  if (outcome !== "promoted" && outcome !== "saved") {
    return NextResponse.json({ error: "Resume not found" }, { status: 404 });
  }

  return NextResponse.json({
    parsed: parsedContent,
    ats_score: finalScore,
    ats_breakdown: breakdown,
    // false when a newer upload had already been processed and stays primary.
    promoted: outcome === "promoted",
  });
}
