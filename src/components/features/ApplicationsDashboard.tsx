"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import ApplicationDetailDrawer from "@/components/features/ApplicationDetailDrawer";
import ApplicationsListView from "@/components/features/ApplicationsListView";
import ApplicationsStats from "@/components/features/ApplicationsStats";
import ApplicationsToolbar, {
  type SortKey,
  type ViewMode,
} from "@/components/features/ApplicationsToolbar";
import KanbanBoard from "@/components/features/KanbanBoard";
import type {
  ApplicationStatus,
  ApplicationWithJob,
} from "@/types/applications";

type Props = {
  initialApplications: ApplicationWithJob[];
};

const VIEW_STORAGE_KEY = "leap.applications.viewMode";
const SORT_STORAGE_KEY = "leap.applications.sortKey";

function sortApplications(
  apps: ApplicationWithJob[],
  key: SortKey
): ApplicationWithJob[] {
  // Defensive copy — never mutate the parent state array, even when callers
  // wrap us in useMemo. Comparators below are total orderings: ties fall back
  // to id so the UI is stable across renders.
  const copy = [...apps];
  const fallback = (a: ApplicationWithJob, b: ApplicationWithJob) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  switch (key) {
    case "updated":
      copy.sort((a, b) => {
        const ta = new Date(a.updated_at || a.applied_at).getTime();
        const tb = new Date(b.updated_at || b.applied_at).getTime();
        return tb - ta || fallback(a, b);
      });
      break;
    case "applied":
      copy.sort((a, b) => {
        const ta = new Date(a.applied_at).getTime();
        const tb = new Date(b.applied_at).getTime();
        return tb - ta || fallback(a, b);
      });
      break;
    case "company":
      copy.sort((a, b) => {
        const ca = (a.job?.company ?? "").toLowerCase();
        const cb = (b.job?.company ?? "").toLowerCase();
        if (ca < cb) return -1;
        if (ca > cb) return 1;
        return fallback(a, b);
      });
      break;
    case "match":
      copy.sort((a, b) => {
        const ma = a.match_score ?? -1;
        const mb = b.match_score ?? -1;
        return mb - ma || fallback(a, b);
      });
      break;
  }
  return copy;
}

function matchesSearch(app: ApplicationWithJob, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const job = app.job;
  return (
    (job?.title ?? "").toLowerCase().includes(q) ||
    (job?.company ?? "").toLowerCase().includes(q) ||
    (job?.location ?? "").toLowerCase().includes(q) ||
    (app.notes ?? "").toLowerCase().includes(q)
  );
}

export default function ApplicationsDashboard({ initialApplications }: Props) {
  const [applications, setApplications] = useState<ApplicationWithJob[]>(
    () => initialApplications
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [error, setError] = useState<string | null>(null);

  // Hydrate the user's preferred view + sort from localStorage on mount.
  // Done in an effect (not a lazy initializer) so SSR-rendered markup
  // matches the first client render before hydration completes — otherwise
  // React throws a mismatch error when the server's default differs from
  // what the browser has stored. The lint rule flags any setState-in-effect,
  // but syncing one-time browser-only state into React is the correct
  // pattern here.
  useEffect(() => {
    try {
      const storedView = window.localStorage.getItem(VIEW_STORAGE_KEY);
      if (storedView === "board" || storedView === "list") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setViewMode(storedView);
      }
      const storedSort = window.localStorage.getItem(SORT_STORAGE_KEY);
      if (
        storedSort === "updated" ||
        storedSort === "applied" ||
        storedSort === "company" ||
        storedSort === "match"
      ) {
        setSortKey(storedSort);
      }
    } catch {
      // localStorage can throw in private mode / disabled storage. We fall
      // back to defaults silently — preferences just don't persist.
    }
  }, []);

  const handleViewModeChange = useCallback((v: ViewMode) => {
    setViewMode(v);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, v);
    } catch {
      // ignore
    }
  }, []);

  const handleSortKeyChange = useCallback((s: SortKey) => {
    setSortKey(s);
    try {
      window.localStorage.setItem(SORT_STORAGE_KEY, s);
    } catch {
      // ignore
    }
  }, []);

  const filteredSorted = useMemo(
    () =>
      sortApplications(
        applications.filter((a) => matchesSearch(a, searchQuery)),
        sortKey
      ),
    [applications, searchQuery, sortKey]
  );

  const replaceApplication = useCallback((next: ApplicationWithJob) => {
    setApplications((prev) => prev.map((a) => (a.id === next.id ? next : a)));
  }, []);

  const removeApplication = useCallback((id: string) => {
    setApplications((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // Optimistic PATCH: flip the local status immediately, then reconcile with
  // the server response. On failure we roll back so the user sees the column
  // it actually lives in.
  const handleStatusChange = useCallback(
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

  const selected =
    selectedId !== null
      ? applications.find((a) => a.id === selectedId) ?? null
      : null;

  const filteredEmpty = filteredSorted.length === 0;

  return (
    <div className="space-y-5">
      <ApplicationsStats applications={applications} />

      <ApplicationsToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        sortKey={sortKey}
        onSortKeyChange={handleSortKeyChange}
        totalCount={applications.length}
        filteredCount={filteredSorted.length}
      />

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

      {filteredEmpty && searchQuery.trim().length > 0 ? (
        <div className="rounded-xl bg-neutral-900/30 ring-1 ring-white/10 p-8 text-center">
          <p className="text-sm text-neutral-300">
            No applications match{" "}
            <span className="text-white">&ldquo;{searchQuery}&rdquo;</span>
          </p>
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="mt-3 text-xs text-[#a5a8f5] hover:text-white"
          >
            Clear search
          </button>
        </div>
      ) : viewMode === "board" ? (
        <KanbanBoard
          applications={filteredSorted}
          onSelectApplication={setSelectedId}
          onStatusChange={handleStatusChange}
        />
      ) : (
        <ApplicationsListView
          applications={filteredSorted}
          onSelectApplication={setSelectedId}
          onStatusChange={handleStatusChange}
        />
      )}

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
