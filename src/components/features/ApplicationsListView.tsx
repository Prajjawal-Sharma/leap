"use client";

import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  type ApplicationWithJob,
} from "@/types/applications";

type Props = {
  applications: ApplicationWithJob[];
  onSelectApplication: (id: string) => void;
  onStatusChange: (id: string, next: ApplicationStatus) => void;
};

type StatusMeta = {
  label: string;
  dot: string;
  text: string;
  badge: string;
};

const STATUS_META: Record<ApplicationStatus, StatusMeta> = {
  saved: {
    label: "Saved",
    dot: "bg-neutral-400",
    text: "text-neutral-200",
    badge: "bg-neutral-500/15 text-neutral-200 ring-neutral-500/30",
  },
  applied: {
    label: "Applied",
    dot: "bg-blue-400",
    text: "text-blue-200",
    badge: "bg-blue-500/15 text-blue-200 ring-blue-500/30",
  },
  viewed: {
    label: "Viewed",
    dot: "bg-purple-400",
    text: "text-purple-200",
    badge: "bg-purple-500/15 text-purple-200 ring-purple-500/30",
  },
  interviewing: {
    label: "Interviewing",
    dot: "bg-amber-400",
    text: "text-amber-200",
    badge: "bg-amber-500/15 text-amber-200 ring-amber-500/30",
  },
  offered: {
    label: "Offered",
    dot: "bg-emerald-400",
    text: "text-emerald-200",
    badge: "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30",
  },
  rejected: {
    label: "Rejected",
    dot: "bg-rose-400",
    text: "text-rose-200",
    badge: "bg-rose-500/15 text-rose-200 ring-rose-500/30",
  },
  withdrawn: {
    label: "Withdrawn",
    dot: "bg-rose-400",
    text: "text-rose-200",
    badge: "bg-rose-500/15 text-rose-200 ring-rose-500/30",
  },
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  // Pin to a stable locale (see KanbanBoard.formatDate for the why).
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function companyInitials(company: string | null | undefined): string {
  const trimmed = (company ?? "").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[1]!.charAt(0)).toUpperCase();
}

export default function ApplicationsListView({
  applications,
  onSelectApplication,
  onStatusChange,
}: Props) {
  return (
    <div className="overflow-hidden rounded-xl bg-neutral-900/30 ring-1 ring-white/10">
      <div
        role="row"
        className="hidden md:grid md:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_140px] gap-3 px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02]"
      >
        <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
          Role
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
          Location
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
          Match
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
          Updated
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 text-right">
          Status
        </div>
      </div>

      <ul role="list" className="divide-y divide-white/[0.06]">
        {applications.map((app) => {
          const job = app.job;
          const meta = STATUS_META[app.status];
          const updated = formatDate(app.updated_at || app.applied_at);

          return (
            <li
              key={app.id}
              role="row"
              onClick={() => onSelectApplication(app.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectApplication(app.id);
                }
              }}
              tabIndex={0}
              className={[
                "grid md:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_140px] gap-3",
                "px-4 py-3 cursor-pointer hover:bg-white/[0.03] transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#6366f1]/60",
              ].join(" ")}
              aria-label={`Open ${job?.title || "application"} at ${job?.company || "company"}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  aria-hidden="true"
                  className="shrink-0 h-9 w-9 rounded-md bg-white/[0.04] ring-1 ring-white/10 flex items-center justify-center text-[11px] font-semibold text-neutral-200"
                >
                  {companyInitials(job?.company)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white truncate">
                    {job?.title || "Untitled role"}
                  </p>
                  <p className="text-xs text-neutral-400 truncate">
                    {job?.company || "Unknown company"}
                  </p>
                </div>
              </div>

              <div className="flex items-center text-xs text-neutral-300 min-w-0">
                <span className="truncate">
                  {job?.is_remote ? "Remote" : job?.location || "—"}
                </span>
              </div>

              <div className="flex items-center text-xs text-neutral-300 tabular-nums">
                {app.match_score === null ? (
                  <span className="text-neutral-500">—</span>
                ) : (
                  <span>{app.match_score}%</span>
                )}
              </div>

              <div className="flex items-center text-xs text-neutral-400 tabular-nums">
                {updated}
              </div>

              <div className="flex items-center md:justify-end">
                <select
                  aria-label="Change status"
                  value={app.status}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    e.stopPropagation();
                    onStatusChange(app.id, e.target.value as ApplicationStatus);
                  }}
                  className={[
                    "text-[11px] font-medium rounded-md px-2 py-1 ring-1 cursor-pointer",
                    "focus:outline-none focus:ring-2 focus:ring-[#6366f1]/60",
                    meta.badge,
                  ].join(" ")}
                >
                  {APPLICATION_STATUSES.map((s) => (
                    <option key={s} value={s} className="bg-neutral-900">
                      {STATUS_META[s].label}
                    </option>
                  ))}
                </select>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
