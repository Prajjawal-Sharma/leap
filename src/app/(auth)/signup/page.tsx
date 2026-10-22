"use client";

import Link from "next/link";
import { useState } from "react";

import { createBrowserSupabase } from "@/lib/supabase";

export default function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const supabase = createBrowserSupabase();
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      },
    });
    if (signUpError) {
      setError(signUpError.message);
      setSubmitting(false);
      return;
    }
    setSuccess(true);
    setSubmitting(false);
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

  if (success) {
    return (
      <main className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-xl bg-neutral-900/60 ring-1 ring-white/10 p-8 text-center">
          <h1 className="text-2xl font-semibold mb-2">Check your email</h1>
          <p className="text-sm text-neutral-400">
            We sent a confirmation link to{" "}
            <span className="text-white">{email}</span>. Click it to activate your
            account.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block text-sm text-[#6366f1] hover:text-[#8689f5]"
          >
            Back to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl bg-neutral-900/60 ring-1 ring-white/10 p-8">
        <h1 className="text-2xl font-semibold mb-1">Create your account</h1>
        <p className="text-sm text-neutral-400 mb-6">
          Free during the beta. No card required.
        </p>

        {error && (
          <div className="mb-4 rounded-md bg-red-500/10 ring-1 ring-red-500/30 text-red-300 text-sm px-3 py-2">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="fullName" className="block text-sm text-neutral-300 mb-1">
              Full name
            </label>
            <input
              id="fullName"
              type="text"
              required
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-md bg-black/40 ring-1 ring-white/10 focus:ring-[#6366f1] focus:outline-none px-3 py-2 text-sm"
            />
          </div>
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
              autoComplete="new-password"
              minLength={8}
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
            {submitting ? "Creating account..." : "Create account"}
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

        <p className="mt-6 text-center text-sm text-neutral-400">
          Already have an account?{" "}
          <Link href="/login" className="text-[#6366f1] hover:text-[#8689f5]">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
