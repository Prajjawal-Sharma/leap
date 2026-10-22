import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabase } from "@/lib/supabase-server";
import {
  CURRENCIES,
  type Currency,
  type EditableProfileKey,
  type Profile,
  type ProfileUpdateInput,
} from "@/types/profile";

export const runtime = "nodejs";

const STRING_FIELDS = [
  "full_name",
  "phone",
  "location",
  "current_company",
  "current_job_title",
  "linkedin_url",
  "github_url",
] as const satisfies readonly EditableProfileKey[];

const ARRAY_FIELDS = ["target_roles", "target_companies"] as const satisfies readonly EditableProfileKey[];

type ValidationOk = { ok: true; data: ProfileUpdateInput };
type ValidationErr = { ok: false; error: string; field?: EditableProfileKey };
type ValidationResult = ValidationOk | ValidationErr;

function validateBody(body: Record<string, unknown>): ValidationResult {
  const update: ProfileUpdateInput = {};

  for (const key of STRING_FIELDS) {
    if (!(key in body)) continue;
    const raw = body[key];
    if (raw === null || raw === undefined) {
      update[key] = null;
      continue;
    }
    if (typeof raw !== "string") {
      return { ok: false, field: key, error: `${key} must be a string or null` };
    }
    const trimmed = raw.trim();
    update[key] = trimmed.length === 0 ? null : trimmed;
  }

  if ("years_experience" in body) {
    const raw = body.years_experience;
    if (raw === null || raw === undefined || raw === "") {
      update.years_experience = null;
    } else {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 50) {
        return {
          ok: false,
          field: "years_experience",
          error: "years_experience must be an integer between 0 and 50",
        };
      }
      update.years_experience = n;
    }
  }

  if ("notice_period_days" in body) {
    const raw = body.notice_period_days;
    if (raw === null || raw === undefined || raw === "") {
      update.notice_period_days = null;
    } else {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 180) {
        return {
          ok: false,
          field: "notice_period_days",
          error: "notice_period_days must be an integer between 0 and 180",
        };
      }
      update.notice_period_days = n;
    }
  }

  for (const key of ["expected_salary_min", "expected_salary_max"] as const) {
    if (!(key in body)) continue;
    const raw = body[key];
    if (raw === null || raw === undefined || raw === "") {
      update[key] = null;
      continue;
    }
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, field: key, error: `${key} must be a non-negative number` };
    }
    update[key] = n;
  }

  if ("expected_salary_currency" in body) {
    const raw = body.expected_salary_currency;
    if (raw === null || raw === undefined || raw === "") {
      update.expected_salary_currency = null;
    } else if (typeof raw === "string" && (CURRENCIES as readonly string[]).includes(raw)) {
      update.expected_salary_currency = raw as Currency;
    } else {
      return {
        ok: false,
        field: "expected_salary_currency",
        error: `expected_salary_currency must be one of ${CURRENCIES.join(", ")}`,
      };
    }
  }

  for (const key of ARRAY_FIELDS) {
    if (!(key in body)) continue;
    const raw = body[key];
    if (raw === null || raw === undefined) {
      update[key] = null;
      continue;
    }
    if (!Array.isArray(raw) || !raw.every((v) => typeof v === "string")) {
      return { ok: false, field: key, error: `${key} must be an array of strings` };
    }
    const cleaned = (raw as string[]).map((v) => v.trim()).filter((v) => v.length > 0);
    update[key] = cleaned;
  }

  return { ok: true, data: update };
}

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  return NextResponse.json({ profile: data as Profile });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400 });
  }

  const validated = validateBody(body);
  if (!validated.ok) {
    return NextResponse.json(
      { error: validated.error, field: validated.field ?? null },
      { status: 400 }
    );
  }

  const update = validated.data;

  // Cross-field check: expected_salary_min <= expected_salary_max. If only
  // one side is in this patch, fetch the existing row so we can validate the
  // merged pair before writing.
  const minInPatch = "expected_salary_min" in update;
  const maxInPatch = "expected_salary_max" in update;
  if (minInPatch || maxInPatch) {
    let mergedMin: number | null | undefined = update.expected_salary_min;
    let mergedMax: number | null | undefined = update.expected_salary_max;

    if (!(minInPatch && maxInPatch)) {
      const { data: existing, error: fetchErr } = await supabase
        .from("profiles")
        .select("expected_salary_min, expected_salary_max")
        .eq("id", user.id)
        .single();
      if (fetchErr || !existing) {
        return NextResponse.json({ error: "Profile not found" }, { status: 404 });
      }
      if (!minInPatch) mergedMin = existing.expected_salary_min as number | null;
      if (!maxInPatch) mergedMax = existing.expected_salary_max as number | null;
    }

    if (
      mergedMin != null &&
      mergedMax != null &&
      mergedMin > mergedMax
    ) {
      return NextResponse.json(
        {
          error: "expected_salary_min cannot exceed expected_salary_max",
          field: "expected_salary_min",
        },
        { status: 400 }
      );
    }
  }

  // Always bump updated_at — the trigger does this too, but being explicit
  // means a no-op patch (empty body) still touches the row.
  const updateWithTimestamp = {
    ...update,
    updated_at: new Date().toISOString(),
  };

  const { data: updated, error: updateErr } = await supabase
    .from("profiles")
    .update(updateWithTimestamp)
    .eq("id", user.id)
    .select("*")
    .single();

  if (updateErr || !updated) {
    return NextResponse.json(
      { error: updateErr?.message ?? "Failed to update profile" },
      { status: 500 }
    );
  }

  return NextResponse.json({ profile: updated as Profile });
}
