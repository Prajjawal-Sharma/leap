import Link from "next/link";
import { Suspense } from "react";
import { headers } from "next/headers";

import KanbanBoard from "@/components/features/KanbanBoard";
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

function BoardSkeleton() {
  return (
    <div className="mt-6 flex gap-3 overflow-x-auto pb-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="shrink-0 w-[85vw] sm:w-[300px] md:w-[280px] xl:w-[300px] rounded-xl bg-neutral-900/40 ring-1 ring-white/10"
        >
          <div className="h-10 border-b border-white/10 px-3 py-2.5 flex items-center justify-between">
            <div className="h-3 w-20 rounded bg-white/10 animate-pulse" />
            <div className="h-3 w-6 rounded bg-white/5 animate-pulse" />
          </div>
          <div className="px-2.5 py-2.5 space-y-2">
            {Array.from({ length: 2 }).map((_, j) => (
              <div
                key={j}
                className="rounded-lg bg-neutral-900/80 ring-1 ring-white/10 px-3 py-2.5 animate-pulse"
              >
                <div className="flex gap-2.5">
                  <div className="h-9 w-9 rounded-md bg-white/5" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-3/4 rounded bg-white/10" />
                    <div className="h-2.5 w-1/2 rounded bg-white/5" />
                    <div className="h-3 w-1/3 rounded bg-white/5" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-6 rounded-xl bg-neutral-900/60 ring-1 ring-white/10 p-8 text-center">
      <h2 className="text-lg font-semibold text-white">
        Your tracker is empty
      </h2>
      <p className="mt-2 text-sm text-neutral-400 max-w-md mx-auto">
        Save jobs from your feed to start tracking. As you apply and hear
        back, drag them across the columns to keep your pipeline visible.
      </p>
      <Link
        href="/jobs"
        className="mt-5 inline-flex items-center rounded-md bg-[#6366f1] hover:bg-[#4f52d5] px-4 py-2 text-sm font-medium text-white"
      >
        Browse jobs
      </Link>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="mt-6 rounded-xl bg-red-500/10 ring-1 ring-red-500/30 p-5">
      <p className="text-sm text-red-100 font-medium">
        Could not load applications
      </p>
      <p className="mt-1 text-xs text-red-200/80">{message}</p>
    </div>
  );
}

async function ApplicationsList() {
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

  return (
    <div className="mt-6">
      <KanbanBoard initialApplications={outcome.applications} />
    </div>
  );
}

export default function ApplicationsPage() {
  return (
    <section>
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold">Applications</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Drag cards between columns as your applications progress.
        </p>
      </header>

      <Suspense fallback={<BoardSkeleton />}>
        <ApplicationsList />
      </Suspense>
    </section>
  );
}
