import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabase } from "@/lib/supabase-server";
import {
  type ApplicationStatus,
  type ApplicationWithJob,
  isApplicationStatus,
} from "@/types/applications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Supabase relational select: applications joined with the parent jobs row.
// `job:jobs(...)` renames the embed so the client sees a tidy `job` field.
const APP_SELECT =
  "id, status, notes, applied_at, updated_at, job:jobs!inner(id, title, company, location, is_remote, apply_url, description, employment_type, posted_at)";

// supabase-js infers !inner joins as a single object when the FK is one-to-one
// but loosely types it as an array unless we coerce. Centralize the shape so
// route handlers stay focused on business logic.
type RawApplicationRow = {
  id: string;
  status: ApplicationStatus;
  notes: string | null;
  applied_at: string;
  updated_at: string;
  job:
    | {
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
    | Array<{
        id: string;
        title: string;
        company: string;
        location: string | null;
        is_remote: boolean;
        apply_url: string;
        description: string | null;
        employment_type: string | null;
        posted_at: string | null;
      }>;
};

function normalize(row: RawApplicationRow): ApplicationWithJob {
  const job = Array.isArray(row.job) ? row.job[0] : row.job;
  return {
    id: row.id,
    status: row.status,
    notes: row.notes,
    applied_at: row.applied_at,
    updated_at: row.updated_at,
    job,
    match_score: null,
  };
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
    .from("applications")
    .select(APP_SELECT)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const applications = ((data ?? []) as unknown as RawApplicationRow[])
    .map(normalize)
    .filter((a) => a.job);

  return NextResponse.json(
    { applications },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: NextRequest) {
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

  const jobId = typeof body.job_id === "string" ? body.job_id.trim() : "";
  if (!jobId) {
    return NextResponse.json(
      { error: "job_id is required" },
      { status: 400 }
    );
  }

  // POST accepts only the two creation states — every other transition is a
  // PATCH on an existing row. Defaults to 'applied' to match the DB column
  // default behaviour for callers that don't care.
  let status: ApplicationStatus = "applied";
  if (body.status !== undefined) {
    if (!isApplicationStatus(body.status) || (body.status !== "saved" && body.status !== "applied")) {
      return NextResponse.json(
        { error: "status must be 'saved' or 'applied' on create" },
        { status: 400 }
      );
    }
    status = body.status;
  }

  const notes =
    typeof body.notes === "string" && body.notes.trim().length > 0
      ? body.notes.trim()
      : null;

  // Idempotent: the (user_id, job_id) unique constraint means a second
  // create on the same job should hand back the existing row, not 409.
  const { data: existing, error: existingErr } = await supabase
    .from("applications")
    .select(APP_SELECT)
    .eq("user_id", user.id)
    .eq("job_id", jobId)
    .maybeSingle();

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  if (existing) {
    return NextResponse.json(
      { application: normalize(existing as unknown as RawApplicationRow) },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("applications")
    .insert({
      user_id: user.id,
      job_id: jobId,
      status,
      notes,
    })
    .select(APP_SELECT)
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json(
      { error: insertErr?.message ?? "Insert failed" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { application: normalize(inserted as unknown as RawApplicationRow) },
    { status: 201, headers: { "Cache-Control": "no-store" } }
  );
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

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const update: { status?: ApplicationStatus; notes?: string | null } = {};

  if (body.status !== undefined) {
    if (!isApplicationStatus(body.status)) {
      return NextResponse.json(
        { error: `status must be one of the application statuses` },
        { status: 400 }
      );
    }
    update.status = body.status;
  }

  if (body.notes !== undefined) {
    if (body.notes === null) {
      update.notes = null;
    } else if (typeof body.notes === "string") {
      const trimmed = body.notes.trim();
      update.notes = trimmed.length === 0 ? null : trimmed;
    } else {
      return NextResponse.json(
        { error: "notes must be a string or null" },
        { status: 400 }
      );
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "no patchable fields provided" },
      { status: 400 }
    );
  }

  // The updated_at trigger handles this, but writing it explicitly guarantees
  // the column ticks even on a status-only update where the trigger might
  // have already fired in the same statement.
  const patch = { ...update, updated_at: new Date().toISOString() };

  // user_id check on top of RLS — defense in depth.
  const { data: updated, error: updateErr } = await supabase
    .from("applications")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select(APP_SELECT)
    .single();

  if (updateErr || !updated) {
    const status = updateErr?.code === "PGRST116" ? 404 : 500;
    return NextResponse.json(
      { error: updateErr?.message ?? "Update failed" },
      { status }
    );
  }

  return NextResponse.json(
    { application: normalize(updated as unknown as RawApplicationRow) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
