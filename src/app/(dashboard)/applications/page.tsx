import Link from "next/link";
import { Suspense } from "react";
import { headers } from "next/headers";

import ApplicationsDashboard from "@/components/features/ApplicationsDashboard";
import type { ApplicationWithJob } from "@/types/applications";

export const dynamic = "force-dynamic";

type FetchOutcome =
  | { kind: "ok"; applications: ApplicationWithJob[] }
  | { kind: "unauthorized" }
  | { kind: "error"; message: string };

async function fetchApplications(): Promise<FetchOutcome> {
  const h = await headers();
  const host = h.get("host");
  const cookie = h.get("cookie") ?? "";
  const protocol =
    h.get("x-forwarded-proto") ??
    (process.env.NODE_ENV === "production" ? "https" : "http");

  if (!host) return { kind: "error", message: "Missing host header" };

  const url = `${protocol}://${host}/api/applications`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { cookie }, cache: "no-store" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    return { kind: "error", message };
  }

  if (res.status === 401) return { kind: "unauthorized" };
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // body not JSON; keep default
    }
    return { kind: "error", message };
  }

  const data = (await res.json()) as { applications: ApplicationWithJob[] };
  return { kind: "ok", applications: data.applications ?? [] };
}

function StatTileSkeleton() {
  return (
    <div className="rounded-xl bg-neutral-900/40 ring-1 ring-white/10 px-4 py-3.5">
      <div className="h-3 w-20 rounded bg-white/10 animate-pulse" />
      <div className="mt-2 h-7 w-12 rounded bg-white/10 animate-pulse" />
      <div className="mt-2 h-2.5 w-28 rounded bg-white/5 animate-pulse" />
    </div>
  );
}

function ColumnSkeleton() {
  return (
    <div className="rounded-xl bg-neutral-900/30 ring-1 ring-white/10">
      <div className="px-3 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
        <div className="h-3 w-16 rounded bg-white/10 animate-pulse" />
        <div className="h-3 w-5 rounded bg-white/5 animate-pulse" />
      </div>
      <div className="px-2 py-2 space-y-2">
        {Array.from({ length: 2 }).map((_, j) => (
          <div
            key={j}
            className="rounded-lg bg-neutral-900/80 ring-1 ring-white/10 px-3 py-2.5"
          >
            <div className="flex items-start gap-2.5">
              <div className="h-8 w-8 rounded-md bg-white/10 animate-pulse" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-3/4 rounded bg-white/10 animate-pulse" />
                <div className="h-2.5 w-1/2 rounded bg-white/5 animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatTileSkeleton key={i} />
        ))}
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="h-9 w-72 rounded-md bg-neutral-900/60 ring-1 ring-white/10 animate-pulse" />
        <div className="h-9 w-44 rounded-md bg-neutral-900/60 ring-1 ring-white/10 animate-pulse" />
      </div>
      <div className="hidden xl:grid xl:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <ColumnSkeleton key={i} />
        ))}
      </div>
      <div className="xl:hidden space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <ColumnSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl bg-gradient-to-b from-neutral-900/60 to-neutral-900/30 ring-1 ring-white/10 p-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#6366f1]/15 ring-1 ring-[#6366f1]/30">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-[#a5a8f5]"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="5" height="16" rx="1.5" />
          <rect x="10" y="4" width="5" height="10" rx="1.5" />
          <rect x="17" y="4" width="5" height="6" rx="1.5" />
        </svg>
      </div>
      <h2 className="mt-4 text-base font-semibold text-white">
        Your tracker is empty
      </h2>
      <p className="mt-2 text-sm text-neutral-400 max-w-md mx-auto">
        Save jobs from your feed to start tracking. Drag cards between columns
        as you apply, interview, and hear back — your pipeline stays visible
        end to end.
      </p>
      <Link
        href="/jobs"
        className="mt-5 inline-flex items-center rounded-md bg-[#6366f1] hover:bg-[#4f52d5] px-4 py-2 text-sm font-medium text-white"
      >
        Browse matched jobs
      </Link>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-xl bg-red-500/10 ring-1 ring-red-500/30 p-5">
      <p className="text-sm text-red-100 font-medium">
        Could not load applications
      </p>
      <p className="mt-1 text-xs text-red-200/80">{message}</p>
    </div>
  );
}

async function ApplicationsContent() {
  const outcome = await fetchApplications();

  if (outcome.kind === "unauthorized") {
    return (
      <ErrorCard message="Your session expired. Refresh the page to sign back in." />
    );
  }
  if (outcome.kind === "error") {
    return <ErrorCard message={outcome.message} />;
  }
  if (outcome.applications.length === 0) {
    return <EmptyState />;
  }

  return <ApplicationsDashboard initialApplications={outcome.applications} />;
}

export default function ApplicationsPage() {
  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            Applications
          </h1>
          <span className="text-[10px] font-semibold uppercase tracking-wider rounded-full bg-white/[0.04] ring-1 ring-white/10 text-neutral-400 px-2 py-0.5">
            Pipeline
          </span>
        </div>
        <p className="text-sm text-neutral-400">
          Track every role you&rsquo;re working — from saved leads to signed
          offers. Drag cards between stages to update status.
        </p>
      </header>

      <Suspense fallback={<DashboardSkeleton />}>
        <ApplicationsContent />
      </Suspense>
    </section>
  );
}
