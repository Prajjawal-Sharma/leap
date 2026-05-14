import { NextResponse, type NextRequest } from "next/server";

import {
  MatchEngineFailure,
  matchJobsForResume,
} from "@/lib/jobs/match-engine";
import { createServerSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function parsePositiveInt(value: string | null, fallback: number, max?: number) {
  if (value === null) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return fallback;
  if (max !== undefined && n > max) return max;
  return n;
}

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parsePositiveInt(
    searchParams.get("limit"),
    DEFAULT_LIMIT,
    MAX_LIMIT
  );
  const offset = parsePositiveInt(searchParams.get("offset"), 0);

  try {
    const result = await matchJobsForResume(user.id, { limit, offset });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    if (err instanceof MatchEngineFailure) {
      if (err.code === "no_resume") {
        return NextResponse.json(
          {
            error: "no_resume",
            message: "Upload a resume to see matches",
          },
          { status: 400, headers: { "Cache-Control": "no-store" } }
        );
      }
      if (err.code === "no_parsed_content") {
        return NextResponse.json(
          {
            error: "no_parsed_content",
            message: "Your resume is still being processed. Try again in a moment.",
          },
          { status: 400, headers: { "Cache-Control": "no-store" } }
        );
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/jobs/match] failed:", message);
    return NextResponse.json(
      { error: "match_failed", message },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
