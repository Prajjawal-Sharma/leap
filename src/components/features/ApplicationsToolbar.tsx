"use client";

export type ViewMode = "board" | "list";
export type SortKey = "updated" | "applied" | "company" | "match";

type Props = {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (v: ViewMode) => void;
  sortKey: SortKey;
  onSortKeyChange: (s: SortKey) => void;
  totalCount: number;
  filteredCount: number;
};

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "updated", label: "Last updated" },
  { value: "applied", label: "Date added" },
  { value: "company", label: "Company A–Z" },
  { value: "match", label: "Match score" },
];

function SearchIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="5" />
      <path d="M11 11l3 3" />
    </svg>
  );
}

function BoardIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="3.5" height="10" rx="1" />
      <rect x="6.25" y="3" width="3.5" height="7" rx="1" />
      <rect x="10.5" y="3" width="3.5" height="5" rx="1" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M3 4h10M3 8h10M3 12h10" />
    </svg>
  );
}

export default function ApplicationsToolbar({
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  sortKey,
  onSortKeyChange,
  totalCount,
  filteredCount,
}: Props) {
  const showFilteredCount = searchQuery.trim().length > 0;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative flex-1 max-w-md">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">
          <SearchIcon />
        </span>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search company, role, or notes"
          aria-label="Search applications"
          className="w-full rounded-md bg-neutral-900/60 ring-1 ring-white/10 pl-9 pr-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[#6366f1]/60"
        />
        {showFilteredCount && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-neutral-500 tabular-nums">
            {filteredCount}/{totalCount}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="application-sort">
          Sort
        </label>
        <select
          id="application-sort"
          value={sortKey}
          onChange={(e) => onSortKeyChange(e.target.value as SortKey)}
          className="text-xs rounded-md bg-neutral-900/60 ring-1 ring-white/10 text-neutral-200 px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-[#6366f1]/60"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} className="bg-neutral-900">
              Sort: {o.label}
            </option>
          ))}
        </select>

        <div
          role="tablist"
          aria-label="View mode"
          className="inline-flex rounded-md bg-neutral-900/60 ring-1 ring-white/10 p-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "board"}
            onClick={() => onViewModeChange("board")}
            className={[
              "inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition",
              viewMode === "board"
                ? "bg-white/10 text-white ring-1 ring-white/15"
                : "text-neutral-400 hover:text-neutral-200",
            ].join(" ")}
          >
            <BoardIcon />
            Board
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "list"}
            onClick={() => onViewModeChange("list")}
            className={[
              "inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition",
              viewMode === "list"
                ? "bg-white/10 text-white ring-1 ring-white/15"
                : "text-neutral-400 hover:text-neutral-200",
            ].join(" ")}
          >
            <ListIcon />
            List
          </button>
        </div>
      </div>
    </div>
  );
}
