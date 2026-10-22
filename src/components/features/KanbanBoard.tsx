"use client";

import { useMemo, useState } from "react";

import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  type ApplicationWithJob,
} from "@/types/applications";

type Props = {
  applications: ApplicationWithJob[];
  onSelectApplication: (id: string) => void;
  onStatusChange: (applicationId: string, nextStatus: ApplicationStatus) => void;
};

type ColumnDef = {
  id: string;
  label: string;
  statuses: readonly ApplicationStatus[];
  dropStatus: ApplicationStatus;
  accent: {
    text: string;
    dot: string;
    edge: string;
    pill: string;
    ringActive: string;
  };
};

const COLUMNS: readonly ColumnDef[] = [
  {
    id: "saved",
    label: "Saved",
    statuses: ["saved"],
    dropStatus: "saved",
    accent: {
      text: "text-neutral-300",
      dot: "bg-neutral-400",
      edge: "before:bg-neutral-400/70",
      pill: "bg-neutral-500/15 text-neutral-200 ring-neutral-500/30",
      ringActive: "ring-neutral-400/60",
    },
  },
  {
    id: "applied",
    label: "Applied",
    statuses: ["applied"],
    dropStatus: "applied",
    accent: {
      text: "text-blue-300",
      dot: "bg-blue-400",
      edge: "before:bg-blue-400/70",
      pill: "bg-blue-500/15 text-blue-200 ring-blue-500/30",
      ringActive: "ring-blue-400/60",
    },
  },
  {
    id: "viewed",
    label: "Viewed",
    statuses: ["viewed"],
    dropStatus: "viewed",
    accent: {
      text: "text-purple-300",
      dot: "bg-purple-400",
      edge: "before:bg-purple-400/70",
      pill: "bg-purple-500/15 text-purple-200 ring-purple-500/30",
      ringActive: "ring-purple-400/60",
    },
  },
  {
    id: "interviewing",
    label: "Interviewing",
    statuses: ["interviewing"],
    dropStatus: "interviewing",
    accent: {
      text: "text-amber-300",
      dot: "bg-amber-400",
      edge: "before:bg-amber-400/70",
      pill: "bg-amber-500/15 text-amber-200 ring-amber-500/30",
      ringActive: "ring-amber-400/60",
    },
  },
  {
    id: "offered",
    label: "Offered",
    statuses: ["offered"],
    dropStatus: "offered",
    accent: {
      text: "text-emerald-300",
      dot: "bg-emerald-400",
      edge: "before:bg-emerald-400/70",
      pill: "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30",
      ringActive: "ring-emerald-400/60",
    },
  },
  {
    id: "closed",
    label: "Closed",
    statuses: ["rejected", "withdrawn"],
    dropStatus: "rejected",
    accent: {
      text: "text-rose-300",
      dot: "bg-rose-400",
      edge: "before:bg-rose-400/70",
      pill: "bg-rose-500/15 text-rose-200 ring-rose-500/30",
      ringActive: "ring-rose-400/60",
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
  // Pin to a stable locale so the SSR-rendered string matches what the
  // browser produces during hydration — otherwise the server's system
  // locale (e.g. en-IN: "15 May") collides with en-US ("May 15") and
  // React throws a hydration mismatch.
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function companyInitials(company: string | null | undefined): string {
  const trimmed = (company ?? "").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[1]!.charAt(0)).toUpperCase();
}

// Deterministic monogram tint based on company name. Stable across renders so
// cards stay visually identifiable as users scroll back and forth.
function monogramTint(seed: string): string {
  const palette = [
    "from-indigo-500/30 to-indigo-700/30 text-indigo-100 ring-indigo-400/30",
    "from-sky-500/30 to-sky-700/30 text-sky-100 ring-sky-400/30",
    "from-emerald-500/30 to-emerald-700/30 text-emerald-100 ring-emerald-400/30",
    "from-amber-500/30 to-amber-700/30 text-amber-100 ring-amber-400/30",
    "from-rose-500/30 to-rose-700/30 text-rose-100 ring-rose-400/30",
    "from-violet-500/30 to-violet-700/30 text-violet-100 ring-violet-400/30",
    "from-cyan-500/30 to-cyan-700/30 text-cyan-100 ring-cyan-400/30",
    "from-fuchsia-500/30 to-fuchsia-700/30 text-fuchsia-100 ring-fuchsia-400/30",
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length]!;
}

function cardDateLabel(app: ApplicationWithJob): string {
  const d = formatDate(app.updated_at || app.applied_at);
  if (!d) return "";
  if (app.status === "saved") return `Saved ${d}`;
  if (app.status === "applied") return `Applied ${d}`;
  return `Updated ${d}`;
}

type DragState = {
  applicationId: string;
  fromStatus: ApplicationStatus;
} | null;

type CardProps = {
  app: ApplicationWithJob;
  column: ColumnDef;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onSelect: () => void;
  onStatusChange: (next: ApplicationStatus) => void;
};

function ApplicationCard({
  app,
  column,
  isDragging,
  onDragStart,
  onDragEnd,
  onSelect,
  onStatusChange,
}: CardProps) {
  const dateLabel = cardDateLabel(app);
  const matchScore = app.match_score;
  const company = app.job?.company || "Unknown company";
  const tint = monogramTint(company);
  const isClosed = column.id === "closed";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open ${app.job?.title || "application"} at ${company}`}
      className={[
        "group relative rounded-lg bg-neutral-900/80 hover:bg-neutral-900",
        "ring-1 ring-white/10 hover:ring-white/20",
        // Left-edge color bar driven by ::before so we don't burn an extra DOM
        // node per card. Each card gets a 3px accent matching its column.
        `before:content-[''] before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full ${column.accent.edge}`,
        "px-3 pl-4 py-2.5 cursor-grab active:cursor-grabbing",
        "transition-all duration-150 hover:-translate-y-[1px] hover:shadow-lg hover:shadow-black/30",
        isDragging ? "opacity-40 rotate-[-1deg]" : "",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6366f1]/60",
      ].join(" ")}
    >
      <div className="flex items-start gap-2.5">
        <div
          aria-hidden="true"
          className={[
            "shrink-0 h-8 w-8 rounded-md ring-1 flex items-center justify-center",
            "bg-gradient-to-br text-[11px] font-semibold tabular-nums",
            tint,
          ].join(" ")}
        >
          {companyInitials(company)}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-medium text-white leading-snug line-clamp-2">
            {app.job?.title || "Untitled role"}
          </h3>
          <p className="mt-0.5 text-[11px] text-neutral-400 truncate">
            {company}
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {matchScore !== null && (
            <span
              className={[
                "rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 tabular-nums",
                column.accent.pill,
              ].join(" ")}
              title="Semantic match vs your resume"
            >
              {matchScore}%
            </span>
          )}
          {dateLabel && (
            <span className="text-[10px] text-neutral-500 truncate">
              {dateLabel}
            </span>
          )}
          {isClosed && (
            <span
              aria-label={STATUS_LABELS[app.status]}
              title={STATUS_LABELS[app.status]}
              className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-rose-500/15 text-rose-200 ring-1 ring-rose-500/30"
            >
              {app.status === "withdrawn" ? "Withdrawn" : "Rejected"}
            </span>
          )}
        </div>
        <select
          aria-label="Change status"
          value={app.status}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            e.stopPropagation();
            onStatusChange(e.target.value as ApplicationStatus);
          }}
          className={[
            "text-[10px] rounded bg-white/[0.04] hover:bg-white/10 text-neutral-300 px-1.5 py-0.5",
            "opacity-0 group-hover:opacity-100 focus:opacity-100",
            "transition-opacity focus:outline-none focus:ring-1 focus:ring-[#6366f1]",
          ].join(" ")}
        >
          {APPLICATION_STATUSES.map((s) => (
            <option key={s} value={s} className="bg-neutral-900">
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

type ColumnProps = {
  column: ColumnDef;
  cards: ApplicationWithJob[];
  isHover: boolean;
  drag: DragState;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onCardDragStart: (
    e: React.DragEvent<HTMLDivElement>,
    app: ApplicationWithJob
  ) => void;
  onCardDragEnd: () => void;
  onSelect: (id: string) => void;
  onStatusChange: (id: string, next: ApplicationStatus) => void;
  variant: "grid" | "stacked";
};

function Column({
  column,
  cards,
  isHover,
  drag,
  onDragOver,
  onDragLeave,
  onDrop,
  onCardDragStart,
  onCardDragEnd,
  onSelect,
  onStatusChange,
  variant,
}: ColumnProps) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={[
        "flex flex-col rounded-xl bg-neutral-900/30",
        "ring-1 transition-shadow duration-150",
        isHover
          ? `ring-2 ${column.accent.ringActive} shadow-lg shadow-black/30`
          : "ring-white/10",
      ].join(" ")}
    >
      <div className="px-3 py-2.5 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span
            aria-hidden="true"
            className={`inline-block h-1.5 w-1.5 rounded-full ${column.accent.dot}`}
          />
          <h2
            className={`text-[11px] font-semibold uppercase tracking-wider truncate ${column.accent.text}`}
          >
            {column.label}
          </h2>
        </div>
        <span className="text-[11px] font-medium text-neutral-400 tabular-nums">
          {cards.length}
        </span>
      </div>

      <div
        className={[
          variant === "grid"
            ? "flex-1 px-2 py-2 space-y-2 min-h-[180px]"
            : "px-2 py-2 grid grid-cols-1 sm:grid-cols-2 gap-2 min-h-[80px]",
        ].join(" ")}
      >
        {cards.length === 0 ? (
          <div
            className={[
              "rounded-md border border-dashed border-white/10",
              "flex items-center justify-center text-[11px] text-neutral-500",
              variant === "grid" ? "py-6 px-2" : "py-4 px-3 col-span-full",
              drag ? "border-white/20 text-neutral-400" : "",
            ].join(" ")}
          >
            {drag ? "Drop here" : "Nothing here yet"}
          </div>
        ) : (
          cards.map((app) => (
            <ApplicationCard
              key={app.id}
              app={app}
              column={column}
              isDragging={drag?.applicationId === app.id}
              onDragStart={(e) => onCardDragStart(e, app)}
              onDragEnd={onCardDragEnd}
              onSelect={() => onSelect(app.id)}
              onStatusChange={(next) => onStatusChange(app.id, next)}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default function KanbanBoard({
  applications,
  onSelectApplication,
  onStatusChange,
}: Props) {
  const [drag, setDrag] = useState<DragState>(null);
  const [hoverColumn, setHoverColumn] = useState<string | null>(null);

  const byColumn = useMemo(() => {
    const out = new Map<string, ApplicationWithJob[]>();
    for (const col of COLUMNS) out.set(col.id, []);
    for (const app of applications) {
      const col = COLUMNS.find((c) => c.statuses.includes(app.status));
      if (col) out.get(col.id)!.push(app);
    }
    return out;
  }, [applications]);

  const onCardDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    app: ApplicationWithJob
  ) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", app.id);
    setDrag({ applicationId: app.id, fromStatus: app.status });
  };

  const onCardDragEnd = () => {
    setDrag(null);
    setHoverColumn(null);
  };

  const handleColumnDragOver = (
    e: React.DragEvent<HTMLDivElement>,
    columnId: string
  ) => {
    if (!drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (hoverColumn !== columnId) setHoverColumn(columnId);
  };

  const handleColumnDragLeave = (
    e: React.DragEvent<HTMLDivElement>,
    columnId: string
  ) => {
    // dragleave fires when the pointer moves onto a child node too — only
    // clear when the relatedTarget is outside the column itself.
    const next = e.relatedTarget as Node | null;
    if (next && (e.currentTarget as Node).contains(next)) return;
    if (hoverColumn === columnId) setHoverColumn(null);
  };

  const handleColumnDrop = (
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
    // Don't fire a redundant PATCH when dropping onto the column the card is
    // already in (especially relevant for the merged "closed" column).
    if (column.statuses.includes(current.status)) return;
    onStatusChange(id, column.dropStatus);
  };

  return (
    <div className="space-y-4">
      {/* xl+: equal-width 6-column grid. No horizontal scroll on desktop. */}
      <div className="hidden xl:grid xl:grid-cols-6 gap-3">
        {COLUMNS.map((column) => (
          <Column
            key={column.id}
            column={column}
            cards={byColumn.get(column.id) ?? []}
            isHover={hoverColumn === column.id}
            drag={drag}
            onDragOver={(e) => handleColumnDragOver(e, column.id)}
            onDragLeave={(e) => handleColumnDragLeave(e, column.id)}
            onDrop={(e) => handleColumnDrop(e, column)}
            onCardDragStart={onCardDragStart}
            onCardDragEnd={onCardDragEnd}
            onSelect={onSelectApplication}
            onStatusChange={onStatusChange}
            variant="grid"
          />
        ))}
      </div>

      {/* below xl: stacked full-width sections — each status becomes a row
          with cards in a responsive sub-grid. Keeps the kanban semantics
          (drag between sections still updates status) but never scrolls
          horizontally. */}
      <div className="xl:hidden space-y-3">
        {COLUMNS.map((column) => (
          <Column
            key={column.id}
            column={column}
            cards={byColumn.get(column.id) ?? []}
            isHover={hoverColumn === column.id}
            drag={drag}
            onDragOver={(e) => handleColumnDragOver(e, column.id)}
            onDragLeave={(e) => handleColumnDragLeave(e, column.id)}
            onDrop={(e) => handleColumnDrop(e, column)}
            onCardDragStart={onCardDragStart}
            onCardDragEnd={onCardDragEnd}
            onSelect={onSelectApplication}
            onStatusChange={onStatusChange}
            variant="stacked"
          />
        ))}
      </div>
    </div>
  );
}
