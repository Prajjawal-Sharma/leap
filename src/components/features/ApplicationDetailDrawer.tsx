"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  type ApplicationWithJob,
} from "@/types/applications";

type Props = {
  application: ApplicationWithJob | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (application: ApplicationWithJob) => void;
  onDelete: (id: string) => void;
};

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  viewed: "Viewed",
  interviewing: "Interviewing",
  offered: "Offered",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ApplicationDetailDrawer({
  application,
  open,
  onClose,
  onUpdate,
  onDelete,
}: Props) {
  // The parent passes a fresh key whenever `application.id` changes, so this
  // component remounts per selected card. That means initializing state from
  // props is sufficient — no prop→state sync effect required.
  const [notes, setNotes] = useState<string>(application?.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Last-persisted notes so blur saves no-op when nothing changed.
  const persistedNotesRef = useRef<string>(application?.notes ?? "");

  // Esc-to-close — bound only while the drawer is open so we don't intercept
  // keystrokes on other pages.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const patch = useCallback(
    async (
      patchBody: { status?: ApplicationStatus; notes?: string | null }
    ): Promise<ApplicationWithJob | null> => {
      if (!application) return null;
      const res = await fetch("/api/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: application.id, ...patchBody }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Update failed (${res.status})`);
      }
      const data = (await res.json()) as { application: ApplicationWithJob };
      return data.application;
    },
    [application]
  );

  const handleNotesBlur = async () => {
    if (!application) return;
    if (notes === persistedNotesRef.current) return;
    setSavingNotes(true);
    setErrorMessage(null);
    try {
      const next = notes.trim().length === 0 ? null : notes;
      const updated = await patch({ notes: next });
      if (updated) {
        persistedNotesRef.current = updated.notes ?? "";
        onUpdate(updated);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save notes";
      setErrorMessage(msg);
    } finally {
      setSavingNotes(false);
    }
  };

  const handleStatusChange = async (next: ApplicationStatus) => {
    if (!application || next === application.status) return;
    setStatusSaving(true);
    setErrorMessage(null);
    try {
      const updated = await patch({ status: next });
      if (updated) onUpdate(updated);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update status";
      setErrorMessage(msg);
    } finally {
      setStatusSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!application) return;
    setDeleting(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/applications/${application.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Delete failed (${res.status})`);
      }
      onDelete(application.id);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to delete";
      setErrorMessage(msg);
      setDeleting(false);
    }
  };

  if (!application) return null;

  const job = application.job;
  const postedAt = formatDate(job.posted_at);
  const lastUpdated = formatDate(application.updated_at);
  const description = (job.description ?? "").trim();

  return (
    <div
      className={[
        "fixed inset-0 z-40 transition-opacity",
        open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
      ].join(" ")}
      aria-hidden={!open}
    >
      <button
        type="button"
        aria-label="Close detail drawer"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Application detail for ${job.title}`}
        className={[
          "absolute right-0 top-0 h-full w-full sm:w-[480px] bg-[#0a0a0a]",
          "border-l border-white/10 shadow-2xl",
          "flex flex-col",
          "transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        <header className="px-5 py-4 border-b border-white/10 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white truncate">
              {job.title || "Untitled role"}
            </h2>
            <p className="text-sm text-neutral-300 truncate">
              {job.company || "Unknown company"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1.5 text-neutral-400 hover:text-white hover:bg-white/5"
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          <section className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
              {job.location && (
                <span className="rounded-md bg-white/5 ring-1 ring-white/10 px-2 py-1">
                  {job.location}
                </span>
              )}
              {job.is_remote && (
                <span className="rounded-md bg-indigo-500/15 ring-1 ring-indigo-500/30 px-2 py-1 text-indigo-200">
                  Remote
                </span>
              )}
              {postedAt && <span>Posted {postedAt}</span>}
              {lastUpdated && <span>· Last updated {lastUpdated}</span>}
            </div>
          </section>

          <section>
            <label
              htmlFor="application-status"
              className="block text-xs uppercase tracking-wider text-neutral-500 mb-2"
            >
              Status
            </label>
            <select
              id="application-status"
              value={application.status}
              onChange={(e) =>
                handleStatusChange(e.target.value as ApplicationStatus)
              }
              disabled={statusSaving}
              className="w-full rounded-md bg-neutral-900 ring-1 ring-white/10 text-sm text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
            >
              {APPLICATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </section>

          <section>
            <label
              htmlFor="application-notes"
              className="block text-xs uppercase tracking-wider text-neutral-500 mb-2"
            >
              Notes {savingNotes && <span className="ml-2 normal-case text-neutral-400">Saving…</span>}
            </label>
            <textarea
              id="application-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={handleNotesBlur}
              placeholder="Recruiter name, interview prep, follow-up reminders…"
              rows={5}
              className="w-full rounded-md bg-neutral-900 ring-1 ring-white/10 text-sm text-white px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
            />
          </section>

          <section>
            <h3 className="text-xs uppercase tracking-wider text-neutral-500 mb-2">
              Description
            </h3>
            {description ? (
              <p className="text-sm text-neutral-300 whitespace-pre-wrap leading-relaxed">
                {description}
              </p>
            ) : (
              <p className="text-sm text-neutral-500 italic">
                No description available.
              </p>
            )}
          </section>

          {errorMessage && (
            <div className="rounded-md bg-red-500/10 ring-1 ring-red-500/30 px-3 py-2 text-xs text-red-200">
              {errorMessage}
            </div>
          )}
        </div>

        <footer className="border-t border-white/10 px-5 py-4 flex items-center gap-3">
          {job.apply_url && (
            <a
              href={job.apply_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex justify-center items-center rounded-md bg-[#6366f1] hover:bg-[#4f52d5] px-3 py-2 text-sm font-medium text-white"
            >
              Open original posting
            </a>
          )}
          {confirmingDelete ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                className="rounded-md px-3 py-2 text-xs text-neutral-300 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-md bg-red-600/90 hover:bg-red-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Confirm delete"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="rounded-md px-3 py-2 text-xs text-red-300 hover:bg-red-500/10 ring-1 ring-red-500/20"
            >
              Delete
            </button>
          )}
        </footer>
      </aside>
    </div>
  );
}
