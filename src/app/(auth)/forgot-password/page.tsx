"use client";

import Link from "next/link";
import { useState } from "react";

import { createBrowserSupabase } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const supabase = createBrowserSupabase();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password`,
    });
    if (resetError) {
      setError(resetError.message);
      setSubmitting(false);
      return;
    }
    setSuccess(true);
    setSubmitting(false);
  };

  if (success) {
    return (
      <main className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-xl bg-neutral-900/60 ring-1 ring-white/10 p-8 text-center">
          <h1 className="text-2xl font-semibold mb-2">Check your email</h1>
          <p className="text-sm text-neutral-400">
            If an account exists for{" "}
            <span className="text-white">{email}</span>, we sent a password reset
            link.
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
        <h1 className="text-2xl font-semibold mb-1">Reset your password</h1>
        <p className="text-sm text-neutral-400 mb-6">
          Enter the email associated with your account.
        </p>

        {error && (
          <div className="mb-4 rounded-md bg-red-500/10 ring-1 ring-red-500/30 text-red-300 text-sm px-3 py-2">
            {error}
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
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-[#6366f1] hover:bg-[#5458e0] disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 transition"
          >
            {submitting ? "Sending..." : "Send reset link"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-neutral-400">
          Remembered it?{" "}
          <Link href="/login" className="text-[#6366f1] hover:text-[#8689f5]">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
