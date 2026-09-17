# Leap — Ship Pipeline

> Automated build → gate → adversarial review → PR loop for Leap, with two mandatory human stops.
> Formats verified against Claude Code docs (hooks, sub-agents, skills) on 2026-09-06.
> If Claude Code rejects a frontmatter field, ask it to check its own docs — it has a built-in lookup.

## 1. Why this exists

The loop that shipped PRs #12–#24 without a production incident was always the same: recon → tight spec → build → gates → adversarial review → PR with review artifacts → human review → merge. Every one of those PRs still had a real bug caught at review (tab-injection bypass, freshness exemption, base-branch retarget, score-route leak). This pipeline makes the checks automatic and bounded; it does not remove the human review that caught them.

**Non-negotiables (enforced by hooks, not by trust):**
- The agent never merges a PR and never pushes to `main`.
- Every PR targets `dev` explicitly.
- A `/ship` cannot "finish" while tsc / eslint / build / tests are red.
- Migrations are applied by a human, never by the agent.

## 2. Roles and where they run

| Role | Tool / account | Model | Does |
|---|---|---|---|
| PM / architect | Claude.ai Pro (this project) or Claude Desktop | Opus-class | Writes the spec from ROADMAP; reviews PR artifacts; decides merge |
| Builder + inner loop | Claude Code CLI (Max), terminal, repo root | Session default (Sonnet-class); switch to strongest available via `/model` for auth/security work | `/ship`, `/revise`, `/retro`, `/recon` |
| Adversarial reviewers | Claude Code subagents (spawned by `/ship`) | `inherit` | security-reviewer, edge-case-hunter, spec-checker, schema-reviewer |
| Independent 2nd opinion | Gemini AI Studio (Google acct 1, 1M ctx) | Gemini Pro | Reviews the full diff with the prompt in §7 before the PM review |
| Test writer (async) | Jules (Google acct 2) | auto | "Write tests for merged PR #N" → small separate PR |
| Trivial copy edits | Antigravity, Flash | Flash | One-line text changes, commit directly to dev |
| Deploy | You, Vercel + Supabase dashboards | — | Manual; never automated |

## 3. The loop (one feature, end to end)

```
PM (Claude.ai)          You                 Claude Code (/ship)             Gemini        You
write spec ───────────▶ paste /ship <spec> ─▶ Phase A: recon + PLAN ── STOP ①
                        "go" ──────────────▶ Phase B: build + gates
                                             Phase C: 3-4 reviewers, ≤2 rounds
                                             Phase D: PR → dev ───── STOP ②
                        paste diff ────────────────────────────────▶ review ─▶ findings
PM reviews PR + Gemini findings ◀───────────────────────────────────────────────┘
   "merge" ───────────▶ you merge on GitHub ─▶ /retro (lessons → CLAUDE.md)
   or notes ──────────▶ /revise <notes> ─────▶ fix → gates → re-review → push ── STOP ②
```

Inner loop = Phase B↔C (bounded). Outer loop = PR review ↔ `/revise`. Learning loop = `/retro`.

## 4. Repository layout added by Phase 0

```
.claude/
  settings.json                 # committed: permissions + hooks
  hooks/guard.sh                # PreToolUse: blocks merge/push-main/force/rm -rf
  hooks/gate.sh                 # tsc, eslint, tests, build → .claude/.gate-ok stamp
  hooks/stop-gate.sh            # Stop: refuse to finish an active /ship with red gates
  hooks/session-context.sh      # SessionStart: branch + gate status as context
  agents/security-reviewer.md
  agents/edge-case-hunter.md
  agents/spec-checker.md
  agents/schema-reviewer.md
  skills/ship/SKILL.md
  skills/revise/SKILL.md
  skills/retro/SKILL.md
  skills/recon/SKILL.md
.github/pull_request_template.md
docs/SHIP_PIPELINE.md           # this file
docs/REVIEW_CHECKLIST.md        # what the PM checks
docs/GEMINI_REVIEW_PROMPT.md    # cross-model reviewer prompt
docs/specs/_TEMPLATE.md         # spec format the PM writes
```

