"use client";

import { useEffect, useState } from "react";

import JobCard from "@/components/features/JobCard";
import type { MatchResult } from "@/lib/jobs/match-engine";
import type { ApplicationWithJob } from "@/types/applications";

type Props = {
  initialMatches: MatchResult[];
  totalSearched: number;
};

export default function JobFeed({ initialMatches, totalSearched }: Props) {
  // Indexed by job_id so each card looks up its own state in O(1).
  const [appsByJobId, setAppsByJobId] = useState<
    Map<string, ApplicationWithJob>
  >(() => new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/applications", { cache: "no-store" });
        if (!res.ok) return; // best-effort — JobCard renders fine without state
        const data = (await res.json()) as {
          applications: ApplicationWithJob[];
        };
        if (cancelled) return;
        const next = new Map<string, ApplicationWithJob>();
        for (const a of data.applications ?? []) {
          if (a.job?.id) next.set(a.job.id, a);
        }
        setAppsByJobId(next);
      } catch {
        // Network error — leave the map empty. Save/Apply buttons still work;
        // POST is idempotent so the worst case is one wasted insert attempt.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleApplicationChange = (application: ApplicationWithJob) => {
    if (!application.job?.id) return;
    setAppsByJobId((prev) => {
      const next = new Map(prev);
      next.set(application.job.id, application);
      return next;
    });
  };

  return (
    <div className="mt-6 space-y-4">
      <p className="text-xs text-neutral-500">
        Showing top {initialMatches.length} of {totalSearched} matched roles
      </p>
      <div className="grid gap-4">
        {initialMatches.map((m) => {
          const existing = appsByJobId.get(m.job.id) ?? null;
          // Compound key — when an application is created or its status
          // transitions, the id-or-status changes and JobCard remounts with
          // the fresh prop, so it never holds stale optimistic state.
          const cardKey = existing
            ? `app-${existing.id}-${existing.status}`
            : `job-${m.job.id}`;
          return (
            <JobCard
              key={cardKey}
              match={m}
              existingApplication={existing}
              onApplicationChange={handleApplicationChange}
            />
          );
        })}
      </div>
    </div>
  );
}
