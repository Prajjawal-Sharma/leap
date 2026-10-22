#!/bin/bash
# Quality gates. Exit 0 only when all green; writes a stamp the Stop hook compares against.
set -u
cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}" || exit 2
fail=0
run() { local name=$1; shift; echo "== $name"; "$@" || { echo "!! FAILED: $name"; fail=1; }; }

# --- doc sync -----------------------------------------------------------------
# Definition of Done and Pitfalls are authored in docs/SHIP_PIPELINE.md §6 and
# reproduced verbatim in CLAUDE.md. Drift between them silently changes the rules
# an agent reads at session start, so it is a gate failure like any red test.
extract_section() {
  # $1 = file, $2 = ERE matching the section heading line
  awk -v pat="$2" '
    !seen && $0 ~ pat { seen=1; inside=1; buf[n++]=$0; next }
    inside && (/^#/ || /^>/ || /^---/) { inside=0 }
    inside { buf[n++]=$0 }
    END {
      while (n > 0 && buf[n-1] ~ /^[[:space:]]*$/) n--
      for (i = 0; i < n; i++) print buf[i]
    }
  ' "$1"
}

check_doc_sync() {
  local src=docs/SHIP_PIPELINE.md dst=CLAUDE.md rc=0 name pat a b
  for f in "$src" "$dst"; do
    [ -f "$f" ] || { echo "   missing file: $f"; return 1; }
  done
  while IFS='|' read -r name pat; do
    a=$(extract_section "$src" "$pat")
    b=$(extract_section "$dst" "$pat")
    if [ -z "$a" ]; then echo "   section '$name' not found in $src"; rc=1; continue; fi
    if [ -z "$b" ]; then echo "   section '$name' not found in $dst"; rc=1; continue; fi
    if [ "$a" != "$b" ]; then
      echo "   DRIFT: '$name' differs between $src (§6) and $dst"
      diff -u <(printf '%s\n' "$a") <(printf '%s\n' "$b") \
        --label "$src:$name" --label "$dst:$name" | sed 's/^/     /'
      rc=1
    else
      echo "   in sync: $name"
    fi
  done <<'SECTIONS'
Definition of Done|^### Definition of Done
Pitfalls|^### Pitfalls
SECTIONS
  if [ "$rc" -ne 0 ]; then
    echo "   Fix: edit docs/SHIP_PIPELINE.md §6, then copy the section verbatim into CLAUDE.md (or vice versa)."
    return 1
  fi
  return 0
}
# ------------------------------------------------------------------------------

run "doc-sync" check_doc_sync
run "tsc"    npx tsc --noEmit
run "eslint" npx eslint src --max-warnings=0
run "tests"  npm test --silent
run "build"  npm run build

if [ "$fail" -ne 0 ]; then rm -f .claude/.gate-ok; echo "GATES RED"; exit 2; fi
stamp="$(git rev-parse HEAD):$(git diff HEAD | shasum | cut -c1-12)"
echo "$stamp" > .claude/.gate-ok
echo "GATES GREEN ($stamp)"
