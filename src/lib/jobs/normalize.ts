// Source identifiers must match the CHECK constraint on public.jobs.source.
export type JobSource =
  | "jsearch"
  | "adzuna"
  | "arbeitnow"
  | "greenhouse"
  | "lever";

// Mirror of the public.jobs columns that source adapters are responsible for.
// We omit id, ingested_at (defaulted by the DB) so adapters never need to
// fabricate them. Every source adapter (Greenhouse, JSearch, Adzuna, Lever,
// Arbeitnow) returns NormalizedJob[] before the cron handler upserts.
export interface NormalizedJob {
  source: JobSource;
  source_id: string;
  title: string;
  company: string;
  location: string | null;
  is_remote: boolean;
  description: string | null;
  requirements: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  employment_type: string | null;
  experience_min_years: number | null;
  experience_max_years: number | null;
  apply_url: string;
  posted_at: string | null;
  is_active: boolean;
}
