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
