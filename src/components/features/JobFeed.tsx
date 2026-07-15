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
  // job_id → stored tailored resume id, so cards reflect an already-kept
  // tailored resume after a reload.
  const [tailoredByJobId, setTailoredByJobId] = useState<Map<string, string>>(
    () => new Map()
  );

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
    (async () => {
      try {
        const res = await fetch("/api/resume/tailor", { cache: "no-store" });
        if (!res.ok) return; // best-effort, same as applications above
        const data = (await res.json()) as {
          tailored: Array<{ id: string; job_id: string | null }>;
        };
        if (cancelled) return;
        const next = new Map<string, string>();
        for (const t of data.tailored ?? []) {
          if (t.job_id) next.set(t.job_id, t.id);
        }
        setTailoredByJobId(next);
      } catch {
        // Best-effort — tailoring still works, the card just starts from the
        // "not yet tailored" label and the POST is idempotent server-side.
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

  const handleTailoredChange = (jobId: string, resumeId: string | null) => {
    setTailoredByJobId((prev) => {
      const next = new Map(prev);
      if (resumeId) {
        next.set(jobId, resumeId);
      } else {
        next.delete(jobId);
      }
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
          const tailoredId = tailoredByJobId.get(m.job.id) ?? null;
          // Compound key — when an application is created or its status
          // transitions (or a tailored resume is kept/discarded), the key
          // changes and JobCard remounts with the fresh prop, so it never
          // holds stale optimistic state.
          const cardKey = [
            existing ? `app-${existing.id}-${existing.status}` : `job-${m.job.id}`,
            tailoredId ? `t-${tailoredId}` : "t-none",
          ].join("-");
          return (
            <JobCard
              key={cardKey}
              match={m}
              existingApplication={existing}
              onApplicationChange={handleApplicationChange}
              existingTailoredResumeId={tailoredId}
              onTailoredChange={handleTailoredChange}
            />
          );
        })}
      </div>
    </div>
  );
}
