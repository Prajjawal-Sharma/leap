import { NextResponse } from "next/server";

import { createServerSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // This list backs the resume page (uploads + ATS scores). Generated
  // tailored rows have no file and would render as blank "past uploads",
  // so they stay out of this endpoint.
  const { data, error } = await supabase
    .from("resumes")
    .select(
      "id, file_name, file_size_bytes, storage_path, is_primary, ats_score, ats_breakdown, parsed_content, created_at"
    )
    .eq("user_id", user.id)
    .eq("kind", "uploaded")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ resumes: data ?? [] });
}
