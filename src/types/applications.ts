export const APPLICATION_STATUSES = [
  "saved",
  "applied",
  "viewed",
  "interviewing",
  "offered",
  "rejected",
  "withdrawn",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

// "Active" = the user is still working this opportunity. Used for the sidebar
// badge and any "open pipeline" rollups. Excludes terminal outcomes plus
// offered (which we treat as a celebration state, not pipeline).
export const ACTIVE_STATUSES: readonly ApplicationStatus[] = [
  "saved",
  "applied",
  "viewed",
  "interviewing",
];

export const isApplicationStatus = (v: unknown): v is ApplicationStatus =>
  typeof v === "string" &&
  (APPLICATION_STATUSES as readonly string[]).includes(v);

export interface ApplicationJob {
  id: string;
  title: string;
  company: string;
  location: string | null;
  is_remote: boolean;
  apply_url: string;
  description: string | null;
  employment_type: string | null;
  posted_at: string | null;
}

export interface ApplicationWithJob {
  id: string;
  status: ApplicationStatus;
  notes: string | null;
  applied_at: string;
  updated_at: string;
  job: ApplicationJob;
  // Reserved for when we begin persisting per-application match score at
  // save/apply time. Always null today — cards must gracefully omit it.
  match_score: number | null;
}
