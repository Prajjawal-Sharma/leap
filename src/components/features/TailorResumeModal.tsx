"use client";

import { useEffect } from "react";

import type { ParsedResume } from "@/lib/ai/schemas";

type Props = {
  open: boolean;
  jobTitle: string;
  company: string;
  original: ParsedResume;
  tailored: ParsedResume;
  discarding: boolean;
  error: string | null;
  // Keep = close the preview and leave the stored tailored resume in place.
  // Esc and the backdrop route here too — the non-destructive default.
  onKeep: () => void;
  onDiscard: () => void;
};

function ResumePreview({ resume }: { resume: ParsedResume }) {
  return (
    <div className="space-y-5 text-sm">
      {resume.summary && (
        <section>
          <h4 className="text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
            Summary
          </h4>
          <p className="text-neutral-300 leading-relaxed whitespace-pre-wrap">
            {resume.summary}
          </p>
        </section>
      )}

      {resume.experience.length > 0 && (
        <section>
          <h4 className="text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
            Experience
          </h4>
          <ul className="space-y-3">
            {resume.experience.map((e, i) => (
              <li key={i}>
                <p className="font-medium text-neutral-100">
                  {e.role || "Role"}
                  {e.company && (
                    <span className="text-neutral-400"> @ {e.company}</span>
                  )}
                </p>
                {e.duration && (
                  <p className="text-xs text-neutral-500">{e.duration}</p>
                )}
                {e.description && (
                  <p className="mt-1 text-neutral-300 leading-relaxed whitespace-pre-wrap">
                    {e.description}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {resume.skills.length > 0 && (
        <section>
          <h4 className="text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
            Skills
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {resume.skills.map((s, i) => (
              <span
                key={i}
                className="text-xs rounded-md px-2 py-0.5 bg-white/5 ring-1 ring-white/10 text-neutral-300"
              >
                {s}
              </span>
            ))}
          </div>
        </section>
      )}

      {resume.education.length > 0 && (
        <section>
          <h4 className="text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
            Education
          </h4>
          <ul className="space-y-1 text-neutral-300">
            {resume.education.map((ed, i) => (
              <li key={i}>
                {ed.degree || "Degree"}, {ed.institution || "Institution"}
                {ed.year && (
                  <span className="text-neutral-500"> ({ed.year})</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {resume.certifications.length > 0 && (
        <section>
          <h4 className="text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
            Certifications
          </h4>
          <ul className="space-y-1 text-neutral-300">
            {resume.certifications.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function TailorResumeModal({
  open,
  jobTitle,
  company,
  original,
  tailored,
  discarding,
  error,
  onKeep,
  onDiscard,
}: Props) {
  // Esc-to-close, bound only while open — same discipline as the
  // application detail drawer. Esc keeps (non-destructive); discarding is
  // always an explicit button press.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !discarding) onKeep();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, discarding, onKeep]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close preview and keep tailored resume"
        onClick={onKeep}
        disabled={discarding}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Tailored resume preview for ${jobTitle}`}
        className="relative flex w-full max-w-5xl max-h-[85vh] flex-col rounded-xl bg-[#0a0a0a] ring-1 ring-white/10 shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white truncate">
              Tailored for {jobTitle || "this role"}
            </h2>
            <p className="text-sm text-neutral-400 truncate">
              {company || "Unknown company"} · review the rewrite, then keep or
              discard it
            </p>
          </div>
          <button
            type="button"
            onClick={onKeep}
            disabled={discarding}
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

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-xl bg-neutral-900/60 ring-1 ring-white/10 p-4">
              <h3 className="text-sm font-semibold text-neutral-400 mb-4">
                Current resume
              </h3>
              <ResumePreview resume={original} />
            </div>
            <div className="rounded-xl bg-neutral-900/60 ring-1 ring-[#6366f1]/40 p-4">
              <h3 className="text-sm font-semibold text-indigo-300 mb-4">
                Tailored resume
              </h3>
              <ResumePreview resume={tailored} />
            </div>
          </div>
        </div>

        <footer className="flex items-center gap-3 border-t border-white/10 px-5 py-4">
          {error && (
            <p className="flex-1 text-xs text-red-300 min-w-0">{error}</p>
          )}
          <button
            type="button"
            onClick={onDiscard}
            disabled={discarding}
            className="ml-auto rounded-md px-3 py-2 text-sm text-red-300 hover:bg-red-500/10 ring-1 ring-red-500/20 disabled:opacity-60"
          >
            {discarding ? "Discarding…" : "Discard"}
          </button>
          <button
            type="button"
            onClick={onKeep}
            disabled={discarding}
            className="rounded-md bg-[#6366f1] hover:bg-[#4f52d5] px-3.5 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Keep tailored resume
          </button>
        </footer>
      </div>
    </div>
  );
}
