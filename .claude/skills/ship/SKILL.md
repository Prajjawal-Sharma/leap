---
name: ship
description: Leap feature pipeline — recon → plan (stop) → build → gates → adversarial review → PR to dev (stop). Use for any feature, fix, or hardening task.
argument-hint: "<path to docs/specs/*.md, or the spec inline>"
disable-model-invocation: true
---
You are running Leap's ship pipeline for this spec:

$ARGUMENTS

Rules that override everything: never merge; never push main; every PR targets dev with `--base dev`; a human applies migrations; stop at the two gates below.

## Phase A — Preflight and recon (READ-ONLY, no edits, no branch yet)
1. `git status` must be clean and on `dev`; then `git pull`. If not clean, stop and report.
2. Read CLAUDE.md (Definition of Done, Pitfalls, Model & key routing), ROADMAP.md, and the spec (read the file if a path was given).
3. Verify every factual claim in the spec and docs against the actual code and `supabase/migrations`. Report each as TRUE / FALSE / UNVERIFIABLE (needs a live DB query from the human, with the SQL to run).
4. Write the PLAN in your reply: files to touch, new files, migration needed (number = next after the latest in supabase/migrations, idempotent), model/key routing, risks, open questions, and a mapping from each acceptance criterion to how you will prove it.
5. **STOP. Print the plan and wait for the human to reply "go" (with edits if any).** Do not create `.claude/.ship-active` yet.

## Phase B — Build (only after "go")
6. `touch .claude/.ship-active`. `git checkout -b <type>/<slug>` where type is feat, fix, or chore.
7. Implement per the plan in small commits. Follow CLAUDE.md conventions. No new dependencies unless the plan approved them.
8. Run `.claude/hooks/gate.sh`. Fix until GREEN. After 3 failed attempts: `rm -f .claude/.ship-active`, stop, report honestly.

## Phase C — Adversarial review (max 2 rounds)
9. Spawn in parallel on `git diff dev...HEAD` plus the spec: `spec-checker`, `security-reviewer`, `edge-case-hunter`, and `schema-reviewer` if any zod schema, Gemini prompt, or JSON output site changed. If the spec header says `deep: true`, run a second independent pass of security-reviewer on the final diff.
10. Fix every CONFIRMED finding. Note UNCERTAIN and REFUTED without acting. Re-run `gate.sh`. If a CONFIRMED critical/high remains after round 2, stop and report.

## Phase D — PR, then STOP
11. Fill `.github/pull_request_template.md` completely. Review artifacts are mandatory: verbatim schemas and guards, query audit tables, acceptance evidence, the reviewers' tables (found / fixed / deferred), deliberate deviations with reasons, migration sequencing, and a "Human must do" list.
12. `git push -u origin <branch>` then `gh pr create --base dev --title "<type>: <summary>" --body-file <tmpfile>`.
13. `rm -f .claude/.ship-active`. Print the PR URL and the "Human must do" list. **STOP. Do not merge.**

If you must pause for a human decision during B or C: `rm -f .claude/.ship-active`, ask, and `touch` it again when resuming.
