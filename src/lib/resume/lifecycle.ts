// The states an uploaded résumé moves through, and the two decisions made
// from them: which rows an upload may clean up, and what the Resume page
// shows.
//
// A row is inserted by upload with is_primary = false and nothing parsed.
// The parse route either saves parse and score and promotes it in one step
// (promote_parsed_resume, migration 0008), marks it failed when the file can
// never be read, or leaves it as it was when the failure might pass.

export type ResumeStatus = "parsed" | "pending" | "failed";

type StatusFields = {
  parsed_content: unknown;
  ats_score: number | null;
  parse_error: string | null;
};

/**
 * "parsed" needs both halves: parse and score are saved together, and a row
 * from before that was true with only one of them is not finished.
 */
export function resumeStatus(row: StatusFields): ResumeStatus {
  if (row.parsed_content != null && row.ats_score != null) return "parsed";
  return row.parse_error ? "failed" : "pending";
}

// --- cleanup ----------------------------------------------------------------

/**
 * An upload that has gone this long without being processed is abandoned. A
 * parse runs for five minutes at most, so an hour cannot catch one that is
 * still in flight for a file just uploaded.
 */
export const ABANDONED_AFTER_MS = 60 * 60 * 1000;

export type CleanupCandidate = {
  id: string;
  is_primary: boolean;
  parsed_content: unknown;
  created_at: string;
};

/**
 * Ids of the rows an upload may delete: never parsed, not the primary, and
 * uploaded more than an hour before `now`. `keepId` is the row the upload
 * just created. A row whose age cannot be read is kept.
 */
export function selectAbandoned(
  rows: CleanupCandidate[],
  now: number,
  keepId?: string
): string[] {
  return rows
    .filter((row) => {
      if (row.id === keepId) return false;
      if (row.parsed_content != null || row.is_primary !== false) return false;
      const createdAt = Date.parse(row.created_at);
      return Number.isFinite(createdAt) && now - createdAt > ABANDONED_AFTER_MS;
    })
    .map((row) => row.id);
}

/**
 * The files a cleanup may remove from storage: those of the rows it deleted,
 * except any that a row left behind still names. Nothing stops a user from
 * pointing two of their rows at one file, and removing it would take the PDF
 * from under a résumé that is still in use.
 */
export function removablePaths(
  deletedPaths: string[],
  pathsStillNamed: string[]
): string[] {
  const kept = new Set(pathsStillNamed);
  return [...new Set(deletedPaths)].filter((path) => !kept.has(path));
}

// --- Resume page ------------------------------------------------------------

type ViewFields = StatusFields & { is_primary: boolean };

export type ResumeView<T> = {
  /** The parsed résumé whose analysis is shown: the primary, else the newest. */
  shown: T | null;
  /** The newest upload, when it has not been processed yet. */
  pending: T | null;
  /** The newest upload, when it can never be processed. */
  failed: T | null;
};

/**
 * What the Resume page shows for a user's uploads, newest first (the order
 * /api/resume/list returns). Only the newest upload can be pending or
 * failed: an older unprocessed one has been superseded and is cleaned up by
 * a later upload. When `pending` is set, `shown` is an earlier upload and
 * must not be presented as the current résumé.
 */
export function pickResumeView<T extends ViewFields>(rows: T[]): ResumeView<T> {
  const parsed = rows.filter((row) => resumeStatus(row) === "parsed");
  const newest = rows[0] ?? null;
  const newestStatus = newest ? resumeStatus(newest) : null;
  return {
    shown: parsed.find((row) => row.is_primary) ?? parsed[0] ?? null,
    pending: newestStatus === "pending" ? newest : null,
    failed: newestStatus === "failed" ? newest : null,
  };
}
