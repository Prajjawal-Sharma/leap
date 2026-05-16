"use client";

import { useCallback, useMemo, useState } from "react";

import ApplicationDetailDrawer from "@/components/features/ApplicationDetailDrawer";
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  type ApplicationWithJob,
} from "@/types/applications";

type Props = {
  initialApplications: ApplicationWithJob[];
};

type ColumnDef = {
  id: string;
  label: string;
  // Statuses that live in this column. Most columns map 1:1 to a status; the
  // last column folds rejected + withdrawn into a single "closed" bucket.
  statuses: readonly ApplicationStatus[];
  // The status assigned when a card is dropped into this column. For the
  // merged column we default to 'rejected'; users can flip individual cards
  // to 'withdrawn' via the per-card status dropdown.
  dropStatus: ApplicationStatus;
  // Tailwind token bag — kept colocated so changing palette is a one-line edit.
  accent: {
    headerText: string;
    headerBg: string;
    bar: string;
    pill: string;
  };
};

const COLUMNS: readonly ColumnDef[] = [
  {
    id: "saved",
    label: "Saved",
    statuses: ["saved"],
    dropStatus: "saved",
    accent: {
      headerText: "text-neutral-200",
      headerBg: "bg-neutral-500/10",
      bar: "bg-neutral-400",
      pill: "bg-neutral-500/15 text-neutral-200 ring-neutral-500/30",
    },
  },
  {
    id: "applied",
    label: "Applied",
    statuses: ["applied"],
    dropStatus: "applied",
    accent: {
      headerText: "text-blue-200",
      headerBg: "bg-blue-500/10",
      bar: "bg-blue-400",
      pill: "bg-blue-500/15 text-blue-200 ring-blue-500/30",
    },
  },
  {
    id: "viewed",
    label: "Viewed",
    statuses: ["viewed"],
    dropStatus: "viewed",
    accent: {
      headerText: "text-purple-200",
      headerBg: "bg-purple-500/10",
      bar: "bg-purple-400",
      pill: "bg-purple-500/15 text-purple-200 ring-purple-500/30",
    },
  },
  {
    id: "interviewing",
    label: "Interviewing",
    statuses: ["interviewing"],
    dropStatus: "interviewing",
    accent: {
      headerText: "text-amber-200",
      headerBg: "bg-amber-500/10",
      bar: "bg-amber-400",
      pill: "bg-amber-500/15 text-amber-200 ring-amber-500/30",
    },
  },
  {
    id: "offered",
    label: "Offered",
    statuses: ["offered"],
    dropStatus: "offered",
    accent: {
      headerText: "text-green-200",
      headerBg: "bg-green-500/10",
      bar: "bg-green-400",
      pill: "bg-green-500/15 text-green-200 ring-green-500/30",
    },
  },
  {
    id: "closed",
    label: "Rejected / Withdrawn",
    statuses: ["rejected", "withdrawn"],
    dropStatus: "rejected",
    accent: {
      headerText: "text-red-200",
      headerBg: "bg-red-500/10",
      bar: "bg-red-400",
      pill: "bg-red-500/15 text-red-200 ring-red-500/30",
    },
  },
] as const;

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
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function companyInitial(company: string | null | undefined): string {
  const trimmed = (company ?? "").trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}

function cardDateLabel(app: ApplicationWithJob): string {
  const d = formatDate(app.applied_at);
  if (!d) return "";
  if (app.status === "saved") return `Saved ${d}`;
  if (app.status === "applied") return `Applied ${d}`;
  return `Added ${d}`;
}

type DragState = {
  applicationId: string;
  fromStatus: ApplicationStatus;
} | null;

