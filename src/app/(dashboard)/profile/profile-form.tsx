"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  CURRENCIES,
  type Currency,
  type EditableProfileKey,
  type Profile,
  type ProfileUpdateInput,
} from "@/types/profile";

import { ChipInput } from "./chip-input";

type FormState = {
  full_name: string;
  phone: string;
  location: string;
  current_company: string;
  current_job_title: string;
  years_experience: string;
  target_roles: string[];
  target_companies: string[];
  notice_period_days: string;
  expected_salary_min: string;
  expected_salary_max: string;
  expected_salary_currency: Currency;
  linkedin_url: string;
  github_url: string;
};

const DEFAULT_CURRENCY: Currency = "INR";

const STRING_KEYS = [
  "full_name",
  "phone",
  "location",
  "current_company",
  "current_job_title",
  "linkedin_url",
  "github_url",
] as const satisfies readonly EditableProfileKey[];

const NUMBER_KEYS = [
  "years_experience",
  "notice_period_days",
  "expected_salary_min",
  "expected_salary_max",
] as const satisfies readonly EditableProfileKey[];

const toFormState = (p: Profile): FormState => ({
  full_name: p.full_name ?? "",
  phone: p.phone ?? "",
  location: p.location ?? "",
  current_company: p.current_company ?? "",
  current_job_title: p.current_job_title ?? "",
  years_experience:
    p.years_experience != null ? String(p.years_experience) : "",
  target_roles: p.target_roles ?? [],
  target_companies: p.target_companies ?? [],
  notice_period_days:
    p.notice_period_days != null ? String(p.notice_period_days) : "",
  expected_salary_min:
    p.expected_salary_min != null ? String(p.expected_salary_min) : "",
  expected_salary_max:
    p.expected_salary_max != null ? String(p.expected_salary_max) : "",
  expected_salary_currency: p.expected_salary_currency ?? DEFAULT_CURRENCY,
  linkedin_url: p.linkedin_url ?? "",
  github_url: p.github_url ?? "",
});

const arraysEqual = (a: readonly string[], b: readonly string[]) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

const computeDiff = (current: FormState, baseline: FormState): ProfileUpdateInput => {
  const diff: ProfileUpdateInput = {};

  for (const k of STRING_KEYS) {
    const cur = current[k].trim();
    const base = baseline[k].trim();
    if (cur !== base) {
      diff[k] = cur === "" ? null : cur;
    }
  }

  for (const k of NUMBER_KEYS) {
    if (current[k].trim() !== baseline[k].trim()) {
      const cur = current[k].trim();
      diff[k] = cur === "" ? null : Number(cur);
    }
  }

  if (current.expected_salary_currency !== baseline.expected_salary_currency) {
    diff.expected_salary_currency = current.expected_salary_currency;
  }

  if (!arraysEqual(current.target_roles, baseline.target_roles)) {
    diff.target_roles = current.target_roles;
  }
  if (!arraysEqual(current.target_companies, baseline.target_companies)) {
    diff.target_companies = current.target_companies;
  }

  return diff;
};

const inputClass =
  "w-full rounded-md bg-black/40 ring-1 ring-white/10 focus:ring-[#6366f1] focus:outline-none px-3 py-2 text-sm";
const inputErrorClass =
  "w-full rounded-md bg-black/40 ring-1 ring-red-500/60 focus:ring-red-500 focus:outline-none px-3 py-2 text-sm";

