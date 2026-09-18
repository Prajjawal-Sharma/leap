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
