"use client";

import { useMemo } from "react";

import type { ApplicationWithJob } from "@/types/applications";

type Props = {
  applications: ApplicationWithJob[];
};

type Tile = {
  label: string;
  value: string;
  hint: string;
  accent: string;
  iconPath: string;
};

// Pre-rendered SVG icons sized for a 14px container. Inline keeps the bundle
// lean and matches the existing codebase convention of avoiding lucide-react.
const ICONS = {
  pipeline:
    "M3 5h14M3 10h14M3 15h14",
  spark:
    "M10 2v4M10 14v4M2 10h4M14 10h4M5 5l2.5 2.5M12.5 12.5L15 15M5 15l2.5-2.5M12.5 7.5L15 5",
  trophy:
    "M6 4h8v2a4 4 0 0 1-8 0V4zM4 4h2v2H5a1 1 0 0 1-1-1V4zm12 0h-2v2h1a1 1 0 0 0 1-1V4zM8 11h4l-.5 3h-3L8 11zm-1 4h6v1H7v-1z",
  rate:
    "M3 16l4-6 3 3 7-9",
} as const;

export default function ApplicationsStats({ applications }: Props) {
  const tiles = useMemo<Tile[]>(() => {
    const counts = {
      saved: 0,
      applied: 0,
      viewed: 0,
      interviewing: 0,
      offered: 0,
      rejected: 0,
      withdrawn: 0,
    };
    for (const a of applications) counts[a.status] += 1;

    const activePipeline =
      counts.saved + counts.applied + counts.viewed + counts.interviewing;

    // Response rate = of applications that reached "applied" or later, how
    // many got a recruiter response (viewed/interviewing/offered/rejected).
    // We intentionally include "rejected" because a rejection is still a
    // response — the user heard back. "Saved" and "withdrawn" don't count
    // in the denominator since those don't represent an external signal.
    const respondedDenominator =
      counts.applied +
      counts.viewed +
      counts.interviewing +
      counts.offered +
      counts.rejected;
    const respondedNumerator =
      counts.viewed + counts.interviewing + counts.offered + counts.rejected;
    const responseRate =
      respondedDenominator > 0
        ? Math.round((respondedNumerator / respondedDenominator) * 100)
        : null;

    return [
      {
        label: "Active pipeline",
        value: String(activePipeline),
        hint:
          activePipeline === 0
            ? "No open applications"
            : `${counts.saved} saved · ${counts.applied} applied`,
        accent: "from-indigo-500/20 to-indigo-500/0 text-indigo-200",
        iconPath: ICONS.pipeline,
      },
      {
        label: "Interviewing",
        value: String(counts.interviewing),
        hint:
          counts.interviewing === 0
            ? "Awaiting first interview"
            : counts.interviewing === 1
              ? "1 conversation in progress"
              : `${counts.interviewing} conversations`,
        accent: "from-amber-500/20 to-amber-500/0 text-amber-200",
        iconPath: ICONS.spark,
      },
      {
        label: "Offers",
        value: String(counts.offered),
        hint:
          counts.offered === 0
            ? "No offers yet"
            : counts.offered === 1
              ? "Celebrate this one"
              : `${counts.offered} offers on the table`,
        accent: "from-emerald-500/20 to-emerald-500/0 text-emerald-200",
        iconPath: ICONS.trophy,
      },
      {
        label: "Response rate",
        value: responseRate === null ? "—" : `${responseRate}%`,
        hint:
          responseRate === null
            ? "Apply to roles to start tracking"
            : `${respondedNumerator} of ${respondedDenominator} got a reply`,
        accent: "from-sky-500/20 to-sky-500/0 text-sky-200",
        iconPath: ICONS.rate,
      },
    ];
  }, [applications]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="relative overflow-hidden rounded-xl bg-neutral-900/40 ring-1 ring-white/10 px-4 py-3.5"
        >
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-gradient-to-br opacity-60 blur-2xl ${t.accent.split(" ")[0]} ${t.accent.split(" ")[1]}`}
          />
          <div className="relative flex items-start justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-400">
                {t.label}
              </p>
              <p className="mt-1.5 text-2xl font-semibold text-white tabular-nums">
                {t.value}
              </p>
              <p className="mt-1 text-[11px] text-neutral-500 truncate">
                {t.hint}
              </p>
            </div>
            <span
              className={`shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] ring-1 ring-white/10 ${t.accent.split(" ")[2]}`}
              aria-hidden="true"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={t.iconPath} />
              </svg>
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
