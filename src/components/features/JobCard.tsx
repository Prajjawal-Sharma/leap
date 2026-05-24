"use client";

import { useState } from "react";

import type { MatchResult } from "@/lib/jobs/match-engine";
import type {
  ApplicationStatus,
  ApplicationWithJob,
} from "@/types/applications";

const DESCRIPTION_PREVIEW_CHARS = 200;

// A minimal slice of the application — enough for the card to render its
// badge state without dragging in the full joined-job payload that lives in
// the kanban view. Whoever owns the parent map can hand us either.
export type JobCardApplication = Pick<
  ApplicationWithJob,
  "id" | "status" | "applied_at"
>;

type Props = {
  match: MatchResult;
  existingApplication?: JobCardApplication | null;
  onApplicationChange?: (application: ApplicationWithJob) => void;
};

function pillClasses(score: number): string {
  if (score >= 70) {
    return "bg-green-500/15 text-green-300 ring-green-500/30";
  }
  if (score >= 50) {
    return "bg-yellow-500/15 text-yellow-200 ring-yellow-500/30";
  }
  return "bg-red-500/15 text-red-300 ring-red-500/30";
}

function previewText(description: string | null | undefined): string {
  if (!description) return "";
  const cleaned = description.replace(/\s+/g, " ").trim();
  if (cleaned.length <= DESCRIPTION_PREVIEW_CHARS) return cleaned;
  return cleaned.slice(0, DESCRIPTION_PREVIEW_CHARS).trimEnd() + "…";
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function appliedBadgeText(app: JobCardApplication): string {
  if (app.status === "saved") return "Saved";
  const dateLabel = formatDate(app.applied_at);
  if (app.status === "applied") {
    return dateLabel ? `Applied on ${dateLabel}` : "Applied";
  }
  // For viewed / interviewing / offered / rejected / withdrawn we surface the
  // status verbatim so the user can tell their tracker isn't stale.
  const label = app.status.charAt(0).toUpperCase() + app.status.slice(1);
  return dateLabel ? `${label} · ${dateLabel}` : label;
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M3.5 2.5h9v12l-4.5-3-4.5 3v-12z" strokeLinejoin="round" />
    </svg>
  );
}

