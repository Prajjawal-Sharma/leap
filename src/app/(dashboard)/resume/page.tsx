"use client";

import { useEffect, useRef, useState } from "react";

type AtsBreakdown = {
  heuristic?: {
    score?: number;
    signals?: Record<string, boolean | number>;
  };
  gemini_analysis?: {
    score?: number;
    strengths?: string[];
    improvements?: string[];
    keywords_missing?: string[];
    verdict?: string;
  };
};

type Resume = {
  id: string;
  file_name: string;
  file_size_bytes: number | null;
  storage_path: string;
  is_primary: boolean;
  ats_score: number | null;
  ats_breakdown: AtsBreakdown | null;
  parsed_content: Record<string, unknown> | null;
  created_at: string;
};

type Phase =
  | "idle"
  | "loading-list"
  | "uploading"
  | "parsing"
  | "scoring"
  | "ready"
  | "error";

type Step = "upload" | "parse" | "score";

type StepStatus = "pending" | "active" | "done" | "failed";

// "Analyze" covers the combined parse+score Gemini call; the final step is
// just the results refresh — its labels must not claim AI work is happening,
// or a refresh hiccup reads as "scoring failed" and tempts a re-upload that
// burns another Gemini request (20/day/key free tier).
const STEPS: { key: Step; label: string; activeLabel: string; doneLabel: string }[] = [
  { key: "upload", label: "Upload", activeLabel: "Uploading…", doneLabel: "Uploaded" },
  { key: "parse", label: "Analyze", activeLabel: "Parsing & scoring with AI…", doneLabel: "Analyzed" },
  { key: "score", label: "Finish", activeLabel: "Loading results…", doneLabel: "Done" },
];

const STEP_INDEX: Record<Step, number> = { upload: 1, parse: 2, score: 3 };

const phaseOrder = (p: Phase): number => {
  switch (p) {
    case "uploading":
      return 1;
    case "parsing":
      return 2;
    case "scoring":
      return 3;
    case "ready":
      return 4;
    default:
      return 0;
  }
};

const MAX_BYTES = 5 * 1024 * 1024;

const scoreColor = (score: number) => {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#eab308";
  if (score >= 40) return "#f97316";
  return "#ef4444";
};

function ScoreRing({ score }: { score: number }) {
  const safe = Math.max(0, Math.min(100, score));
  const color = scoreColor(safe);
  return (
    <div
      className="relative flex items-center justify-center rounded-full"
      style={{
        width: 180,
        height: 180,
        background: `conic-gradient(${color} ${safe * 3.6}deg, rgba(255,255,255,0.08) 0deg)`,
      }}
      role="img"
      aria-label={`ATS score ${safe} out of 100`}
    >
      <div className="absolute inset-2 rounded-full bg-[#0a0a0a] flex flex-col items-center justify-center">
        <span
          className="text-5xl font-bold tabular-nums"
          style={{ color }}
        >
          {safe}
        </span>
        <span className="text-xs uppercase tracking-wider text-neutral-500 mt-1">
          ATS Score
        </span>
      </div>
    </div>
  );
}

