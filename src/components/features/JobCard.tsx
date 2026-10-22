"use client";

import { useState } from "react";

import TailorResumeModal from "@/components/features/TailorResumeModal";
import type { ParsedResume } from "@/lib/ai/schemas";
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
  // Id of the stored tailored resume for this job (from the parent's
  // /api/resume/tailor fetch plus our own onTailoredChange notifications),
  // or null. Unlike existingApplication this is NOT part of the card key —
  // updates flow through as ordinary prop changes so an in-flight tailor
  // request or open preview modal survives them.
  existingTailoredResumeId?: string | null;
  onTailoredChange?: (jobId: string, resumeId: string | null) => void;
};

type TailorResponse = {
  id: string;
  original: ParsedResume;
  tailored: ParsedResume;
  updated: boolean;
};

type TailorPreview = {
  resumeId: string;
  original: ParsedResume;
  tailored: ParsedResume;
  // True when generation overwrote an already-stored tailored resume —
  // the modal warns that the previous version is gone.
  wasUpdate: boolean;
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
  existingTailoredResumeId = null,
  onTailoredChange,
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

  // Tailored-resume flow. The row is persisted server-side at generation
  // time; the modal's Keep just closes the preview, Discard deletes the row.
  // Displayed id is the prop (parent map = server truth) unless a local
  // interaction has overridden it — undefined means "no override yet", so
  // late GET hydration in the parent still flows through.
  const [tailoredOverride, setTailoredOverride] = useState<
    string | null | undefined
  >(undefined);
  const tailoredId =
    tailoredOverride !== undefined ? tailoredOverride : existingTailoredResumeId;
  const [tailoring, setTailoring] = useState(false);
  const [tailorError, setTailorError] = useState<string | null>(null);
  const [tailorPreview, setTailorPreview] = useState<TailorPreview | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);

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

  const handleTailor = async () => {
    if (tailoring) return;
    setTailorError(null);
    setDiscardError(null);
    setTailoring(true);
    try {
      const res = await fetch("/api/resume/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: job.id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Tailoring failed (${res.status})`);
      }
      const data = (await res.json()) as TailorResponse;
      setTailorPreview({
        resumeId: data.id,
        original: data.original,
        tailored: data.tailored,
        wasUpdate: data.updated,
      });
      // The row exists server-side from this moment — tell the parent NOW,
      // not on Keep, so even if something remounts this card (e.g. a save
      // transitioning the application key) the surviving instance still
      // reflects the stored row instead of lying about it.
      setTailoredOverride(data.id);
      onTailoredChange?.(job.id, data.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Tailoring failed";
      setTailorError(msg);
    } finally {
      setTailoring(false);
    }
  };

  // The parent was already notified at generation time — Keep just
  // dismisses the preview.
  const handleTailorKeep = () => {
    setTailorPreview(null);
    setDiscardError(null);
  };

  const handleTailorDiscard = async () => {
    if (!tailorPreview || discarding) return;
    setDiscarding(true);
    setDiscardError(null);
    try {
      const res = await fetch("/api/resume/tailor", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume_id: tailorPreview.resumeId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Discard failed (${res.status})`);
      }
      setTailorPreview(null);
      setTailoredOverride(null);
      onTailoredChange?.(job.id, null);
    } catch (err) {
      // Keep the modal open with the error — the row still exists, so
      // silently closing would leave the UI lying about what's stored.
      const msg = err instanceof Error ? err.message : "Discard failed";
      setDiscardError(msg);
    } finally {
      setDiscarding(false);
    }
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
        {tailoredId && (
          <span className="rounded-md bg-[#6366f1]/15 ring-1 ring-[#6366f1]/30 px-2 py-1 text-indigo-200">
            Resume tailored
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
      {tailorError && (
        <p className="mt-2 text-xs text-red-300">{tailorError}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleTailor}
          disabled={tailoring || saving}
          title="Rewrite your primary resume to target this job"
          className="mr-auto inline-flex items-center gap-1.5 rounded-md bg-white/5 hover:bg-white/10 px-3 py-2 text-sm font-medium text-neutral-100 ring-1 ring-white/10 transition disabled:opacity-70"
        >
          {tailoring ? (
            <>
              <span
                aria-hidden="true"
                className="h-3.5 w-3.5 rounded-full border-2 border-white/20 border-t-[#6366f1] animate-spin"
              />
              Tailoring…
            </>
          ) : tailoredId ? (
            "Re-tailor my resume"
          ) : (
            "Tailor my resume for this role"
          )}
        </button>
        <button
          type="button"
          onClick={handleSave}
          // Also locked during tailoring: a save transitions the card key
          // and remounts this component, which would orphan the in-flight
          // tailor request's preview.
          disabled={saving || hasApplication || tailoring}
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

      {tailorPreview && (
        <TailorResumeModal
          open
          jobTitle={title}
          company={company}
          original={tailorPreview.original}
          tailored={tailorPreview.tailored}
          wasUpdate={tailorPreview.wasUpdate}
          discarding={discarding}
          error={discardError}
          onKeep={handleTailorKeep}
          onDiscard={handleTailorDiscard}
        />
      )}
    </article>
  );
}
