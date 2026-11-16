import { NextResponse, type NextRequest } from "next/server";

import { ABANDONED_AFTER_MS, selectAbandoned } from "@/lib/resume/lifecycle";
import { buildStoragePath, isOwnStoragePath } from "@/lib/resume/storage-path";
import {
  hasPdfSignature,
  MAX_UPLOAD_BYTES,
  UPLOAD_NOT_PDF_MESSAGE,
  UPLOAD_TOO_LARGE_MESSAGE,
} from "@/lib/resume/upload-rules";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { createServerSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";

const BUCKET = "resumes";
// Most abandoned rows one upload removes. A user normally has none or one.
const CLEANUP_BATCH = 50;

type UserSupabase = Awaited<ReturnType<typeof createServerSupabase>>;
type AdminSupabase = ReturnType<typeof createAdminSupabase>;

// Uploads that were never processed would otherwise pile up, each with its
// PDF: a parse that kept failing, a scan, a tab closed too early. Nothing
// runs on a schedule for this, so the user's next upload clears them.
//
// Rows go first, through the user's own client: the DELETE repeats every
// condition, so a row that was parsed or promoted since the SELECT stays, and
// RLS keeps it to the caller's rows. Only the files of rows that were really
// deleted are then removed. That takes the service role, because the bucket
// has no policies for users, and each path is checked against the caller's
// folder first. If Storage fails at that point the files outlive their rows;
// the other order would leave rows pointing at files that are gone.
//
// Best effort: the upload has already succeeded and must not fail over this.
async function removeAbandoned(
  supabase: UserSupabase,
  admin: AdminSupabase,
  userId: string,
  keepId: string
): Promise<void> {
  try {
    const now = Date.now();
    const cutoff = new Date(now - ABANDONED_AFTER_MS).toISOString();

    const { data: candidates, error: listError } = await supabase
      .from("resumes")
      .select("id, is_primary, parsed_content, created_at")
      .eq("user_id", userId)
      .eq("kind", "uploaded")
      .eq("is_primary", false)
      .is("parsed_content", null)
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(CLEANUP_BATCH);

    if (listError) {
      console.error(`[resume/upload] cleanup lookup failed: ${listError.message}`);
      return;
    }

    const ids = selectAbandoned(candidates ?? [], now, keepId);
    if (ids.length === 0) return;

    const { data: deleted, error: deleteError } = await supabase
      .from("resumes")
      .delete()
      .in("id", ids)
      .eq("user_id", userId)
      .eq("kind", "uploaded")
      .eq("is_primary", false)
      .is("parsed_content", null)
      .lt("created_at", cutoff)
      .select("id, storage_path");

    if (deleteError) {
      console.error(`[resume/upload] cleanup delete failed: ${deleteError.message}`);
      return;
    }

    const paths = (deleted ?? [])
      .map((row) => row.storage_path as unknown)
      .filter((path): path is string => isOwnStoragePath(path, userId));
    if (paths.length === 0) return;

    const { error: removeError } = await admin.storage.from(BUCKET).remove(paths);
    if (removeError) {
      console.error(
        `[resume/upload] ${paths.length} abandoned file(s) left in storage: ${removeError.message}`
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error(`[resume/upload] cleanup threw: ${message}`);
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data" },
      { status: 400 }
    );
  }

  const file = formData.get("resume");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing 'resume' file field" },
      { status: 400 }
    );
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: UPLOAD_TOO_LARGE_MESSAGE },
      { status: 413 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // The file's own bytes decide, not the type the browser declared for it.
  if (!hasPdfSignature(bytes)) {
    return NextResponse.json({ error: UPLOAD_NOT_PDF_MESSAGE }, { status: 415 });
  }

  const storagePath = buildStoragePath(user.id, file.name, Date.now());

  const admin = createAdminSupabase();
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: `Storage upload failed: ${uploadError.message}` },
      { status: 500 }
    );
  }

  // Not primary yet. The résumé the feed, tailoring and chat read stays the
  // previous one until this file has been parsed and scored;
  // promote_parsed_resume (migration 0008) then saves both and moves the flag
  // in one transaction. A parse that fails or never runs changes nothing the
  // user already had.
  const { data: inserted, error: insertError } = await supabase
    .from("resumes")
    .insert({
      user_id: user.id,
      storage_path: storagePath,
      file_name: file.name,
      file_size_bytes: file.size,
      is_primary: false,
    })
    .select("id, storage_path, file_name")
    .single();

  if (insertError || !inserted) {
    await admin.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json(
      { error: insertError?.message ?? "Insert failed" },
      { status: 500 }
    );
  }

  await removeAbandoned(supabase, admin, user.id, inserted.id);

  return NextResponse.json(inserted, { status: 201 });
}
