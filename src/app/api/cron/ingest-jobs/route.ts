import { NextResponse, type NextRequest } from "next/server";

import { GREENHOUSE_COMPANIES } from "@/lib/jobs/companies";
import { fetchGreenhouseJobs } from "@/lib/jobs/greenhouse";
import type { NormalizedJob } from "@/lib/jobs/normalize";
import { createAdminSupabase } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

type CompanyResult = {
  slug: string;
  fetched: number;
  upserted: number;
  ok: boolean;
  error?: string;
};

type RunSummary = {
  ok: boolean;
  duration_ms: number;
  total_companies_processed: number;
  total_companies_succeeded: number;
  total_companies_failed: number;
  total_jobs_upserted: number;
  errors_per_company: Record<string, string>;
  per_company: CompanyResult[];
};

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${expected}`;
}

async function ingestCompany(
  slug: string,
  admin: ReturnType<typeof createAdminSupabase>
): Promise<CompanyResult> {
  let jobs: NormalizedJob[];
  try {
    jobs = await fetchGreenhouseJobs(slug);
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch failed";
    console.error(`[ingest-jobs] ${slug} fetch failed:`, message);
    return { slug, fetched: 0, upserted: 0, ok: false, error: message };
  }

  if (jobs.length === 0) {
    return { slug, fetched: 0, upserted: 0, ok: true };
  }

  const { error } = await admin
    .from("jobs")
    .upsert(jobs, { onConflict: "source,source_id" });

  if (error) {
    console.error(`[ingest-jobs] ${slug} upsert failed:`, error.message);
    return {
      slug,
      fetched: jobs.length,
      upserted: 0,
      ok: false,
      error: `upsert: ${error.message}`,
    };
  }

  return { slug, fetched: jobs.length, upserted: jobs.length, ok: true };
}

async function runIngest(): Promise<RunSummary> {
  const admin = createAdminSupabase();
  const startedAt = Date.now();

  const perCompany: CompanyResult[] = [];
  const errorsPerCompany: Record<string, string> = {};
  let totalUpserted = 0;

  // Sequential — Greenhouse rate-limits aggressive parallel fetches and the
  // total wall time fits well inside maxDuration.
  for (const slug of GREENHOUSE_COMPANIES) {
    const result = await ingestCompany(slug, admin);
    perCompany.push(result);
    if (result.ok) {
      totalUpserted += result.upserted;
    } else if (result.error) {
      errorsPerCompany[slug] = result.error;
    }
  }

  const succeeded = perCompany.filter((c) => c.ok).length;
  const failed = perCompany.length - succeeded;

  return {
    ok: failed === 0,
    duration_ms: Date.now() - startedAt,
    total_companies_processed: perCompany.length,
    total_companies_succeeded: succeeded,
    total_companies_failed: failed,
    total_jobs_upserted: totalUpserted,
    errors_per_company: errorsPerCompany,
    per_company: perCompany,
  };
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const summary = await runIngest();
  return NextResponse.json(summary);
}

// Vercel cron uses GET by default, but accept POST too for ad-hoc triggers
// from internal tools / curl with a body.
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const summary = await runIngest();
  return NextResponse.json(summary);
}