export default function JobCard({
  match,
  existingApplication = null,
  onApplicationChange,
}: Props) {
  const { job, match_score } = match;
  const title = job.title?.trim() || "Untitled role";
  const company = job.company?.trim() || "Unknown company";
  const location = job.location?.trim() || "";
  const preview = previewText(job.description);
  const employmentType = job.employment_type?.trim() || "";

  // The parent (JobFeed) keys each JobCard by application id (or the bare
  // job id when no application exists yet). When the user's existing
  // applications fetch resolves, or a save/apply transitions the row,
  // the parent's key changes and this component remounts — initializing
  // optimisticApp from the fresh prop. No prop→state sync effect needed.
  const [optimisticApp, setOptimisticApp] = useState<JobCardApplication | null>(
    existingApplication
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasApplication = optimisticApp !== null;
  const isSavedOnly = optimisticApp?.status === "saved";
  const isAppliedOrBeyond =
    optimisticApp !== null && optimisticApp.status !== "saved";

  const handleSave = async () => {
    if (saving || hasApplication) return;
    setError(null);
    setSaving(true);

    // Optimistic: stamp a synthetic application immediately so the badge
    // flips before the network round-trip.
    const previous = optimisticApp;
    setOptimisticApp({
      id: "__optimistic__",
      status: "saved",
      applied_at: new Date().toISOString(),
    });

    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: job.id, status: "saved" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Save failed (${res.status})`);
      }
      const data = (await res.json()) as { application: ApplicationWithJob };
      setOptimisticApp({
        id: data.application.id,
        status: data.application.status,
        applied_at: data.application.applied_at,
      });
      onApplicationChange?.(data.application);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setError(msg);
      setOptimisticApp(previous);
    } finally {
      setSaving(false);
    }
  };

  // Fired alongside the native link click. The `<a target="_blank">` opens
  // the apply tab natively even though this handler runs async work — no
  // popup blocker risk, and we don't have to await before the user lands on
  // the recruiter page.
  const handleApplyClick = () => {
    if (isAppliedOrBeyond) return; // nothing to record on the server
    void (async () => {
      const previous = optimisticApp;
      const optimistic: JobCardApplication = {
        id: previous?.id ?? "__optimistic__",
        status: "applied" as ApplicationStatus,
        applied_at: previous?.applied_at ?? new Date().toISOString(),
      };
      setOptimisticApp(optimistic);

      try {
        let result: ApplicationWithJob;
        if (previous && previous.status === "saved" && previous.id !== "__optimistic__") {
          const res = await fetch("/api/applications", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: previous.id, status: "applied" }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error ?? `Update failed (${res.status})`);
          }
          const data = (await res.json()) as {
            application: ApplicationWithJob;
          };
          result = data.application;
        } else {
          const res = await fetch("/api/applications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ job_id: job.id, status: "applied" }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error ?? `Apply failed (${res.status})`);
          }
          const data = (await res.json()) as {
            application: ApplicationWithJob;
          };
          result = data.application;
          // POST is idempotent: if the row was already past 'saved' we keep
          // whatever the server returned (e.g. user is in 'interviewing'
          // and reopened the apply link).
        }
        setOptimisticApp({
          id: result.id,
          status: result.status,
          applied_at: result.applied_at,
        });
        onApplicationChange?.(result);
      } catch (err) {
        // The apply tab is already open. Quietly revert the badge — silent
        // failure is preferable to a toast that the user has to dismiss
        // from a now-backgrounded window.
        console.error("[JobCard] apply failed:", err);
        setOptimisticApp(previous);
      }
    })();
  };

  return (
    <article className="rounded-xl bg-neutral-900/60 ring-1 ring-white/10 p-5 hover:ring-white/20 transition">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-white truncate">
            {title}
          </h3>
          <p className="mt-0.5 text-sm text-neutral-300 truncate">{company}</p>
        </div>
        <span
          className={[
            "shrink-0 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
            pillClasses(match_score),
          ].join(" ")}
          title="Semantic match score vs your resume"
        >
          {match_score}% match
        </span>
      </header>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {location && (
          <span className="rounded-md bg-white/5 ring-1 ring-white/10 px-2 py-1 text-neutral-300">
            {location}
          </span>
        )}
        {job.is_remote && (
          <span className="rounded-md bg-indigo-500/15 ring-1 ring-indigo-500/30 px-2 py-1 text-indigo-200">
            Remote
          </span>
        )}
        {employmentType && (
          <span className="rounded-md bg-white/5 ring-1 ring-white/10 px-2 py-1 text-neutral-300 capitalize">
            {employmentType.toLowerCase()}
          </span>
        )}
        {hasApplication && optimisticApp && (
          <span
            className={[
              "rounded-md px-2 py-1 ring-1",
              isAppliedOrBeyond
                ? "bg-blue-500/15 text-blue-200 ring-blue-500/30"
                : "bg-neutral-500/15 text-neutral-200 ring-neutral-500/30",
            ].join(" ")}
          >
            {appliedBadgeText(optimisticApp)}
          </span>
        )}
      </div>

      {preview && (
        <p className="mt-3 text-sm text-neutral-400 leading-relaxed">
          {preview}
        </p>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-300">{error}</p>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || hasApplication}
          className={[
            "inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium ring-1 transition",
            hasApplication
              ? "bg-neutral-500/10 text-neutral-300 ring-neutral-500/30 cursor-default"
              : "bg-white/5 hover:bg-white/10 text-neutral-100 ring-white/10",
            saving ? "opacity-70" : "",
          ].join(" ")}
          aria-label={
            hasApplication && isSavedOnly
              ? "Already saved"
              : hasApplication
                ? "Already in tracker"
                : "Save for later"
          }
        >
          <BookmarkIcon filled={hasApplication} />
          {hasApplication
            ? isSavedOnly
              ? "Saved ✓"
              : "In tracker"
            : saving
              ? "Saving…"
              : "Save"}
        </button>

        {job.apply_url ? (
          <a
            href={job.apply_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleApplyClick}
            className="inline-flex items-center rounded-md bg-[#6366f1] hover:bg-[#4f52d5] px-3.5 py-2 text-sm font-medium text-white"
          >
            View &amp; Apply
          </a>
        ) : (
          <span className="text-xs text-neutral-500">No apply link</span>
        )}
      </div>
    </article>
  );
}
