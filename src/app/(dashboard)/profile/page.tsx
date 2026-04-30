import Link from "next/link";

import { createServerSupabase } from "@/lib/supabase-server";
import type { Profile } from "@/types/profile";

import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The dashboard layout already redirects unauthenticated users to /login,
  // so user should be present here. Guard anyway for type narrowing.
  if (!user) {
    return null;
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile) {
    return (
      <section className="max-w-3xl">
        <h1 className="text-2xl md:text-3xl font-semibold">Profile</h1>
        <div className="mt-6 rounded-xl bg-neutral-900/60 ring-1 ring-white/10 p-6">
          <p className="text-sm text-neutral-300">
            We couldn&apos;t load your profile. This usually clears up on a retry.
          </p>
          {error && (
            <p className="mt-2 text-xs text-red-400">{error.message}</p>
          )}
          <Link
            href="/profile"
            prefetch={false}
            className="mt-4 inline-block rounded-md bg-[#6366f1] hover:bg-[#5458e0] text-white text-sm font-medium px-4 py-2 transition"
          >
            Retry
          </Link>
        </div>
      </section>
    );
  }

  return <ProfileForm initialProfile={profile as Profile} />;
}
