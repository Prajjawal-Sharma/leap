#!/bin/bash
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
b=$(git branch --show-current 2>/dev/null)
g=$([ -f .claude/.gate-ok ] && echo "last green gate: $(cat .claude/.gate-ok)" || echo "no green gate stamp")
s=$([ -f .claude/.ship-active ] && echo "a /ship is ACTIVE" || echo "no active /ship")
echo "Leap session: branch=$b; $g; $s. Read the Definition of Done and Pitfalls in CLAUDE.md before changing code."
