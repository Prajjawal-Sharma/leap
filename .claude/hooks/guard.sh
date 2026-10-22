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
