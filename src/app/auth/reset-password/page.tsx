"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { createBrowserSupabase } from "@/lib/supabase";

type Status = "verifying" | "ready" | "invalid" | "success";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>("verifying");
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sessionLost, setSessionLost] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const supabase = createBrowserSupabase();

    // Only ever leave "verifying" here, so a late auth event can't drag
    // the UI back out of "success" or "invalid".
    const markReady = () => setStatus((s) => (s === "verifying" ? "ready" : s));
    const markInvalid = () =>
      setStatus((s) => (s === "verifying" ? "invalid" : s));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setEmail((e) => session?.user.email ?? e);
        markReady();
      }
    });

    const verify = async () => {
      const code = searchParams.get("code");
      if (code) {
        const { data, error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);
        if (!exchangeError) {
          setEmail(data.session?.user.email ?? null);
          markReady();
          return;
        }
        // The browser client auto-exchanges the code on load
        // (detectSessionInUrl), so this explicit call can lose the race;
        // an existing session below means the exchange already succeeded.
      }

      // Any session — recovery or regular — can set a new password, so an
      // expired link never dead-ends a signed-in user on the error screen
      // (they couldn't re-request: middleware bounces them off
      // /forgot-password).
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        setEmail(session.user.email ?? null);
        markReady();
      } else {
        markInvalid();
      }
    };

    void verify();

    return () => subscription.unsubscribe();
  }, [searchParams]);

  useEffect(() => {
    if (status !== "success") return;
    const timer = setTimeout(() => {
      router.replace("/jobs");
      router.refresh();
    }, 2000);
    return () => clearTimeout(timer);
  }, [status, router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSessionLost(false);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      setError("Password must include at least one letter and one number.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    const supabase = createBrowserSupabase();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      // "Auth session missing!" from the SDK means the recovery session
      // expired between page load and submit — say so in plain words.
      const lost = updateError.message.toLowerCase().includes("session");
      setSessionLost(lost);
      setError(
        lost
          ? "Your reset session has expired. Please request a new link."
          : updateError.message
      );
      setSubmitting(false);
      return;
    }
    setStatus("success");
  };

  if (status === "verifying") {
    return (
      <div className="w-full max-w-md rounded-xl bg-neutral-900/60 ring-1 ring-white/10 p-8 text-center">
        <p className="text-sm text-neutral-400">Verifying your reset link...</p>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="w-full max-w-md rounded-xl bg-neutral-900/60 ring-1 ring-white/10 p-8 text-center">
        <h1 className="text-2xl font-semibold mb-2">Link expired</h1>
        <p className="text-sm text-neutral-400">
          This password reset link is invalid or has expired. Request a new one
          and open it in the same browser you requested it from.
        </p>
        <Link
          href="/forgot-password"
          className="mt-6 inline-block rounded-md bg-[#6366f1] hover:bg-[#5458e0] text-white text-sm font-medium px-4 py-2 transition"
        >
          Request a new link
        </Link>
        <p className="mt-4 text-sm text-neutral-400">
          <Link href="/login" className="text-[#6366f1] hover:text-[#8689f5]">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="w-full max-w-md rounded-xl bg-neutral-900/60 ring-1 ring-white/10 p-8 text-center">
        <h1 className="text-2xl font-semibold mb-2">Password updated</h1>
        <p className="text-sm text-neutral-400">
          You&apos;re signed in with your new password. Taking you to your
          jobs...
        </p>
        <Link
          href="/jobs"
          className="mt-6 inline-block text-sm text-[#6366f1] hover:text-[#8689f5]"
        >
          Continue to jobs
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-xl bg-neutral-900/60 ring-1 ring-white/10 p-8">
      <h1 className="text-2xl font-semibold mb-1">Set a new password</h1>
      <p className="text-sm text-neutral-400 mb-6">
        Choose a new password for{" "}
        {email ? <span className="text-white">{email}</span> : "your account"}.
      </p>

      {error && (
        <div className="mb-4 rounded-md bg-red-500/10 ring-1 ring-red-500/30 text-red-300 text-sm px-3 py-2">
          {error}
          {sessionLost && (
            <Link
              href="/forgot-password"
              className="mt-1 block text-[#6366f1] hover:text-[#8689f5]"
            >
              Request a new link
            </Link>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm text-neutral-300 mb-1">
            New password
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
        <div>
          <label htmlFor="confirm" className="block text-sm text-neutral-300 mb-1">
            Confirm new password
          </label>
          <input
            id="confirm"
            type="password"
            required
            autoComplete="new-password"
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-md bg-black/40 ring-1 ring-white/10 focus:ring-[#6366f1] focus:outline-none px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-[#6366f1] hover:bg-[#5458e0] disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 transition"
        >
          {submitting ? "Updating..." : "Update password"}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center px-4">
      <Suspense fallback={<div className="text-neutral-400 text-sm">Loading...</div>}>
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
