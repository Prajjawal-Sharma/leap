import { NextResponse, type NextRequest } from "next/server";

import { runEmbedJobs } from "@/lib/jobs/embed-runner";
import { createAdminSupabase } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Tier 1 throughput (~3000 RPM) makes 500 jobs/call comfortably finish in
// well under the 60s function ceiling.
const EMBED_LIMIT = 500;

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${expected}`;
}

async function handle() {
  const admin = createAdminSupabase();
  const summary = await runEmbedJobs(admin, { limit: EMBED_LIMIT });
  return NextResponse.json(summary);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handle();
}

// POST mirrors GET so internal tools / curl can re-trigger ad hoc.
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handle();
}
