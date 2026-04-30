export type Currency =
  | "INR"
  | "USD"
  | "EUR"
  | "GBP"
  | "SGD"
  | "AED"
  | "CAD"
  | "AUD";

export const CURRENCIES: readonly Currency[] = [
  "INR",
  "USD",
  "EUR",
  "GBP",
  "SGD",
  "AED",
  "CAD",
  "AUD",
] as const;

export interface Profile {
  id: string;
  full_name: string | null;
  phone: string | null;
  location: string | null;
  current_company: string | null;
  current_job_title: string | null;
  years_experience: number | null;
  target_roles: string[] | null;
  target_companies: string[] | null;
  notice_period_days: number | null;
  expected_salary_min: number | null;
  expected_salary_max: number | null;
  expected_salary_currency: Currency | null;
  linkedin_url: string | null;
  github_url: string | null;
  created_at: string;
  updated_at: string;
}

export const EDITABLE_PROFILE_KEYS = [
  "full_name",
  "phone",
  "location",
  "current_company",
  "current_job_title",
  "years_experience",
  "target_roles",
  "target_companies",
  "notice_period_days",
  "expected_salary_min",
  "expected_salary_max",
  "expected_salary_currency",
  "linkedin_url",
  "github_url",
] as const;

export type EditableProfileKey = (typeof EDITABLE_PROFILE_KEYS)[number];

export type ProfileUpdateInput = Partial<Pick<Profile, EditableProfileKey>>;
