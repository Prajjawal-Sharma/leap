"use client";

import type { MatchResult } from "@/lib/jobs/match-engine";

const DESCRIPTION_PREVIEW_CHARS = 200;

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

export default function JobCard({ match }: { match: MatchResult }) {
  const { job, match_score } = match;
  const title = job.title?.trim() || "Untitled role";
  const company = job.company?.trim() || "Unknown company";
  const location = job.location?.trim() || "";
  const preview = previewText(job.description);
  const employmentType = job.employment_type?.trim() || "";

  return (
    <article className="rounded-xl bg-neutral-900/60 ring-1 ring-white/10 p-5 hover:ring-white/20 transition">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-white truncate">
            {title}
          </h3>
          <p className="mt-0.5 text-sm text-neutral-300 truncate">
            {company}
          </p>
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
      </div>

      {preview && (
        <p className="mt-3 text-sm text-neutral-400 leading-relaxed">
          {preview}
        </p>
      )}

      <div className="mt-4 flex items-center justify-end">
        {job.apply_url ? (
          <a
            href={job.apply_url}
            target="_blank"
            rel="noopener noreferrer"
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
