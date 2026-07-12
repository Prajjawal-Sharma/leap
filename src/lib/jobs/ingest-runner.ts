import { GREENHOUSE_COMPANIES } from "@/lib/jobs/companies";
import { fetchGreenhouseJobs, humanizeCompany } from "@/lib/jobs/greenhouse";
import type { NormalizedJob } from "@/lib/jobs/normalize";
import { createAdminSupabase } from "@/lib/supabase-admin";

type SupabaseAdmin = ReturnType<typeof createAdminSupabase>;

// How many Greenhouse boards we fetch at once. Sequential fetches (the old
// behavior) risk the 60s function ceiling: 25 boards × 15s timeout each is
// 375s worst-case, so a handful of slow boards could starve the run. At 5-way
// concurrency a typical run (~1-3s per board) finishes in well under 30s, and
// even several timing-out boards stay affordable. Kept modest so we don't
// trip Greenhouse rate limits with aggressive parallelism.
const FETCH_CONCURRENCY = 5;

// A job expires after this many consecutive days absent from every successful
// fetch of its board. Time-based (not per-run set-difference) so a partial or
// failed run can never over-deactivate: a fetch failure simply doesn't bump
// last_seen_at, and the job survives until the board genuinely stops listing
// it for STALE_AFTER_DAYS. On top of the time window, companies whose
// fetch/upsert failed THIS run are exempted from the sweep outright — without
// that, a company already sitting past the cutoff (e.g. every pre-migration
// row, whose backfilled last_seen_at is its first-ever ingestion time, or any
// company whose board has been unreachable for N straight days) would lose
// its entire live inventory to one more transient failure.
const STALE_AFTER_DAYS = 4;

export type CompanyResult = {
  slug: string;
  fetched: number;
  upserted: number;
  ok: boolean;
  error?: string;
};

export type DeactivationResult =
  | { swept: true; deactivated: number }
  | { swept: false; reason: string };

export type IngestRunSummary = {
  ok: boolean;
  duration_ms: number;
  total_companies_processed: number;
  total_companies_succeeded: number;
  total_companies_failed: number;
  total_jobs_upserted: number;
  total_jobs_deactivated: number;
  deactivation: DeactivationResult;
  errors_per_company: Record<string, string>;
  per_company: CompanyResult[];
};

// Order-preserving bounded-concurrency map: at most `limit` calls to fn are
// in flight at any moment. Workers pull the next index off a shared cursor,
// so results land at their item's position regardless of completion order.
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        results[i] = await fn(items[i], i);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

async function ingestCompany(
  slug: string,
  admin: SupabaseAdmin
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

  // Every job present in a successful fetch gets its freshness bumped and is
  // (re)activated — a job that vanished, was swept inactive, and later
  // reappeared on the board comes back to life here. upsert updates all
  // supplied columns on conflict, so these two fields apply to existing rows
  // as well as new ones.
  const seenAt = new Date().toISOString();
  const rows = jobs.map((j) => ({ ...j, is_active: true, last_seen_at: seenAt }));

  const { error } = await admin
    .from("jobs")
    .upsert(rows, { onConflict: "source,source_id" });

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

// Deactivate greenhouse jobs whose board stopped listing them: any row whose
// last_seen_at is older than STALE_AFTER_DAYS hasn't appeared in ANY
// successful fetch of its board across that whole window. Companies in
// `excludeCompanies` (fetch/upsert failed this run) are spared — we confirmed
// nothing about their boards, so their staleness proves nothing. Scoped to
// source='greenhouse' — other sources (Phase 2) get their own freshness
// semantics when they land.
async function sweepStaleJobs(
  admin: SupabaseAdmin,
  excludeCompanies: string[]
): Promise<DeactivationResult> {
  const cutoff = new Date(
    Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  let query = admin
    .from("jobs")
    .update({ is_active: false })
    .eq("source", "greenhouse")
    .eq("is_active", true)
    .lt("last_seen_at", cutoff);
  if (excludeCompanies.length > 0) {
    // PostgREST `in` list: comma-separated, double-quoted (names have spaces).
    query = query.not(
      "company",
      "in",
      `(${excludeCompanies.map((c) => JSON.stringify(c)).join(",")})`
    );
  }
  const { data, error } = await query.select("id");

  if (error) {
    console.error(`[ingest-jobs] deactivation sweep failed:`, error.message);
    return { swept: false, reason: `sweep: ${error.message}` };
  }

  const deactivated = data?.length ?? 0;
  if (deactivated > 0) {
    console.log(
      `[ingest-jobs] deactivated ${deactivated} jobs not seen since ${cutoff}`
    );
  }
  return { swept: true, deactivated };
}

// NOTE: no inline embedding pass here anymore. Embedding is owned entirely by
// the dedicated embed-jobs cron (03:00 UTC, an hour after this one) — the
// inline pass was the main threat to the 60s maxDuration ceiling and the
// dedicated cron picks up everything anyway.
export async function runIngest(admin: SupabaseAdmin): Promise<IngestRunSummary> {
  const startedAt = Date.now();

  const perCompany = await mapWithConcurrency(
    GREENHOUSE_COMPANIES,
    FETCH_CONCURRENCY,
    (slug) => ingestCompany(slug, admin)
  );

  const errorsPerCompany: Record<string, string> = {};
  let totalUpserted = 0;
  for (const result of perCompany) {
    if (result.ok) {
      totalUpserted += result.upserted;
    } else if (result.error) {
      errorsPerCompany[result.slug] = result.error;
    }
  }

  const succeeded = perCompany.filter((c) => c.ok).length;
  const failed = perCompany.length - succeeded;

  // Only sweep when this run actually confirmed at least one real listing.
  // `succeeded` alone isn't enough: a deleted/404 board reads as ok with 0
  // jobs (intended — its rows should expire), but if EVERY board comes back
  // failed or empty something systemic is wrong (network egress, Greenhouse
  // API change 404ing everything, bad deploy) — don't sweep on top of a run
  // that confirmed nothing. Companies that failed THIS run are exempted from
  // the sweep entirely: their staleness is unconfirmed, and without the
  // exemption a company already past the cutoff (day-one backfill, or a board
  // unreachable for N straight days) would lose live jobs to one transient
  // failure.
  const confirmedAny = perCompany.some((c) => c.ok && c.fetched > 0);
  const failedCompanies = perCompany
    .filter((c) => !c.ok)
    .map((c) => humanizeCompany(c.slug));
  const deactivation: DeactivationResult = confirmedAny
    ? await sweepStaleJobs(admin, failedCompanies)
    : {
        swept: false,
        reason: "no board returned any jobs this run — sweep skipped",
      };

  return {
    ok: failed === 0 && deactivation.swept,
    duration_ms: Date.now() - startedAt,
    total_companies_processed: perCompany.length,
    total_companies_succeeded: succeeded,
    total_companies_failed: failed,
    total_jobs_upserted: totalUpserted,
    total_jobs_deactivated: deactivation.swept ? deactivation.deactivated : 0,
    deactivation,
    errors_per_company: errorsPerCompany,
    per_company: perCompany,
  };
}