export function ProfileForm({ initialProfile }: { initialProfile: Profile }) {
  const [baseline, setBaseline] = useState<FormState>(() => toFormState(initialProfile));
  const [form, setForm] = useState<FormState>(() => toFormState(initialProfile));
  const [saving, setSaving] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<
    { field: EditableProfileKey; message: string } | null
  >(null);
  const [showSaved, setShowSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const diff = useMemo(() => computeDiff(form, baseline), [form, baseline]);
  const hasChanges = Object.keys(diff).length > 0;

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (
      fieldError &&
      fieldError.field === (key as unknown as EditableProfileKey)
    ) {
      setFieldError(null);
    }
    if (bannerError) setBannerError(null);
  };

  const fieldErr = (key: EditableProfileKey) =>
    fieldError && fieldError.field === key ? fieldError.message : null;

  const onSave = async () => {
    if (!hasChanges || saving) return;
    setSaving(true);
    setBannerError(null);
    setFieldError(null);

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(diff),
      });
      const json = await res.json();

      if (!res.ok) {
        const errMsg = typeof json?.error === "string" ? json.error : "Failed to save";
        const errField =
          typeof json?.field === "string" ? (json.field as EditableProfileKey) : null;
        if (errField) {
          setFieldError({ field: errField, message: errMsg });
        } else {
          setBannerError(errMsg);
        }
        return;
      }

      const next = toFormState((json as { profile: Profile }).profile);
      setBaseline(next);
      setForm(next);
      setShowSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setShowSaved(false), 2000);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <header className="mb-8">
        <h1 className="text-2xl md:text-3xl font-semibold">Profile</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Tell us about yourself and what you&apos;re looking for. We use this to tailor job matches and applications.
        </p>
      </header>

      {bannerError && (
        <div
          role="alert"
          className="mb-6 rounded-md bg-red-500/10 ring-1 ring-red-500/30 text-red-300 text-sm px-3 py-2"
        >
          {bannerError}
        </div>
      )}

      <div className="rounded-xl bg-neutral-900/60 ring-1 ring-white/10 p-6 md:p-8 space-y-10">
        <section aria-labelledby="section-personal">
          <h2 id="section-personal" className="text-sm font-semibold text-neutral-100 mb-4 uppercase tracking-wider">
            Personal
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label="Full name"
              id="full_name"
              error={fieldErr("full_name")}
              className="md:col-span-2"
            >
              <input
                id="full_name"
                type="text"
                autoComplete="name"
                aria-invalid={fieldErr("full_name") ? true : undefined}
                aria-describedby={fieldErr("full_name") ? "full_name-error" : undefined}
                value={form.full_name}
                onChange={(e) => setField("full_name", e.target.value)}
                className={fieldErr("full_name") ? inputErrorClass : inputClass}
              />
            </Field>

            <Field label="Phone" id="phone" error={fieldErr("phone")}>
              <input
                id="phone"
                type="tel"
                autoComplete="tel"
                aria-invalid={fieldErr("phone") ? true : undefined}
                aria-describedby={fieldErr("phone") ? "phone-error" : undefined}
                value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
                className={fieldErr("phone") ? inputErrorClass : inputClass}
              />
            </Field>

            <Field label="Location" id="location" error={fieldErr("location")}>
              <input
                id="location"
                type="text"
                autoComplete="address-level2"
                placeholder="City, Country"
                aria-invalid={fieldErr("location") ? true : undefined}
                aria-describedby={fieldErr("location") ? "location-error" : undefined}
                value={form.location}
                onChange={(e) => setField("location", e.target.value)}
                className={fieldErr("location") ? inputErrorClass : inputClass}
              />
            </Field>

            <Field
              label="LinkedIn URL"
              id="linkedin_url"
              error={fieldErr("linkedin_url")}
            >
              <input
                id="linkedin_url"
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder="https://linkedin.com/in/…"
                aria-invalid={fieldErr("linkedin_url") ? true : undefined}
                aria-describedby={
                  fieldErr("linkedin_url") ? "linkedin_url-error" : undefined
                }
                value={form.linkedin_url}
                onChange={(e) => setField("linkedin_url", e.target.value)}
                className={fieldErr("linkedin_url") ? inputErrorClass : inputClass}
              />
            </Field>

            <Field
              label="GitHub URL"
              id="github_url"
              error={fieldErr("github_url")}
            >
              <input
                id="github_url"
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder="https://github.com/…"
                aria-invalid={fieldErr("github_url") ? true : undefined}
                aria-describedby={
                  fieldErr("github_url") ? "github_url-error" : undefined
                }
                value={form.github_url}
                onChange={(e) => setField("github_url", e.target.value)}
                className={fieldErr("github_url") ? inputErrorClass : inputClass}
              />
            </Field>
          </div>
        </section>

        <hr className="border-white/10" />

        <section aria-labelledby="section-current">
          <h2
            id="section-current"
            className="text-sm font-semibold text-neutral-100 mb-4 uppercase tracking-wider"
          >
            Current Role
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field
              label="Current company"
              id="current_company"
              error={fieldErr("current_company")}
            >
              <input
                id="current_company"
                type="text"
                autoComplete="organization"
                aria-invalid={fieldErr("current_company") ? true : undefined}
                aria-describedby={
                  fieldErr("current_company") ? "current_company-error" : undefined
                }
                value={form.current_company}
                onChange={(e) => setField("current_company", e.target.value)}
                className={
                  fieldErr("current_company") ? inputErrorClass : inputClass
                }
              />
            </Field>

            <Field
              label="Current job title"
              id="current_job_title"
              error={fieldErr("current_job_title")}
            >
              <input
                id="current_job_title"
                type="text"
                autoComplete="organization-title"
                aria-invalid={fieldErr("current_job_title") ? true : undefined}
                aria-describedby={
                  fieldErr("current_job_title")
                    ? "current_job_title-error"
                    : undefined
                }
                value={form.current_job_title}
                onChange={(e) => setField("current_job_title", e.target.value)}
                className={
                  fieldErr("current_job_title") ? inputErrorClass : inputClass
                }
              />
            </Field>

            <Field
              label="Years of experience"
              id="years_experience"
              error={fieldErr("years_experience")}
              hint="0–50"
            >
              <input
                id="years_experience"
                type="number"
                inputMode="numeric"
                min={0}
                max={50}
                step={1}
                aria-invalid={fieldErr("years_experience") ? true : undefined}
                aria-describedby={
                  fieldErr("years_experience")
                    ? "years_experience-error"
                    : undefined
                }
                value={form.years_experience}
                onChange={(e) => setField("years_experience", e.target.value)}
                className={
                  fieldErr("years_experience") ? inputErrorClass : inputClass
                }
              />
            </Field>

            <Field
              label="Notice period (days)"
              id="notice_period_days"
              error={fieldErr("notice_period_days")}
              hint="0–180"
            >
              <input
                id="notice_period_days"
                type="number"
                inputMode="numeric"
                min={0}
                max={180}
                step={1}
                aria-invalid={fieldErr("notice_period_days") ? true : undefined}
                aria-describedby={
                  fieldErr("notice_period_days")
                    ? "notice_period_days-error"
                    : undefined
                }
                value={form.notice_period_days}
                onChange={(e) => setField("notice_period_days", e.target.value)}
                className={
                  fieldErr("notice_period_days") ? inputErrorClass : inputClass
                }
              />
            </Field>
          </div>
        </section>

        <hr className="border-white/10" />

        <section aria-labelledby="section-target">
          <h2
            id="section-target"
            className="text-sm font-semibold text-neutral-100 mb-4 uppercase tracking-wider"
          >
            Target Search
          </h2>
          <div className="space-y-4">
            <Field
              label="Target roles"
              id="target_roles"
              error={fieldErr("target_roles")}
              hint="Press Enter or comma to add. Up to 10."
            >
              <ChipInput
                id="target_roles"
                ariaLabel="Target roles"
                value={form.target_roles}
                onChange={(next) => setField("target_roles", next)}
                placeholder="e.g. Senior Frontend Engineer"
              />
            </Field>

            <Field
              label="Target companies"
              id="target_companies"
              error={fieldErr("target_companies")}
              hint="Press Enter or comma to add. Up to 10."
            >
              <ChipInput
                id="target_companies"
                ariaLabel="Target companies"
                value={form.target_companies}
                onChange={(next) => setField("target_companies", next)}
                placeholder="e.g. Stripe"
              />
            </Field>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field
                label="Salary min"
                id="expected_salary_min"
                error={fieldErr("expected_salary_min")}
              >
                <input
                  id="expected_salary_min"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  aria-invalid={fieldErr("expected_salary_min") ? true : undefined}
                  aria-describedby={
                    fieldErr("expected_salary_min")
                      ? "expected_salary_min-error"
                      : undefined
                  }
                  value={form.expected_salary_min}
                  onChange={(e) => setField("expected_salary_min", e.target.value)}
                  className={
                    fieldErr("expected_salary_min") ? inputErrorClass : inputClass
                  }
                />
              </Field>

              <Field
                label="Salary max"
                id="expected_salary_max"
                error={fieldErr("expected_salary_max")}
              >
                <input
                  id="expected_salary_max"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  aria-invalid={fieldErr("expected_salary_max") ? true : undefined}
                  aria-describedby={
                    fieldErr("expected_salary_max")
                      ? "expected_salary_max-error"
                      : undefined
                  }
                  value={form.expected_salary_max}
                  onChange={(e) => setField("expected_salary_max", e.target.value)}
                  className={
                    fieldErr("expected_salary_max") ? inputErrorClass : inputClass
                  }
                />
              </Field>

              <Field
                label="Currency"
                id="expected_salary_currency"
                error={fieldErr("expected_salary_currency")}
              >
                <select
                  id="expected_salary_currency"
                  aria-invalid={
                    fieldErr("expected_salary_currency") ? true : undefined
                  }
                  aria-describedby={
                    fieldErr("expected_salary_currency")
                      ? "expected_salary_currency-error"
                      : undefined
                  }
                  value={form.expected_salary_currency}
                  onChange={(e) =>
                    setField(
                      "expected_salary_currency",
                      e.target.value as Currency
                    )
                  }
                  className={
                    fieldErr("expected_salary_currency")
                      ? inputErrorClass
                      : inputClass
                  }
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c} className="bg-[#0a0a0a]">
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-6 flex items-center justify-end gap-4">
        <span
          aria-live="polite"
          className={[
            "text-sm transition-opacity duration-500",
            showSaved ? "opacity-100 text-green-400" : "opacity-0",
          ].join(" ")}
        >
          ✓ Saved
        </span>
        <button
          type="button"
          onClick={onSave}
          disabled={!hasChanges || saving}
          className="rounded-md bg-[#6366f1] hover:bg-[#5458e0] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2 transition"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  id,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  id: string;
  error?: string | null;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm text-neutral-300 mb-1">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p className="mt-1 text-xs text-neutral-500">{hint}</p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
