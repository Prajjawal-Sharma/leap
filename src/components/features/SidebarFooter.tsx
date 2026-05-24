"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createBrowserSupabase } from "@/lib/supabase";

type Props = {
  // Passed from the server-side session in the dashboard layout. Null when
  // the layout couldn't resolve a user (race during sign-out, or revoked
  // session) — we render the sign-out button anyway so the user has an
  // escape hatch.
  userEmail: string | null;
};

export default function SidebarFooter({ userEmail }: Props) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setError(null);
    try {
      const supabase = createBrowserSupabase();
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      // signOut clears the auth cookies on the browser client. Push to /login
      // so the user sees the new state immediately, then refresh so the
      // server-rendered shell (sidebar badge, etc.) drops the stale session.
      router.push("/login");
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Sign out failed";
      setError(message);
      setSigningOut(false);
    }
  };

  return (
    <div className="mt-4 md:mt-auto pt-4 border-t border-white/10 space-y-2">
      {userEmail ? (
        <p
          className="text-xs text-neutral-500 truncate"
          title={userEmail}
        >
          {userEmail}
        </p>
      ) : (
        <p className="text-xs text-neutral-600 italic">No active session</p>
      )}
      <button
        type="button"
        onClick={handleSignOut}
        disabled={signingOut}
        className="w-full text-left rounded-md px-3 py-2 text-sm text-neutral-400 hover:text-white hover:bg-white/5 disabled:opacity-60 transition"
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
      {error && (
        <p className="text-xs text-red-300 px-1" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