export default function ResumePage() {
  const [phase, setPhase] = useState<Phase>("loading-list");
  const [error, setError] = useState<string | null>(null);
  const [failedStep, setFailedStep] = useState<Step | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [lastResumeId, setLastResumeId] = useState<string | null>(null);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [activeResume, setActiveResume] = useState<Resume | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scoreCardRef = useRef<HTMLDivElement>(null);

  // Smoothly bring the score card into view once a fresh upload finishes.
  useEffect(() => {
    if (phase === "ready" && scoreCardRef.current) {
      scoreCardRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [phase]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/resume/list", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load resumes");
        const data = (await res.json()) as { resumes: Resume[] };
        if (cancelled) return;
        setResumes(data.resumes);
        // A resume is "successful" only when both parse + score finished.
        // The /api/resume/list response is already ordered by created_at desc
        // so picking successful[0] when no primary is flagged gives us the
        // most recent successful upload — robust against the historical bug
        // where multiple resumes carried is_primary = true at once.
        const successful = data.resumes.filter(
          (r) => r.parsed_content !== null && r.ats_score !== null
        );
        const display =
          successful.find((r) => r.is_primary) ?? successful[0] ?? null;
        if (display) {
          setActiveResume(display);
          setPhase("ready");
        } else {
          setActiveResume(null);
          setPhase("idle");
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load");
        setPhase("error");
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const reset = () => {
    setError(null);
    setFailedStep(null);
    setRetryable(false);
    setLastResumeId(null);
    setActiveResume(null);
    setPhase("idle");
  };

  // Run the combined parse+score phase and the final list refresh, starting
  // from the given step. /api/resume/parse now does BOTH parse and ATS
  // scoring in one Gemini call (free tier is 20 requests/day/key, so the old
  // second /score call per upload was 50% waste); the "score" step is now
  // just the list refresh, and Retry-from-score retries only that refresh.
  const runFromStep = async (resumeId: string, fromStep: "parse" | "score") => {
    if (fromStep === "parse") {
      setPhase("parsing");
      try {
        const parseRes = await fetch("/api/resume/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resume_id: resumeId }),
        });
        const parseJson = await parseRes.json();
        if (!parseRes.ok) {
          setError(`Parse failed: ${parseJson.error ?? "Unknown error"}`);
          setRetryable(Boolean(parseJson.retryable));
          setFailedStep("parse");
          setPhase("error");
          return;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setError(`Parse failed: ${msg}`);
        setRetryable(true);
        setFailedStep("parse");
        setPhase("error");
        return;
      }
    }

    setPhase("scoring");
    try {
      const refreshed = await fetch("/api/resume/list", { cache: "no-store" });
      if (!refreshed.ok) throw new Error("Failed to refresh resume list");
      const data = (await refreshed.json()) as { resumes: Resume[] };
      setResumes(data.resumes);
      const updated = data.resumes.find((r) => r.id === resumeId) ?? null;
      setActiveResume(updated);
      setPhase("ready");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      // The combined call already persisted the parse AND the score — only
      // the results refresh failed. Say so, or the user re-uploads and burns
      // another Gemini request for nothing.
      setError(`Refresh failed: ${msg}`);
      setRetryable(true);
      setFailedStep("score");
      setPhase("error");
    }
  };

  const handleFile = async (file: File) => {
    setError(null);
    setFailedStep(null);
    setRetryable(false);

    if (file.type !== "application/pdf") {
      setError("Upload failed: Only PDF files are supported.");
      setFailedStep("upload");
      setPhase("error");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Upload failed: File exceeds the 5MB limit.");
      setFailedStep("upload");
      setPhase("error");
      return;
    }

    setPhase("uploading");
    let resumeId: string;
    try {
      const formData = new FormData();
      formData.append("resume", file);
      const uploadRes = await fetch("/api/resume/upload", {
        method: "POST",
        body: formData,
      });
      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok) {
        throw new Error(uploadJson.error ?? "Upload failed");
      }
      resumeId = uploadJson.id as string;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(`Upload failed: ${msg}`);
      setFailedStep("upload");
      setPhase("error");
      return;
    }

    setLastResumeId(resumeId);
    await runFromStep(resumeId, "parse");
  };

  const onRetry = () => {
    if (!lastResumeId) return;
    if (failedStep !== "parse" && failedStep !== "score") return;
    setError(null);
    setRetryable(false);
    const fromStep = failedStep;
    setFailedStep(null);
    void runFromStep(lastResumeId, fromStep);
  };

  const stepStatus = (step: Step): StepStatus => {
    if (failedStep === step) return "failed";
    if (failedStep && STEP_INDEX[failedStep] < STEP_INDEX[step]) return "pending";
    if (phaseOrder(phase) > STEP_INDEX[step]) return "done";
    if (phaseOrder(phase) === STEP_INDEX[step]) return "active";
    return "pending";
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = "";
  };

  const isWorking =
    phase === "uploading" || phase === "parsing" || phase === "scoring";

  const phaseLabel =
    phase === "uploading"
      ? "Uploading…"
      : phase === "parsing"
        ? "Parsing & scoring with AI…"
        : phase === "scoring"
          ? "Loading results…"
          : "";

  const showDropzone = phase === "idle" || phase === "error" || isWorking;
  const showStatusBanner =
    isWorking || phase === "ready" || phase === "error";
  const breakdown = activeResume?.ats_breakdown ?? null;
  const strengths = breakdown?.gemini_analysis?.strengths ?? [];
  const improvements = breakdown?.gemini_analysis?.improvements ?? [];
  const keywordsMissing = breakdown?.gemini_analysis?.keywords_missing ?? [];
  const verdict = breakdown?.gemini_analysis?.verdict ?? "";

  return (
    <section className="max-w-4xl">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">Resume</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Upload a PDF and we&apos;ll parse it and score it for ATS compatibility.
          </p>
        </div>
        {phase === "ready" && activeResume && (
          <button
            type="button"
            onClick={reset}
            className="text-sm rounded-md px-3 py-1.5 bg-white/5 hover:bg-white/10 text-neutral-200"
          >
            Re-upload
          </button>
        )}
      </div>

      {phase === "loading-list" && (
        <div className="mt-8 text-sm text-neutral-400">Loading...</div>
      )}

      {showStatusBanner && (
        <div
          role="status"
          aria-live="polite"
          className={[
            "mt-6 rounded-xl px-5 py-4 ring-1",
            phase === "ready"
              ? "bg-green-500/10 ring-green-500/30"
              : phase === "error"
                ? "bg-red-500/10 ring-red-500/30"
                : "bg-[#6366f1]/10 ring-[#6366f1]/30",
          ].join(" ")}
        >
          <div className="flex items-center gap-3">
            {phase === "ready" ? (
              <span
                aria-hidden="true"
                className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-white text-sm font-bold"
              >
                ✓
              </span>
            ) : phase === "error" ? (
              <span
                aria-hidden="true"
                className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white text-sm font-bold"
              >
                !
              </span>
            ) : (
              <span
                aria-hidden="true"
                className="h-6 w-6 rounded-full border-2 border-white/20 border-t-[#6366f1] animate-spin"
              />
            )}
            <p className="flex-1 text-sm font-medium text-neutral-100">
              {phase === "ready"
                ? "Resume uploaded successfully"
                : phase === "error"
                  ? error ?? "Something went wrong"
                  : phaseLabel}
            </p>
            {phase === "error" &&
              retryable &&
              lastResumeId &&
              (failedStep === "parse" || failedStep === "score") && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="shrink-0 rounded-md bg-red-500/20 hover:bg-red-500/30 ring-1 ring-red-500/40 px-3 py-1.5 text-xs font-medium text-red-100"
                >
                  {failedStep === "score" ? "Retry refresh" : "Retry analysis"}
                </button>
              )}
          </div>

          <ol className="mt-4 grid grid-cols-3 gap-2">
            {STEPS.map((step) => {
              const status = stepStatus(step.key);
              const label =
                status === "active"
                  ? step.activeLabel
                  : status === "done"
                    ? step.doneLabel
                    : status === "failed"
                      ? `${step.label} failed`
                      : step.label;
              const dot =
                status === "done" ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-[10px] font-bold text-white">
                    ✓
                  </span>
                ) : status === "active" ? (
                  <span className="h-5 w-5 rounded-full border-2 border-white/20 border-t-[#6366f1] animate-spin" />
                ) : status === "failed" ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                    ×
                  </span>
                ) : (
                  <span className="h-5 w-5 rounded-full border border-white/15 bg-white/5" />
                );
              const textClass =
                status === "done"
                  ? "text-green-300"
                  : status === "active"
                    ? "text-neutral-100"
                    : status === "failed"
                      ? "text-red-300"
                      : "text-neutral-500";
              return (
                <li
                  key={step.key}
                  className="flex items-center gap-2 rounded-md bg-black/20 px-3 py-2 ring-1 ring-white/5"
                >
                  {dot}
                  <span className={`text-xs ${textClass}`}>{label}</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {showDropzone && (
        <div className="mt-6">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!isWorking) setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={isWorking ? undefined : onDrop}
            onClick={() => !isWorking && inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !isWorking) {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            className={[
              "rounded-xl border-2 border-dashed px-6 py-14 text-center transition cursor-pointer",
              dragOver
                ? "border-[#6366f1] bg-[#6366f1]/5"
                : "border-white/15 bg-black/20 hover:border-white/25",
              isWorking ? "opacity-70 cursor-not-allowed" : "",
            ].join(" ")}
          >
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              hidden
              onChange={onSelect}
              disabled={isWorking}
            />
            {isWorking ? (
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-[#6366f1] animate-spin" />
                <p className="text-sm text-neutral-300">{phaseLabel}</p>
              </div>
            ) : (
              <>
                <p className="text-base font-medium text-neutral-100">
                  Drop your PDF here or click to upload
                </p>
                <p className="mt-2 text-xs text-neutral-500">
                  PDF only · 5MB max
                </p>
              </>
            )}
          </div>

        </div>
      )}

      {phase === "ready" && activeResume && (
        <div ref={scoreCardRef} className="mt-8 space-y-8 scroll-mt-6">
          <div className="rounded-xl bg-neutral-900/60 ring-1 ring-white/10 p-6 flex flex-col md:flex-row md:items-center gap-6">
            <ScoreRing score={activeResume.ats_score ?? 0} />
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-wider text-neutral-500">
                Current resume
              </p>
              <p className="mt-1 text-lg font-medium truncate">
                {activeResume.file_name}
              </p>
              {verdict && (
                <p className="mt-3 text-sm text-neutral-300 leading-relaxed">
                  {verdict}
                </p>
              )}
              {breakdown && (
                <div className="mt-4 flex gap-4 text-xs text-neutral-400">
                  <span>
                    Heuristic:{" "}
                    <span className="text-neutral-200">
                      {breakdown.heuristic?.score ?? 0}
                    </span>
                  </span>
                  <span>
                    AI:{" "}
                    <span className="text-neutral-200">
                      {breakdown.gemini_analysis?.score ?? 0}
                    </span>
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="rounded-xl bg-neutral-900/60 ring-1 ring-white/10 p-5">
              <h2 className="text-sm font-semibold text-neutral-200 mb-3">
                Strengths
              </h2>
              {strengths.length === 0 ? (
                <p className="text-sm text-neutral-500">None reported.</p>
              ) : (
                <ul className="space-y-2 text-sm text-neutral-300">
                  {strengths.map((s, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-green-400 mt-0.5">●</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl bg-neutral-900/60 ring-1 ring-white/10 p-5">
              <h2 className="text-sm font-semibold text-neutral-200 mb-3">
                Improvements
              </h2>
              {improvements.length === 0 ? (
                <p className="text-sm text-neutral-500">None reported.</p>
              ) : (
                <ul className="space-y-2 text-sm text-neutral-300">
                  {improvements.map((s, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-orange-400 mt-0.5">●</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {keywordsMissing.length > 0 && (
            <div className="rounded-xl bg-neutral-900/60 ring-1 ring-white/10 p-5">
              <h2 className="text-sm font-semibold text-neutral-200 mb-3">
                Missing keywords
              </h2>
              <div className="flex flex-wrap gap-2">
                {keywordsMissing.map((kw, i) => (
                  <span
                    key={i}
                    className="text-xs rounded-md px-2 py-1 bg-white/5 ring-1 ring-white/10 text-neutral-300"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {resumes.length > 1 && (
            <div className="rounded-xl bg-neutral-900/40 ring-1 ring-white/10 p-5">
              <h2 className="text-sm font-semibold text-neutral-200 mb-3">
                Past uploads
              </h2>
              <ul className="space-y-2">
                {resumes
                  .filter((r) => r.id !== activeResume.id)
                  .map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <button
                        type="button"
                        onClick={() => setActiveResume(r)}
                        className="text-left text-neutral-300 hover:text-white truncate"
                      >
                        {r.file_name}
                      </button>
                      <span className="text-neutral-500 text-xs ml-3 shrink-0">
                        {r.ats_score ?? "—"}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