Add to `.gitignore`: `.claude/.ship-active`, `.claude/.gate-ok`, `.claude/workflows/`, `.claude/settings.local.json`.

---

## 5. File contents

### 5.1 `.claude/settings.json`

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run *)", "Bash(npm test*)", "Bash(npx tsc*)", "Bash(npx eslint*)",
      "Bash(git status*)", "Bash(git diff*)", "Bash(git log*)", "Bash(git branch*)",
      "Bash(git checkout*)", "Bash(git switch*)", "Bash(git add*)", "Bash(git commit*)",
      "Bash(git pull*)", "Bash(git fetch*)", "Bash(git push*)", "Bash(git stash*)",
      "Bash(gh pr create*)", "Bash(gh pr view*)", "Bash(gh pr comment*)", "Bash(gh pr edit*)",
      "Bash(.claude/hooks/gate.sh*)", "Bash(touch .claude/.ship-active)", "Bash(rm -f .claude/.ship-active)"
    ],
    "deny": [
      "Bash(gh pr merge*)",
      "Bash(git push origin main*)",
      "Bash(git push -f*)",
      "Bash(git push --force*)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "if": "Bash(git *)", "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/guard.sh", "args": [] },
          { "type": "command", "if": "Bash(gh *)",  "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/guard.sh", "args": [] },
          { "type": "command", "if": "Bash(rm *)",  "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/guard.sh", "args": [] }
        ]
      }
    ],
    "Stop": [
      { "hooks": [ { "type": "command", "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/stop-gate.sh", "args": [], "timeout": 30 } ] }
    ],
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/session-context.sh", "args": [] } ] }
    ]
  }
}
```

The `permissions.deny` entries are the hard floor (the docs say to use permissions, not hooks, for hard denies). `guard.sh` catches the variants the patterns miss (`git push origin HEAD:main`, `-u origin main`, `--delete`, etc.). Your existing `settings.local.json` (auto mode, curl/node allows) merges with this and stays local.

### 5.2 `.claude/hooks/guard.sh`

```bash
#!/bin/bash
# PreToolUse guard for git / gh / rm. Reads hook JSON on stdin, prints a deny decision or exits 0.
input=$(cat)
cmd=$(jq -r '.tool_input.command // ""' <<<"$input")

deny() {
  jq -n --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

# Merging and main are human-only.
echo "$cmd" | grep -Eq 'gh +pr +merge'                                    && deny "Merging PRs is human-only. Open the PR and stop."
echo "$cmd" | grep -Eq 'git +push[^|;&]*(\s|:)main(\s|$)'                 && deny "Pushing to main is human-only (dev→main is the deploy step)."
echo "$cmd" | grep -Eq 'git +push[^|;&]*(\s-f\b|--force)'                  && deny "Force-push is not allowed."
echo "$cmd" | grep -Eq 'git +(branch +-D|push +\S+ +--delete) +(main|dev)\b' && deny "Deleting main/dev is not allowed."
echo "$cmd" | grep -Eq 'git +reset +--hard'                               && deny "reset --hard discards work; ask the human."

# PRs must target dev explicitly (stale-base lesson from PR #19).
if echo "$cmd" | grep -Eq 'gh +pr +create'; then
  echo "$cmd" | grep -Eq -- '--base +dev\b' || deny "gh pr create must include --base dev."
fi

# rm -rf only for build caches.
if echo "$cmd" | grep -Eq 'rm +-r'; then
  echo "$cmd" | grep -Eq 'rm +-r[f]? +(\./)?(\.next|node_modules)(/|\s|$)' || deny "rm -r is limited to .next and node_modules."
fi

exit 0
```

### 5.3 `.claude/hooks/gate.sh`

```bash
#!/bin/bash
# Quality gates. Exit 0 only when all green; writes a stamp the Stop hook compares against.
set -u
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}" || exit 2
fail=0
run() { local name=$1; shift; echo "== $name"; "$@" || { echo "!! FAILED: $name"; fail=1; }; }

run "tsc"    npx tsc --noEmit
run "eslint" npx eslint src --max-warnings=0
run "tests"  npm test --silent
run "build"  npm run build

