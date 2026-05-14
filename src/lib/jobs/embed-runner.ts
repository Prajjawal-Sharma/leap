import { embedBatch } from "@/lib/ai/embeddings";
import { createAdminSupabase } from "@/lib/supabase-admin";

import { buildJobEmbeddingText, isJobEmbeddable } from "./build-embedding-text";

type SupabaseAdmin = ReturnType<typeof createAdminSupabase>;

type JobRow = {
  id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  description: string | null;
  requirements: string | null;
  is_remote: boolean | null;
  employment_type: string | null;
};

const DEFAULT_LIMIT = 500;
const PAGE_SIZE = 1000;

export type EmbedRunSummary = {
  ok: boolean;
  duration_ms: number;
  total_processed: number;
  total_embedded: number;
  total_skipped: number;
  total_failed: number;
  jobs_remaining: number;
};

// supabase-js can't express "id NOT IN (subquery)" via the URL filter API
// without busting URL length on real-world ID counts. Two-step approach: pull
// the set of already-embedded job_ids into memory, then page through jobs
// newest-first and collect unembedded ones until we hit `limit`.
//
// The embedded-ids fetch MUST paginate — supabase-js applies a default 1000-row
// cap on SELECTs, and once we cross that threshold the in-memory set is
// silently incomplete. The previous version of this code lost ~500 IDs once
// job_embeddings passed 1000 rows, which made the runner re-embed (upsert
// into) the same 500 rows on every cron call while reporting them as new
// successes.
async function findUnembeddedJobs(
  admin: SupabaseAdmin,
  limit: number
): Promise<JobRow[]> {
  const embeddedSet = new Set<string>();
  let embOffset = 0;
  while (true) {
    const { data: page, error: e1 } = await admin
      .from("job_embeddings")
      .select("job_id")
      .range(embOffset, embOffset + PAGE_SIZE - 1);
    if (e1) {
      throw new Error(`fetch job_embeddings ids failed: ${e1.message}`);
    }
    if (!page || page.length === 0) break;
    for (const r of page) embeddedSet.add(r.job_id as string);
    if (page.length < PAGE_SIZE) break;
    embOffset += PAGE_SIZE;
  }

  const collected: JobRow[] = [];
  let offset = 0;
  while (collected.length < limit) {
    const { data: page, error: e2 } = await admin
      .from("jobs")
      .select(
        "id, title, company, location, description, requirements, is_remote, employment_type"
      )
      .order("ingested_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (e2) {
      throw new Error(`fetch jobs page (offset=${offset}) failed: ${e2.message}`);
    }
    if (!page || page.length === 0) break;

    for (const job of page as JobRow[]) {
      if (!embeddedSet.has(job.id)) {
        collected.push(job);
        if (collected.length >= limit) break;
      }
    }
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return collected;
}

async function countRemaining(admin: SupabaseAdmin): Promise<number> {
  const [{ count: jobsCount }, { count: embedCount }] = await Promise.all([
    admin.from("jobs").select("id", { count: "exact", head: true }),
    admin.from("job_embeddings").select("job_id", { count: "exact", head: true }),
  ]);
  return Math.max(0, (jobsCount ?? 0) - (embedCount ?? 0));
}

// Tier 1 throughput (~3000 RPM) makes single-worker drains practical. The
// concurrent worker-sharding scheme that lived here for the free-tier era
// is gone — embedBatch's 100/request chunking is enough.
export async function runEmbedJobs(
  admin: SupabaseAdmin,
  opts: { limit?: number } = {}
): Promise<EmbedRunSummary> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const startedAt = Date.now();

  const jobs = await findUnembeddedJobs(admin, limit);

  console.log(
    `[embed-jobs] candidate fetch: total=${jobs.length}, first_ids=${JSON.stringify(
      jobs.slice(0, 3).map((j) => j.id)
    )}`
  );

  if (jobs.length === 0) {
    return {
      ok: true,
      duration_ms: Date.now() - startedAt,
      total_processed: 0,
      total_embedded: 0,
      total_skipped: 0,
      total_failed: 0,
      jobs_remaining: await countRemaining(admin),
    };
  }

  // Pre-filter degenerate rows so we don't waste tokens / DB writes on jobs
  // whose embedding text is essentially "Title: \nCompany: \n…".
  const valid: { job: JobRow; text: string }[] = [];
  let skipped = 0;
  for (const job of jobs) {
    if (!isJobEmbeddable(job)) {
      console.warn(
        `[embed-jobs] skipping job ${job.id} (${job.title ?? "<no title>"}): no title or description`
      );
      skipped++;
      continue;
    }
    valid.push({ job, text: buildJobEmbeddingText(job) });
  }

  let totalEmbedded = 0;
  let totalFailed = 0;

  // Hand the whole text array to embedBatch — it chunks at MAX_BATCH (100)
  // internally and runs each chunk in sequence on the Tier 1 key. Per-batch
  // errors are surfaced as exceptions, so we can localize failures by
  // shadowing the chunking here at the runner level too.
  const allTexts = valid.map((v) => v.text);
  let vectors: number[][] = [];
  try {
    vectors = await embedBatch(allTexts);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error(`[embed-jobs] embedBatch failed:`, msg);
    totalFailed = valid.length;
    return {
      ok: false,
      duration_ms: Date.now() - startedAt,
      total_processed: jobs.length,
      total_embedded: 0,
      total_skipped: skipped,
      total_failed: totalFailed,
      jobs_remaining: await countRemaining(admin),
    };
  }

  // Insert in DB-friendly chunks so a 500-row batch doesn't make one massive
  // PostgREST request. 100 rows × 768 floats ≈ 300KB — comfortable.
  const DB_CHUNK = 100;
  for (let i = 0; i < valid.length; i += DB_CHUNK) {
    const chunkNum = Math.floor(i / DB_CHUNK) + 1;
    const sliceJobs = valid.slice(i, i + DB_CHUNK);
    const rows = sliceJobs.map((s, idx) => ({
      job_id: s.job.id,
      embedding: vectors[i + idx],
    }));

    console.log(
      `[embed-jobs] chunk ${chunkNum} upsert: count=${rows.length}, ` +
        `job_ids=${JSON.stringify(rows.map((r) => r.job_id))}, ` +
        `vector_lengths=${JSON.stringify(rows.map((r) => r.embedding?.length ?? -1))}`
    );

    const { error, data } = await admin
      .from("job_embeddings")
      .upsert(rows, { onConflict: "job_id" })
      .select("job_id");

    console.log(
      `[embed-jobs] chunk ${chunkNum} response:`,
      JSON.stringify({ error, data_count: data?.length ?? 0, data })
    );

    if (error) {
      console.error(
        `[embed-jobs] insert chunk ${chunkNum} failed:`,
        error.message
      );
      totalFailed += rows.length;
      continue;
    }
    // Reflect rows actually returned by PostgREST, not the input size — the
    // previous "trust the input batch" accounting was what hid the 1000-row
    // SELECT cap bug above: upsert was succeeding but updating the same rows.
    const written = data?.length ?? 0;
    totalEmbedded += written;
    if (written < rows.length) {
      totalFailed += rows.length - written;
    }
  }

  return {
    ok: totalFailed === 0,
    duration_ms: Date.now() - startedAt,
    total_processed: jobs.length,
    total_embedded: totalEmbedded,
    total_skipped: skipped,
    total_failed: totalFailed,
    jobs_remaining: await countRemaining(admin),
  };
}
