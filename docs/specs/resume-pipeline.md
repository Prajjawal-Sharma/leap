# fix: resume pipeline — primary only after parse, ownership checks, upload limits
deep: true

Commit this spec verbatim as `docs/specs/resume-pipeline.md` in the PR.

## Goal (one paragraph, user-visible outcome)
Implement PR 1 of docs/audits/2026-11-launch-audit.md ("fix/resume-pipeline"), covering findings P0-7, P1-12, P1-13 (migration half) and P2-10 — read those rows and the PR 1 section first. After this PR, uploading a new résumé never breaks a working feed: the new file becomes primary only after parse and score are saved; a slow or failed parse can be retried from the Resume page, including after a reload; a scanned PDF with no text gets a plain message before any Gemini call; one user can never make parse read another user's file; résumé storage limits live in a migration; uploads are limited to 4 MB real PDFs.

## Context verified by recon
Verify each and report TRUE / FALSE with file:line:
- upload/route.ts makes the new row primary and demotes the previous one before parsing (around lines 84–93 and 104–119).
- parse/route.ts has maxDuration 30, and gemini-client.ts retries up to five attempts with no per-attempt timeout.
- parse/route.ts downloads the row's storage_path with the service-role client without checking it sits under the caller's user-id folder; users can insert and update their own resumes rows, storage_path included (0001_initial_schema.sql).
- No migration mentions the storage bucket.
- The upload limit is 5 MB on client and server, the MIME type is trusted, and extracted text is stored uncapped and returned by /api/resume/list.
- The next free migration number.

## Owner input
Before writing the bucket migration, ask me for the output of audit "Owner checks" 3; I will paste it. Never guess the live bucket state.

## Changes
1. Promote after success: insert the new row with is_primary = false; only after parse and score are saved does it become primary and the previous primary get demoted, atomically (one SQL function or one transaction, RLS-safe; justify any service-role write on a user path in the session report). Feed, tailoring and chat keep reading the old primary until then.
2. Parse time: maxDuration 300 on the parse route; bound each Gemini attempt (60 s or less) and make the whole retry loop finish inside the limit with a margin. Do not change models, keys or prompts — PR 2 owns those.
3. Retry after reload: the Resume page shows an unparsed upload as not processed yet, with a Retry action that re-runs parse for that row, and never shows the older résumé as current while a newer upload is pending.
4. Scanned PDFs: if extracted text is shorter than a threshold you justify (about 200 characters), stop before any Gemini call and show: "We couldn't read text from this PDF — it may be a scan. Export your résumé as a text-based PDF and upload it again." Mark the row failed.
5. Cleanup: when a user uploads, delete that user's own abandoned rows (unparsed, not primary, older than 1 hour) and their storage files. No new cron.
6. Ownership: parse refuses any storage_path not under `${user.id}/`; the migration adds a CHECK constraint that storage_path starts with user_id followed by "/". Before adding it, report how many existing rows would violate it; if any do, stop and tell me instead of changing data.
7. Bucket: the same migration records the resumes bucket as private, 4 MB (4194304) limit, application/pdf only, idempotent, with no storage policies for anon or authenticated — matching check 3, or flagging any difference.
8. Upload limits: 4 MB on client and server with a clear message; reject files that don't start with "%PDF-"; cap stored extracted text at 16,000 characters; remove extracted text from the /api/resume/list response and anything that reads it there.
9. Definition of Done: change the line about who writes is_primary to match change 1, identically in CLAUDE.md and docs/SHIP_PIPELINE.md §6; update CLAUDE.md's schema and migration notes.
10. Unit tests for every new pure helper: path ownership, PDF signature, text cap, abandoned-row selection, scanned-PDF threshold.

## Do NOT touch
Gemini models, keys, prompts and routing (PR 2); chat; the job feed and match engine; auth; the app shell and theme; any UI outside the Resume page's upload and retry states.

## Acceptance (all required)
- gate.sh green with the new tests.
- Migration idempotent and additive apart from the documented constraint and cleanup.
- Session report demonstrates: a new upload while an old résumé works → the feed keeps the old one until parse finishes; a forced parse failure → reload → Retry works; a text-less PDF → the message and no Gemini call; a crafted storage_path for another user → refused by the route and by the constraint; a 4.2 MB file and a renamed .txt → refused with clear messages.

## Review artifacts required in the session report
The migration and the promote function verbatim; the ownership check; the DoD line before and after; test names; deviations with reasons.

## Migration sequencing
The human applies the migration in the Supabase SQL editor before merging, after the session confirms no existing row violates the new constraint.