if [ "$fail" -ne 0 ]; then rm -f .claude/.gate-ok; echo "GATES RED"; exit 2; fi
stamp="$(git rev-parse HEAD):$(git diff HEAD | shasum | cut -c1-12)"
echo "$stamp" > .claude/.gate-ok
echo "GATES GREEN ($stamp)"
```

### 5.4 `.claude/hooks/stop-gate.sh`

```bash
#!/bin/bash
# Stop hook: while a /ship is active, refuse to finish if the tree changed since the last green gate.
input=$(cat)
[ "$(jq -r '.stop_hook_active // false' <<<"$input")" = "true" ] && exit 0   # never loop
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
[ -f .claude/.ship-active ] || exit 0
if [ ! -f .claude/.gate-ok ]; then
  jq -n '{decision:"block",reason:"A /ship is active but gates have never passed. Run .claude/hooks/gate.sh, fix failures, then finish."}'
  exit 0
fi
current="$(git rev-parse HEAD):$(git diff HEAD | shasum | cut -c1-12)"
[ "$current" = "$(cat .claude/.gate-ok)" ] && exit 0
jq -n '{decision:"block",reason:"Working tree changed since the last green gate. Run .claude/hooks/gate.sh, fix failures, then finish with the PR summary."}'
```

Escape hatch if a session crashes mid-ship and the marker lingers: `rm -f .claude/.ship-active`.

### 5.5 `.claude/hooks/session-context.sh`

```bash
#!/bin/bash
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
b=$(git branch --show-current 2>/dev/null)
g=$([ -f .claude/.gate-ok ] && echo "last green gate: $(cat .claude/.gate-ok)" || echo "no green gate stamp")
s=$([ -f .claude/.ship-active ] && echo "a /ship is ACTIVE" || echo "no active /ship")
echo "Leap session: branch=$b; $g; $s. Read the Definition of Done and Pitfalls in CLAUDE.md before changing code."
```

Make all four executable: `chmod +x .claude/hooks/*.sh`.

### 5.6 `.claude/agents/security-reviewer.md`

```markdown
---
name: security-reviewer
description: Adversarial security review of a branch diff for Leap (Next.js 16 + Supabase + Gemini). Use before every PR. Read-only, reports only.
tools: Read, Grep, Glob, Bash
disallowedTools: Write, Edit
model: inherit
maxTurns: 40
---
You are an adversarial security reviewer for Leap. Input: the spec and `git diff dev...HEAD`. You never fix; you report.

Hunt these classes first (all have bitten this codebase):
- Auth/session: open redirects on any `next`/`redirectTo` read (must go through `safeNext`); recovery links that swap an existing session; RLS-scoped client on every user path; service-role key never on a user path.
- Prompt injection: any user- or job-derived text entering a Gemini prompt sits inside BEGIN/END data fences with the guard line, and `===` runs are collapsed. Try to escape a fence with crafted END markers, tabs, and C0 control chars.
- Gemini JSON output sites: JSON.parse → zod `safeParse` before ANY persistence; failure → 502 `{retryable:true}` with zero writes.
- Data isolation: no `resumes` query that expects an uploaded/primary resume can return `kind='tailored'`; exactly one `is_primary=true` writer (upload promote).
- Secrets: nothing in code, logs, or PR text.
- Quota/abuse: no uncapped path on the paid `GEMINI_KEY_1`; no cap derived from rows the user can delete.

Method: for each candidate, attempt a concrete repro (input, URL, sequence). Classify CONFIRMED (repro shown), REFUTED (why safe), or UNCERTAIN (what would settle it). Severity: critical / high / medium / low.

Output: a table `| # | Severity | File:line | Finding | Status | Repro or reason |`, then a one-paragraph verdict. No fixes, no praise, no findings without a repro attempt.
```

### 5.7 `.claude/agents/edge-case-hunter.md`

```markdown
---
name: edge-case-hunter
description: Hunts boundary, concurrency, empty/huge input, timezone, pagination, retry, and error-path bugs in a branch diff. Use before every PR. Read-only.
tools: Read, Grep, Glob, Bash
disallowedTools: Write, Edit
model: inherit
maxTurns: 40
---
You hunt edge cases in `git diff dev...HEAD` against the spec. Report only; never fix.

Check, with a repro attempt for each: empty / null / whitespace inputs; oversized inputs against every cap; unicode and control characters; count-then-insert and read-then-write races; UTC day boundaries; Supabase's 1,000-row default SELECT cap on any scan; retries and idempotency (double-submit, StrictMode double-mount, serverless cold start); backward compatibility for in-flight state (old links, old rows, pre-migration DBs); what the user actually sees on every error path (no raw SDK/JWT text, no dead-end screens with no CTA); UI at 375px if any UI changed.

Classify CONFIRMED / REFUTED / UNCERTAIN with severity. Output the same table format as security-reviewer, then a verdict.
```

### 5.8 `.claude/agents/spec-checker.md`

```markdown
---
name: spec-checker
description: Checks a branch diff against the task spec and CLAUDE.md Definition of Done, requirement by requirement. Use before every PR. Read-only.
tools: Read, Grep, Glob, Bash
disallowedTools: Write, Edit
model: inherit
maxTurns: 30
---
Compare `git diff dev...HEAD` to (1) the spec and (2) the Definition of Done in CLAUDE.md.

Output three tables:
1. Spec requirements: `| Requirement | Met / Partial / Missing | Evidence (file:line) |`
2. Definition of Done: `| Item | Pass / Fail | Evidence |`
3. Deviations from spec: `| Deviation | Declared in PR? | Justified? |`

Then list every acceptance item that needs a human (manual tests, migrations to apply, dashboard steps, env vars). Do not fix anything.
```

### 5.9 `.claude/agents/schema-reviewer.md`

```markdown
---
name: schema-reviewer
description: Reviews zod schemas and prompts for Gemini JSON output sites — calibration, composition, refine predicates, and the 502 path. Use whenever a schema in src/lib/ai/schemas.ts or a Gemini prompt changes. Read-only.
tools: Read, Grep, Glob, Bash
disallowedTools: Write, Edit
model: inherit
maxTurns: 30
---
Leap's most repeated bug class is a Gemini output schema that is miscalibrated. For every changed or new schema:
- Composition: does it compose existing schemas (ParsedResumeSchema, ResumeScoreAnalysisSchema) rather than redefining fields?
- Caps: is each string/array cap justified by observed output from THIS prompt (not borrowed from another prompt)? Cite evidence; flag any cap with none.
- Refines: does any predicate reject legitimately sparse but real data (fresher CV, one job, no summary)? Does any `.default()` launder a blank payload into a success?
- Boundary: `safeParse` runs before any persistence; failure returns 502 `{retryable:true}` and writes nothing.
- If `npm test` covers schemas, run it and report.

Output: per-schema findings table (CONFIRMED / REFUTED / UNCERTAIN, severity) and a verdict. Never fix.
```

### 5.10 `.claude/skills/ship/SKILL.md`

```markdown
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
```

### 5.11 `.claude/skills/revise/SKILL.md`

```markdown
---
name: revise
description: Apply PR review feedback on the current feature branch — fix, re-gate, re-review the affected areas, push, and comment on the PR. Use after the PM or Gemini review.
argument-hint: "<review notes>"
disable-model-invocation: true
---
Review notes to apply:

$ARGUMENTS

1. Confirm you are on a non-dev, non-main branch with an open PR (`gh pr view`). If not, stop.
2. `touch .claude/.ship-active`. Apply the changes. For any note you decline, record the reason.
3. Run `.claude/hooks/gate.sh` until GREEN.
4. Re-run only the reviewers relevant to what changed (security-reviewer for auth/prompt/RLS changes; schema-reviewer for schemas; edge-case-hunter otherwise). Fix CONFIRMED findings; re-gate.
5. `git push`. `gh pr comment` with a "Revision N" section: what changed, what was declined and why, gates output summary.
6. `rm -f .claude/.ship-active`. STOP. Do not merge.
```

### 5.12 `.claude/skills/retro/SKILL.md`

```markdown
---
name: retro
description: After a PR is merged, fold its durable lessons into CLAUDE.md Pitfalls, update ROADMAP status, and delete the merged branch. Use right after every merge.
argument-hint: "<PR number>"
disable-model-invocation: true
---
Retro for PR #$ARGUMENTS.

1. `git checkout dev && git pull`. `gh pr view $ARGUMENTS` — read the body, the review tables, and the comments.
2. Extract at most 3 lessons that are durable and generalizable (a class of bug, a verification technique, a doc-vs-code drift). Not a changelog.
3. Append them to the Pitfalls section of CLAUDE.md in the existing one-line style. Update the feature's status in ROADMAP.md.
4. Delete the merged branch locally and on origin (never dev or main).
5. Commit directly to dev: `docs: retro PR #$ARGUMENTS`. Push. Print the doc diff. STOP.
```

### 5.13 `.claude/skills/recon/SKILL.md`

```markdown
---
name: recon
description: Read-only investigation of the codebase, schema, or config to answer a question with file:line evidence. Never edits anything.
argument-hint: "<question>"
disable-model-invocation: true
---
Investigate, read-only: $ARGUMENTS

Rules: do not create, edit, or delete anything; do not create branches. Verify claims against code and `supabase/migrations`, not against docs. Where only a live DB or dashboard can answer, give the exact SQL or the dashboard path for the human to run.

Report facts with file:line references, mark each claim TRUE / FALSE / UNVERIFIABLE, and end with the line "Built nothing."
```

### 5.14 `.github/pull_request_template.md`

```markdown
## Summary / why

## Changes
- files:

## Migrations
- Number:            Idempotent: yes/no
- Apply BEFORE or AFTER deploy, and why:

## Review artifacts (mandatory)
### Schemas / guards (verbatim)
### Query audit
| Query | Verdict | Why safe |
|---|---|---|
### Acceptance evidence
| Criterion | Proof |
|---|---|

## Adversarial review
| # | Reviewer | Severity | Finding | Status (fixed / deferred / refuted) |
|---|---|---|---|---|

## Deliberate deviations from spec

## Deferred (with reason)

## Human must do
- [ ] manual tests:
- [ ] migration to apply:
- [ ] dashboard / env steps:

## Untouched (verified by diff)
```

### 5.15 `docs/specs/_TEMPLATE.md` (what the PM writes)

```markdown
# <type>: <title>
deep: false            # true → extra security pass

## Goal (one paragraph, user-visible outcome)

## Context verified by recon
- claims that are TRUE, with file:line
- claims that were FALSE in docs, corrected here

## Changes
1.
2.

## Do NOT touch

## Acceptance (all required)
- gates green (tsc, eslint 0 warnings, tests, build)
- ...

## Review artifacts required in the PR

## Migration sequencing (if any)
```

### 5.16 `docs/REVIEW_CHECKLIST.md` (what the PM checks — bring these to the review)

1. Base branch is `dev`. No stale stacked base.
2. Every schema/guard/security predicate pasted verbatim — read it, don't trust the summary.
3. Every query audit lists the actual query, not a description.
4. For Gemini JSON sites: caps justified by observed output from that prompt; refine accepts sparse-real data.
5. Ordering guarantees stated for anything that bills or persists (gate before insert before model call).
6. Migration is numbered, idempotent, and the PR says whether it goes before or after deploy.
7. Adversarial table: every CONFIRMED item is fixed or explicitly deferred with a reason.
8. "Human must do" list is complete — manual tests, dashboard steps, env vars.
9. Deviations from spec are declared and justified.
10. Nothing new in `package.json` without a stated reason.

### 5.17 `docs/GEMINI_REVIEW_PROMPT.md` (paste into AI Studio with the spec and `git diff dev...HEAD`)

```
You are an independent adversarial reviewer for a Next.js 16 + Supabase + Gemini codebase. Below are a task spec and a full diff. Find real defects only: security (auth, redirects, RLS, prompt injection, secrets), correctness (races, boundaries, error paths), and spec compliance. For each finding give file:line, a concrete repro or input, severity, and a one-line fix direction. Do not restate what the diff does. Do not report style. If you find nothing confirmed, say so plainly. Output a single table.
```

Paste Gemini's CONFIRMED findings into `/revise` only after judging them yourself — it will also produce false positives.

---

## 6. CLAUDE.md — sections to add or replace in Phase 0

Correct these facts first (verified by the July recon, all currently wrong or stale in CLAUDE.md):
- Framework: **Next.js 16 / React 19** App Router (not 15). Turbopack. `middleware.ts` is deprecated in favor of `proxy.ts` — rename is its own PR.
- Styling: **Tailwind v4**, CSS-based theme in `globals.css` via `@theme inline`; no `tailwind.config`. **shadcn/ui, Framer Motion, lucide are NOT installed** — all components are hand-rolled Tailwind under `src/components/features/`. Do not add them without a spec that says so.
- Brand tokens: bg `#0a0a0a`; surfaces `bg-neutral-900/60 ring-1 ring-white/10`; primary `#6366f1` (hover `#5458e0`); text white/neutral-300/neutral-400. Body renders in Arial by accident; new surfaces use `font-sans` (Geist).
- Positioning: value-led AI job platform — "matched by meaning, not keywords." India-first is distribution, not copy. No employer names, no competitor names, no "service to product" narrative (also remove it from `src/lib/ai/chat-context.ts`).
- Working directory: `~/Prajjawal/Claude/leap`. Production: `leap-five-delta.vercel.app`. Vercel Hobby: 2 crons max, both used.

### Definition of Done (every PR)
- `tsc --noEmit`, `eslint src --max-warnings=0`, `npm test`, `npm run build` all green (`.claude/hooks/gate.sh`).
- Every Gemini JSON output site: `JSON.parse → schema.safeParse` before any persistence; failure → 502 `{retryable:true}`, zero writes; schema composes existing ones; caps justified by that prompt's observed output.
- Every user- or job-derived string entering a prompt is fenced (BEGIN/END + guard line) with `===` runs collapsed.
- Every `resumes` read that expects a primary/uploaded resume filters `kind='uploaded'`; only the upload promote step writes `is_primary=true`.
- Migrations: next number, idempotent (`if not exists` / `drop ... if exists`), additive-first, applied by a human; PR states before/after-deploy.
- No new dependency without a spec-approved reason.
- PR body follows the template; review artifacts are verbatim.
- Never merge. Never push main. Always `gh pr create --base dev`.

### Model & key routing
- `GEMINI_KEY_1` (paid Tier 1): embeddings + chat (`streamGemini`, `CHAT_MODEL` pinned).
- `GEMINI_KEY_2..8` (free rotation, 20 req/day/key): parse+score (one call), tailor. `DEFAULT_MODEL`/`TAILOR_MODEL` = `gemini-3.5-flash`. Rotate past per-key 404s; probe entitlement with `generateContent`, not ListModels.
- Availability pings are dev-only (`GEMINI_AVAILABILITY_CHECK=1`); they burn quota per cold start in prod.

### Pitfalls (append via /retro; keep one line each)
1. Supabase JS caps SELECT at 1,000 rows by default — paginate with stable ordering.
2. Multiple `is_primary=true` rows broke `maybeSingle` — unset-then-set; tailored rows are `kind='tailored'`, never primary.
3. Zod caps borrowed from another prompt 502'd real output (`keywords_missing` 115 chars vs 100) — calibrate per prompt; refines must accept sparse-real data.
4. Prompt fences can be escaped by a forged END marker or a tab between slashes — collapse `===` runs; reject C0/DEL in redirect targets.
5. "Model not available to new users" 404s vary per key/project — rotate past them; entitlement only shows at `generateContent`.
6. Free tier is 20 req/day/key; a proactive availability ping per cold start ate ~5% of the pool — dev-only.
7. A daily cap counted from rows the user can delete resets on Clear chat — use a counter table or soft-delete.
8. Stacked PRs don't retarget when the base branch merges — always `--base dev`; delete merged branches.
9. `NEXT_PUBLIC_*` is baked at build time — set per environment before the deploy build, not after.
10. PKCE recovery links are same-browser only — use `token_hash`/`verifyOtp`; email templates live only in the Supabase dashboard.
11. Adding a route to `AUTH_ROUTES` bounces authenticated users — a recovery session is authenticated; leave reset out of both lists.
12. ROADMAP/CLAUDE.md drift (shadcn, Next 15, `onboarded_at`) — verify docs against code before building; `/retro` keeps docs true.
13. A freshness sweep must exempt companies whose fetch failed and skip entirely if zero boards returned — otherwise it mass-deactivates.
14. Don't re-run stale verifier agents on already-fixed code; run one fresh adversarial pass on the final diff.
15. `git` in the wrong clone/terminal looks like lost work — one repo, one path, check `pwd` first.

---

## 7. Cost and quota rules

- Max is shared with two others: `/ship` caps review at 2 rounds and 4 reviewers; reviewers use `maxTurns`. Reserve `deep: true` for auth/security/data-integrity PRs.
- Run `/clear` before every `/ship`; stale context degrades both quality and budget.
- Gemini free keys: ~140 req/day total across the pool; never run the acceptance harness against production keys during launch week.

## 8. Escalation / rollback

- Gates stuck red after 3 attempts → the skill stops and reports; bring the output to the PM.
- Marker lingering after a crash → `rm -f .claude/.ship-active`.
- A hook misfires or blocks something legitimate → `/hooks` to inspect; temporarily `--settings '{"disableAllHooks": true}'` for one run, then fix the guard.
- Bad merge on dev → `git revert <merge-sha> -m 1` on a `fix/revert-*` branch, normal PR.

## 9. Phase 0 — bootstrap prompt (run in Claude Code, on dev, after `/clear`)

```
Read docs/SHIP_PIPELINE.md fully. Create branch chore/ship-pipeline off dev.
Implement §4, §5 and §6 exactly:
- create every file under .claude/ and .github/ and docs/ listed in §4 with the contents in §5, byte-for-byte except where a frontmatter field is rejected by your version — in that case check your own docs and use the current equivalent, and tell me what you changed;
- chmod +x .claude/hooks/*.sh; run `bash -n` on each script; confirm `jq` and `gh` are on PATH;
- add the .gitignore entries from §4;
- apply the §6 changes to CLAUDE.md: correct the stale facts, add Definition of Done, Model & key routing, and the seeded Pitfalls list; keep any existing content that is still true; remove service-to-product framing from CLAUDE.md, ROADMAP.md and src/lib/ai/chat-context.ts;
- run .claude/hooks/gate.sh on the branch and confirm GATES GREEN;
- run /hooks and confirm the three hook events are registered;
- open a PR with `gh pr create --base dev` using the template, listing every file created and the CLAUDE.md diff summary.
Do not run /ship yet. Stop after the PR is open.
```

## 10. Phase 1 onward — first workload through `/ship`

Order (one `/ship` each; PM writes the spec from ROADMAP + this backlog):
1. `fix/error-boundaries` (#11) — every page and the dashboard layout.
2. `fix/reauth-on-password-change` — Supabase secure-password-change + `reauthenticate()` flow.
3. `fix/quota-proof-chat-count` — counter table migration; Clear chat no longer resets the cap.
4. `fix/reset-drive-by` — confirm step before `verifyOtp` when a session already exists.
5. `fix/oauth-chain` (#13) and `fix/parse-timeout` (#23).
6. `chore/middleware-to-proxy`.
7. Week 4: `feat/onboarding` (needs `onboarded_at` migration first), `feat/insights`, `feat/digest` (needs a 3rd cron → Hobby limit decision), `feat/mobile-pass`, `feat/tailored-pdf-export`, `feat/india-remote-filter`.

Manual, outside the pipeline: the dev→main deploy, Supabase URL config and custom SMTP, Vercel env vars, the cross-device reset test.

## 11. A normal day

1. Claude.ai: "next up is error boundaries" → I return a spec in the §5.15 format.
2. Terminal: `/clear`, then `/ship <paste spec>` → plan → "go" → PR URL.
3. AI Studio: paste spec + `git diff dev...HEAD` with the §5.17 prompt → findings.
4. Claude.ai: paste PR body (or I read it via the GitHub connector) + Gemini findings → I review against §5.16 → "merge" or notes.
5. Notes → `/revise <notes>` → repeat 4. Merge → `/retro <PR#>`.
6. Jules (acct 2): "write tests for PR #N on dev" → small PR through the same review.
