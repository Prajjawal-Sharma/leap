import { NextResponse, type NextRequest } from "next/server";

import { runIngest } from "@/lib/jobs/ingest-runner";
import { createAdminSupabase } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${expected}`;
}

async function handle() {
  try {
    const admin = createAdminSupabase();
    const summary = await runIngest(admin);
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ingest-jobs] route handler threw:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handle();
}

// Vercel cron uses GET by default, but accept POST too for ad-hoc triggers
// from internal tools / curl with a body.
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handle();
}
