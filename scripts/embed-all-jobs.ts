/**
 * Backfill driver for the embedding pipeline. Hits /api/cron/embed-jobs
 * sequentially until the response reports total_embedded === 0 (queue is
 * drained).
 *
 *   npx tsx scripts/embed-all-jobs.ts
 *
 * Embeddings now run on GEMINI_KEY_1's Tier 1 (paid) project, so the
 * concurrent-worker / sharding / round-pacing dance from the free-tier era
 * is gone. One worker, one call at a time, no inter-call sleep — the cron
 * route handles ~500 jobs in ~15s on Tier 1.
 *
 * Reads CRON_SECRET and NEXT_PUBLIC_APP_URL from .env.local manually so we
 * don't need a dotenv dependency. Falls back to APP_URL env var, then to
 * http://localhost:3000.
 */
import fs from "node:fs";
import path from "node:path";

type EmbedSummary = {
  ok: boolean;
  duration_ms: number;
  total_processed: number;
  total_embedded: number;
  total_skipped: number;
  total_failed: number;
  jobs_remaining: number;
};

const CALL_TIMEOUT_MS = 60_000;

function loadDotEnv(file: string): Record<string, string> {
  const env: Record<string, string> = {};
  if (!fs.existsSync(file)) return env;
  const content = fs.readFileSync(file, "utf-8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) env[key] = value;
  }
  return env;
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s}s`;
}

async function main() {
  const localEnv = loadDotEnv(path.resolve(".env.local"));
  const secret = localEnv.CRON_SECRET || process.env.CRON_SECRET || "";
  const appUrl =
    localEnv.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "http://localhost:3000";

  if (!secret) {
    console.error("CRON_SECRET not found in .env.local or process env");
    process.exit(1);
  }

  const endpoint = `${appUrl.replace(/\/$/, "")}/api/cron/embed-jobs`;
  console.log(`Driving ${endpoint}`);

  const startedAt = Date.now();
  let batch = 1;
  let grandEmbedded = 0;
  let grandFailed = 0;
  let grandSkipped = 0;

  while (true) {
    const t0 = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "GET",
        headers: { Authorization: `Bearer ${secret}` },
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      const reason =
        err instanceof Error
          ? err.name === "AbortError"
            ? `aborted after ${CALL_TIMEOUT_MS / 1000}s`
            : err.message
          : "unknown";
      console.error(`Batch ${batch}: ERROR ${reason} (${Date.now() - t0}ms)`);
      process.exit(1);
    }
    clearTimeout(timeout);

    const elapsed = Date.now() - t0;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `Batch ${batch}: HTTP ${res.status} (${elapsed}ms): ${body.slice(0, 200)}`
      );
      process.exit(1);
    }

    const summary = (await res.json()) as EmbedSummary;
    grandEmbedded += summary.total_embedded;
    grandFailed += summary.total_failed;
    grandSkipped += summary.total_skipped;

    console.log(
      `Batch ${batch}: ${summary.total_embedded} embedded, ${summary.jobs_remaining} remaining (${elapsed}ms)`
    );

    if (summary.total_embedded === 0) break;
    batch++;
  }

  const wallMs = Date.now() - startedAt;
  const minutes = wallMs / 60_000;
  const rate = minutes > 0 ? Math.round(grandEmbedded / minutes) : 0;
  console.log(
    `\nDone in ${formatDuration(wallMs)} — total embedded ${grandEmbedded}, failed ${grandFailed}, skipped ${grandSkipped} (avg ${rate} jobs/min)`
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
