# fix: Gemini output schema hardening (score, tailor)
deep: false            # no auth, RLS, key routing or spend-guard change

Commit this spec verbatim as `docs/specs/gemini-schema-hardening.md` in the PR.

## Goal (one paragraph, user-visible outcome)

A Gemini reply that is not a real analysis or a faithful tailored resume must
take the 502 `{retryable:true}` path and write nothing, instead of being saved
as success. Today a refusal object or `{}` parses as an ATS analysis with score
0 (halving the user's stored score on upload), and a tailor reply that drops the
email, phone or an education entry is saved as the tailored resume. Tailoring a
resume with nothing to rewrite stops spending free-tier calls on a request that
cannot succeed. These findings came from the schema-reviewer pass on the zod
4.6.x bump (#32) and were left out of it on purpose.

## Context verified by recon (on `dev` @ 77954f6)
- F1 TRUE: `src/lib/ai/schemas.ts:82` `score: z.number().finite().default(0)`
  and every list defaults, so `{}`, `{"error":"I cannot help"}` and
  `{resume: real, ats_analysis: {}}` all parse with score 0 (reproduced).
  `/api/resume/score` writes at `score/route.ts:149`; the live path is the
  upload, `parse/route.ts:176`. No UI calls `/api/resume/score` today.
- F2 TRUE: `schemas.ts:151` — every `ParsedResume` field defaults, so a reply
  with only summary and experience parses with blank contact fields and
  `education: []` (reproduced). The tailor prompt requires contact fields copied
  EXACTLY (`tailor/route.ts:59`) and education, certifications and languages
  kept factually identical (`:64`); "rewrite each experience description"
  (`:61`) keeps every role. The uploaded original is untouched; the loss is in
  the tailored copy, the one ROADMAP #8 will export as PDF.
- F3 TRUE: the parse refine (`schemas.ts:119`) accepts a CV with only contact,
  education and certifications; the tailor refine (`:151`) rejects the same
  resume echoed back (reproduced). The route calls Gemini (`:214`) with no
  pre-check, so every retry spends a free-tier call (20/day/key).
- F4 TRUE but out of scope: only `MAX_KEYWORD_LEN` cites observed output
  (`d622280`, SCORE_PROMPT). Capturing output needs live keys → follow-up
  `chore/calibrate-gemini-caps`.
- F5 TRUE: `parse/route.ts:158`, `score/route.ts:137`, `tailor/route.ts:243`
  return 502 `retryable:false` on a non-Gemini error, which in practice is only
  a `JSON.parse` SyntaxError. Unreachable today: `callGemini`
  (`gemini-client.ts:537`) parses with identical fence stripping first and
  throws `GeminiError(502, retryable:true)`.
- `src/lib/ai/schemas.test.ts` is on `dev` (#32) with fixtures and
  `assertSingleIssue`.

## Changes
1. `src/lib/ai/schemas.ts`
   - F1: drop `.default(0)` from `ResumeScoreAnalysisSchema.score`. Do NOT
     require a non-empty verdict (no evidence real output always has one).
   - F3: export `hasTailorableContent(r)` (summary, experience or skills
     present); `TailoredResumeSchema`'s refine uses it.
   - F2: export `tailoredResumeSchemaFor(original)` = `TailoredResumeSchema`
     plus (a) `experience`, `education`, `certifications`, `languages` counts
     must equal the original's (skills exempt — the prompt allows dropping
     irrelevant skills), and (b) `full_name`, `email`, `phone`, `location`
     copied from the original after a successful parse — no 502 on a contact
     mismatch.
2. `src/app/api/resume/tailor/route.ts`
   - F3: 409 before any Gemini call when `!hasTailorableContent(original)`:
     "Tailoring needs a summary, work experience or skills on your resume —
     upload a version that includes one."
   - F2: validate with `tailoredResumeSchemaFor(original)`; a count mismatch
     takes the existing 502 `{retryable:true}` path with zero writes.
3. F5: parse, score and tailor routes return `retryable: err instanceof
   SyntaxError` on the non-Gemini branch.
4. `src/lib/ai/schemas.test.ts`: extend with the cases in Acceptance.

## Do NOT touch
Cap values, prompts, models/key routing, `gemini-client.ts`, chat, UI,
migrations, CLAUDE.md.

## Acceptance (all required)
- `gate.sh` green; new tests included in the count.
- F1: `{}` and a refusal fail with one issue at `["score"]`; combined
  `ats_analysis: {}` fails at `["ats_analysis","score"]`; the sparse fresher
  fixture still passes.
- F2: a reply with blank or altered contact fields comes out with the
  original's; a dropped or extra entry in any of the four lists fails with one
  issue at that path; dropped skills still pass; validation runs before any
  read or write of tailored rows.
- F3: `hasTailorableContent` false for the fresher fixture, true for a
  skills-only resume; the 409 returns before `callGemini`.
- F5: the three branches, verbatim in the PR.
- spec-checker, security-reviewer, edge-case-hunter and schema-reviewer run on
  the final diff.

## Review artifacts required in the PR
Schemas and guards verbatim; route diffs; test output; reviewer tables;
deviations with reasons.

## Migration sequencing
None.
