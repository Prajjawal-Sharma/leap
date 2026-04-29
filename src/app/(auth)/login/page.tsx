"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { createBrowserSupabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const initialError = searchParams.get("error");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const supabase = createBrowserSupabase();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      setError(signInError.message);
      setSubmitting(false);
      return;
    }
    const next = searchParams.get("next") ?? "/jobs";
    router.replace(next);
    router.refresh();
  };

  const handleGoogle = async () => {
    setError(null);
    setSubmitting(true);
    const supabase = createBrowserSupabase();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      },
    });
    if (oauthError) {
      setError(oauthError.message);
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl bg-neutral-900/60 ring-1 ring-white/10 p-8">
        <h1 className="text-2xl font-semibold mb-1">Welcome back</h1>
        <p className="text-sm text-neutral-400 mb-6">
          Sign in to keep finding the right roles.
        </p>

        {(error || initialError) && (
          <div className="mb-4 rounded-md bg-red-500/10 ring-1 ring-red-500/30 text-red-300 text-sm px-3 py-2">
            {error ?? "Sign in failed. Please try again."}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm text-neutral-300 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md bg-black/40 ring-1 ring-white/10 focus:ring-[#6366f1] focus:outline-none px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm text-neutral-300 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md bg-black/40 ring-1 ring-white/10 focus:ring-[#6366f1] focus:outline-none px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-[#6366f1] hover:bg-[#5458e0] disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 transition"
          >
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="my-6 flex items-center gap-3 text-xs text-neutral-500">
          <div className="h-px flex-1 bg-white/10" />
          <span>or</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={submitting}
          className="w-full rounded-md bg-white text-neutral-900 hover:bg-neutral-200 disabled:opacity-60 text-sm font-medium px-4 py-2 transition"
        >
          Continue with Google
        </button>

        <div className="mt-6 flex items-center justify-between text-sm">
          <Link href="/forgot-password" className="text-neutral-400 hover:text-white">
            Forgot password?
          </Link>
          <Link href="/signup" className="text-[#6366f1] hover:text-[#8689f5]">
            Create account
          </Link>
        </div>
      </div>
    </main>
  );
}
