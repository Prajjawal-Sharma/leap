---
name: recon
description: Read-only investigation of the codebase, schema, or config to answer a question with file:line evidence. Never edits anything.
argument-hint: "<question>"
disable-model-invocation: true
---
Investigate, read-only: $ARGUMENTS

Rules: do not create, edit, or delete anything; do not create branches. Verify claims against code and `supabase/migrations`, not against docs. Where only a live DB or dashboard can answer, give the exact SQL or the dashboard path for the human to run.

Report facts with file:line references, mark each claim TRUE / FALSE / UNVERIFIABLE, and end with the line "Built nothing."
