import Link from "next/link";
import { Suspense } from "react";
import { headers } from "next/headers";

import JobCard from "@/components/features/JobCard";
import type { MatchResult } from "@/lib/jobs/match-engine";

export const dynamic = "force-dynamic";

const INITIAL_LIMIT = 20;

type MatchSuccess = { matches: MatchResult[]; total_searched: number };
type MatchError = { error: string; message?: string };
type FetchOutcome =
  | { kind: "ok"; data: MatchSuccess }
  | { kind: "no_resume"; message: string }
  | { kind: "no_parsed_content"; message: string }
  | { kind: "error"; message: string };

async function fetchMatches(): Promise<FetchOutcome> {
  const h = await headers();
  const host = h.get("host");
  const cookie = h.get("cookie") ?? "";
  const protocol =
    h.get("x-forwarded-proto") ??
    (process.env.NODE_ENV === "production" ? "https" : "http");

  if (!host) {
    return { kind: "error", message: "Missing host header" };
  }

  const url = `${protocol}://${host}/api/jobs/match?limit=${INITIAL_LIMIT}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { cookie },
      cache: "no-store",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    return { kind: "error", message };
  }

  if (res.ok) {
    const data = (await res.json()) as MatchSuccess;
    return { kind: "ok", data };
  }

  let payload: MatchError = { error: "unknown" };
  try {
    payload = (await res.json()) as MatchError;
  } catch {
    // body not JSON — fall through to generic error
  }

  if (payload.error === "no_resume") {
    return {
      kind: "no_resume",
      message: payload.message ?? "Upload a resume to see matches",
    };
  }
  if (payload.error === "no_parsed_content") {
    return {
      kind: "no_parsed_content",
      message: payload.message ?? "Your resume is still being processed",
    };
  }
  return {
    kind: "error",
    message: payload.message ?? `Match request failed (${res.status})`,
  };
}

function SkeletonCard() {
  return (
    <div className="rounded-xl bg-neutral-900/60 ring-1 ring-white/10 p-5 animate-pulse">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-5 w-2/3 rounded bg-white/10" />
          <div className="h-4 w-1/3 rounded bg-white/5" />
        </div>
        <div className="h-6 w-20 rounded-full bg-white/10" />
      </div>
      <div className="mt-3 flex gap-2">
        <div className="h-6 w-20 rounded-md bg-white/5" />
        <div className="h-6 w-16 rounded-md bg-white/5" />
      </div>
      <div className="mt-3 space-y-2">
        <div className="h-3 w-full rounded bg-white/5" />
        <div className="h-3 w-11/12 rounded bg-white/5" />
        <div className="h-3 w-3/4 rounded bg-white/5" />
      </div>
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="mt-6 grid gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

function NoResumeCard({ message }: { message: string }) {
  return (
    <div className="mt-6 rounded-xl bg-neutral-900/60 ring-1 ring-white/10 p-8 text-center">
      <h2 className="text-lg font-semibold text-white">
        Upload your resume first
      </h2>
      <p className="mt-2 text-sm text-neutral-400 max-w-md mx-auto">
        {message}. We use your resume to find roles that genuinely fit — no
        keyword stuffing.
      </p>
      <Link
        href="/resume"
        className="mt-5 inline-flex items-center rounded-md bg-[#6366f1] hover:bg-[#4f52d5] px-4 py-2 text-sm font-medium text-white"
      >
        Go to Resume
      </Link>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="mt-6 rounded-xl bg-red-500/10 ring-1 ring-red-500/30 p-5">
      <p className="text-sm text-red-100 font-medium">
        Could not load matches
      </p>
      <p className="mt-1 text-xs text-red-200/80">{message}</p>
    </div>
  );
}

async function JobMatches() {
  const result = await fetchMatches();

  if (result.kind === "no_resume" || result.kind === "no_parsed_content") {
    return <NoResumeCard message={result.message} />;
  }
  if (result.kind === "error") {
    return <ErrorCard message={result.message} />;
  }

  const { matches, total_searched } = result.data;

  if (matches.length === 0) {
    return (
      <div className="mt-6 rounded-xl bg-neutral-900/60 ring-1 ring-white/10 p-8 text-center">
        <h2 className="text-lg font-semibold text-white">No matches yet</h2>
        <p className="mt-2 text-sm text-neutral-400">
          We could not find roles that line up with your resume right now.
          New jobs are ingested daily — check back soon.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      <p className="text-xs text-neutral-500">
        Showing top {matches.length} of {total_searched} matched roles
      </p>
      <div className="grid gap-4">
        {matches.map((m) => (
          <JobCard key={m.job.id} match={m} />
        ))}
      </div>
    </div>
  );
}

export default function JobsPage() {
  return (
    <section className="max-w-4xl">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold">Job Feed</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Roles ranked by semantic match against your resume.
        </p>
      </header>

      <Suspense fallback={<FeedSkeleton />}>
        <JobMatches />
      </Suspense>
    </section>
  );
}