export default function KanbanBoard({ initialApplications }: Props) {
  const [applications, setApplications] = useState<ApplicationWithJob[]>(
    () => initialApplications
  );
  const [drag, setDrag] = useState<DragState>(null);
  const [hoverColumn, setHoverColumn] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const byColumn = useMemo(() => {
    const out = new Map<string, ApplicationWithJob[]>();
    for (const col of COLUMNS) out.set(col.id, []);
    for (const app of applications) {
      const col = COLUMNS.find((c) => c.statuses.includes(app.status));
      if (col) out.get(col.id)!.push(app);
    }
    return out;
  }, [applications]);

  const selected =
    selectedId !== null
      ? applications.find((a) => a.id === selectedId) ?? null
      : null;

  const replaceApplication = useCallback((next: ApplicationWithJob) => {
    setApplications((prev) =>
      prev.map((a) => (a.id === next.id ? next : a))
    );
  }, []);

  const removeApplication = useCallback((id: string) => {
    setApplications((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // Optimistically push the status update locally, then PATCH. On failure we
  // restore the previous status so the user sees the rollback.
  const patchStatus = useCallback(
    async (applicationId: string, nextStatus: ApplicationStatus) => {
      let previous: ApplicationStatus | null = null;
      setApplications((prev) =>
        prev.map((a) => {
          if (a.id !== applicationId) return a;
          previous = a.status;
          if (a.status === nextStatus) return a;
          return { ...a, status: nextStatus };
        })
      );
      if (previous === null || previous === nextStatus) return;

      try {
        const res = await fetch("/api/applications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: applicationId, status: nextStatus }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Update failed (${res.status})`);
        }
        const data = (await res.json()) as {
          application: ApplicationWithJob;
        };
        replaceApplication(data.application);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Update failed";
        setError(msg);
        // Roll back to the prior status if the server rejected.
        const rollback = previous;
        if (rollback !== null) {
          setApplications((prev) =>
            prev.map((a) =>
              a.id === applicationId ? { ...a, status: rollback } : a
            )
          );
        }
      }
    },
    [replaceApplication]
  );

  const onDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    app: ApplicationWithJob
  ) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", app.id);
    setDrag({ applicationId: app.id, fromStatus: app.status });
  };

  const onDragEnd = () => {
    setDrag(null);
    setHoverColumn(null);
  };

  const onColumnDragOver = (
    e: React.DragEvent<HTMLDivElement>,
    columnId: string
  ) => {
    if (!drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (hoverColumn !== columnId) setHoverColumn(columnId);
  };

  const onColumnDragLeave = (
    e: React.DragEvent<HTMLDivElement>,
    columnId: string
  ) => {
    // dragleave fires when moving over a child too — only clear if leaving
    // the column container itself (the relatedTarget escaped it).
    const next = e.relatedTarget as Node | null;
    if (next && (e.currentTarget as Node).contains(next)) return;
    if (hoverColumn === columnId) setHoverColumn(null);
  };

  const onColumnDrop = (
    e: React.DragEvent<HTMLDivElement>,
    column: ColumnDef
  ) => {
    e.preventDefault();
    setHoverColumn(null);
    const id = e.dataTransfer.getData("text/plain") || drag?.applicationId;
    setDrag(null);
    if (!id) return;
    const current = applications.find((a) => a.id === id);
    if (!current) return;
    // If the card is already in a status that belongs to this column (e.g.
    // the merged closed column) we don't fire a needless PATCH.
    if (column.statuses.includes(current.status)) return;
    void patchStatus(id, column.dropStatus);
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-500/10 ring-1 ring-red-500/30 px-3 py-2 text-xs text-red-200 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-200/80 hover:text-red-100"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      <div
        className={[
          "flex gap-3 overflow-x-auto pb-2",
          "snap-x snap-mandatory md:snap-none",
        ].join(" ")}
      >
        {COLUMNS.map((column) => {
          const cards = byColumn.get(column.id) ?? [];
          const isHover = hoverColumn === column.id;
          return (
            <div
              key={column.id}
              className={[
                "snap-start shrink-0",
                "w-[85vw] sm:w-[300px] md:w-[280px] xl:w-[300px]",
                "flex flex-col rounded-xl bg-neutral-900/40 ring-1 ring-white/10",
                isHover ? "ring-2 ring-[#6366f1]/60" : "",
              ].join(" ")}
              onDragOver={(e) => onColumnDragOver(e, column.id)}
              onDragLeave={(e) => onColumnDragLeave(e, column.id)}
              onDrop={(e) => onColumnDrop(e, column)}
            >
              <div
                className={[
                  "px-3 py-2.5 rounded-t-xl border-b border-white/10",
                  column.accent.headerBg,
                ].join(" ")}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={[
                        "inline-block h-2 w-2 rounded-full",
                        column.accent.bar,
                      ].join(" ")}
                    />
                    <h2
                      className={[
                        "text-xs font-semibold uppercase tracking-wider",
                        column.accent.headerText,
                      ].join(" ")}
                    >
                      {column.label}
                    </h2>
                  </div>
                  <span className="text-xs text-neutral-400 tabular-nums">
                    {cards.length}
                  </span>
                </div>
              </div>

              <div className="flex-1 px-2.5 py-2.5 space-y-2 min-h-[120px]">
                {cards.length === 0 ? (
                  <p className="text-xs text-neutral-500 text-center py-6">
                    No applications yet
                  </p>
                ) : (
                  cards.map((app) => {
                    const isDragging = drag?.applicationId === app.id;
                    const dateLabel = cardDateLabel(app);
                    const matchScore = app.match_score;
                    return (
                      <div
                        key={app.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, app)}
                        onDragEnd={onDragEnd}
                        onClick={() => setSelectedId(app.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedId(app.id);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        className={[
                          "group rounded-lg bg-neutral-900/80 ring-1 ring-white/10",
                          "px-3 py-2.5 cursor-grab active:cursor-grabbing",
                          "hover:ring-white/20 transition",
                          isDragging ? "opacity-40" : "",
                        ].join(" ")}
                      >
                        <div className="flex items-start gap-2.5">
                          <div
                            aria-hidden="true"
                            className="shrink-0 h-9 w-9 rounded-md bg-white/5 ring-1 ring-white/10 flex items-center justify-center text-sm font-semibold text-neutral-200"
                          >
                            {companyInitial(app.job?.company)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="text-sm font-medium text-white leading-tight line-clamp-2">
                                {app.job?.title || "Untitled role"}
                              </h3>
                              {column.id === "closed" && (
                                <span
                                  aria-label={STATUS_LABELS[app.status]}
                                  title={STATUS_LABELS[app.status]}
                                  className="shrink-0 text-[10px] font-semibold text-red-200/80"
                                >
                                  {app.status === "withdrawn" ? "↩" : "×"}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-neutral-400 truncate">
                              {app.job?.company || "Unknown company"}
                            </p>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                {matchScore !== null && (
                                  <span
                                    className={[
                                      "rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1",
                                      column.accent.pill,
                                    ].join(" ")}
                                  >
                                    {matchScore}%
                                  </span>
                                )}
                                {dateLabel && (
                                  <span className="text-[11px] text-neutral-500">
                                    {dateLabel}
                                  </span>
                                )}
                              </div>
                              <select
                                aria-label="Change status"
                                value={app.status}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  void patchStatus(
                                    app.id,
                                    e.target.value as ApplicationStatus
                                  );
                                }}
                                className="text-[11px] rounded bg-white/5 hover:bg-white/10 text-neutral-200 px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#6366f1]"
                              >
                                {APPLICATION_STATUSES.map((s) => (
                                  <option
                                    key={s}
                                    value={s}
                                    className="bg-neutral-900"
                                  >
                                    {STATUS_LABELS[s]}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      <ApplicationDetailDrawer
        key={selected?.id ?? "no-selection"}
        application={selected}
        open={selected !== null}
        onClose={() => setSelectedId(null)}
        onUpdate={replaceApplication}
        onDelete={removeApplication}
      />
    </div>
  );
}
