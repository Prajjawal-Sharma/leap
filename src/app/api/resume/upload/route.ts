import { NextResponse, type NextRequest } from "next/server";

import { createAdminSupabase } from "@/lib/supabase-admin";
import { createServerSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;
const BUCKET = "resumes";

const sanitize = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "resume.pdf";

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

  if (file.type !== "application/pdf") {
    return NextResponse.json(
      { error: "File must be a PDF (application/pdf)" },
      { status: 400 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File exceeds 5MB limit" },
      { status: 400 }
    );
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }

  const safeName = sanitize(file.name);
  const storagePath = `${user.id}/${Date.now()}-${safeName}`;

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

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

  const { data: existingPrimary, error: existingError } = await supabase
    .from("resumes")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_primary", true)
    .limit(1);

  if (existingError) {
    await admin.storage.from(BUCKET).remove([storagePath]);
    return NextResponse.json(
      { error: existingError.message },
      { status: 500 }
    );
  }

  const isPrimary = !existingPrimary || existingPrimary.length === 0;

  const { data: inserted, error: insertError } = await supabase
    .from("resumes")
    .insert({
      user_id: user.id,
      storage_path: storagePath,
      file_name: file.name,
      file_size_bytes: file.size,
      is_primary: isPrimary,
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

  return NextResponse.json(inserted, { status: 201 });
}
