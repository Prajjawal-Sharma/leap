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
