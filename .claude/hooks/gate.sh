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

# --- design tokens ------------------------------------------------------------
# Migrated UI uses semantic tokens only (docs/DESIGN.md §10 rule 2). Literal
# colours are invisible in review and silently break the other theme, so they
# fail the gate the same way a red test does. Page PRs append their own
# directories here as they migrate.
UI_TOKEN_PATHS=(src/components/ui src/components/leap src/app/dev)

check_tokens() {
  local present=() path files rc=0 hits
  for path in "${UI_TOKEN_PATHS[@]}"; do
    [ -e "$path" ] && present+=("$path")
  done
  if [ ${#present[@]} -eq 0 ]; then
    echo "   no token-checked paths present yet"
    return 0
  fi

  # globals.css is where the literals are supposed to live.
  local find_args=(-type f \
                   \( -name '*.ts' -o -name '*.tsx' -o -name '*.css' \) \
                   ! -name 'globals.css')
  if [ "$(find "${present[@]}" "${find_args[@]}" | wc -l)" -eq 0 ]; then
    echo "   no files to check"
    return 0
  fi

  local prefixes='bg|text|border|ring|fill|stroke|outline|from|via|to|shadow|divide|placeholder|decoration'
  local palette='slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'

  # Each rule is "label|ERE". Anchoring on a non-identifier character keeps
  # token utilities such as bg-mk-teal-bg and text-muted-foreground clear of
  # the palette rule, and every rule needs a colour marker (#, a colour
  # function, or a palette name) so w-[256px] and text-[15px] never match.
  local rules=(
    "hex literal|#[0-9a-fA-F]{3,8}([^0-9a-zA-Z_-]|$)"
    "colour function|(rgba?|hsla?|oklch|oklab|lab|lch|hwb)\("
    "arbitrary colour|-\[#"
    "palette class|(^|[^a-zA-Z0-9_-])($prefixes)-(($palette)(-(50|[1-9]00|950))?|white|black)([^a-zA-Z0-9_-]|$)"
  )

  # Named and system colours inside an arbitrary value — bg-[red],
  # text-[Canvas]. Only colour-capable prefixes, only bare words, and the
  # CSS-wide keywords pass, so w-[auto] and grid-cols-[subgrid] stay clear.
  # Matched with -o and filtered per hit, not per line: filtering whole lines
  # let `bg-[red] w-[auto]` through, because the allowed keyword suppressed
  # the violation sharing its line.
  local keyword_rule="($prefixes)-\[[a-zA-Z]+\]"
  local keyword_allow='-\[(inherit|initial|unset|revert|none|auto|transparent|currentColor|currentcolor|subgrid|min|max|fit|full)\]'

  local rule label pattern
  for rule in "${rules[@]}"; do
    label=${rule%%|*}
    pattern=${rule#*|}
    # -e matters: the arbitrary-colour pattern starts with "-" and would
    # otherwise be read as grep options. -H keeps the file:line prefix
    # even when the hit list is a single file.
    # -exec ... + rather than xargs: a path containing a space or a
    # newline would be word-split by xargs, grep's error swallowed by
    # 2>/dev/null, and that file silently skipped.
    hits=$(find "${present[@]}" "${find_args[@]}" \
             -exec grep -HnE -e "$pattern" {} + 2>/dev/null)
    if [ -n "$hits" ]; then
      printf '%s\n' "$hits" | sed "s/^/   $label: /"
      rc=1
    fi
  done

  hits=$(find "${present[@]}" "${find_args[@]}" \
           -exec grep -oHnE -e "$keyword_rule" {} + 2>/dev/null \
         | grep -vE -e "$keyword_allow")
  if [ -n "$hits" ]; then
    printf '%s\n' "$hits" | sed "s/^/   named colour: /"
    rc=1
  fi

  if [ "$rc" -ne 0 ]; then
    echo "   Fix: use a semantic token (bg-card, text-muted-foreground, bg-scrim)."
    echo "   Colour literals belong in src/app/globals.css and nowhere else."
    return 1
  fi
  echo "   tokens only: ${present[*]}"
  return 0
}
# ------------------------------------------------------------------------------

run "doc-sync" check_doc_sync
run "tokens"  check_tokens
run "tsc"    npx tsc --noEmit
run "eslint" npx eslint src --max-warnings=0
run "tests"  npm test --silent
run "build"  npm run build

if [ "$fail" -ne 0 ]; then rm -f .claude/.gate-ok; echo "GATES RED"; exit 2; fi
stamp="$(git rev-parse HEAD):$(git diff HEAD | shasum | cut -c1-12)"
echo "$stamp" > .claude/.gate-ok
echo "GATES GREEN ($stamp)"
