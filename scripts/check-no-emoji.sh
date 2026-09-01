#!/usr/bin/env bash
# Guards HANDOFF-00 assertion A9 and the CLAUDE.md "no emoji anywhere" rule.
#
# IMPORTANT - why this is a script and not a one-line grep. Under a POSIX/C locale,
# GNU grep -P rejects \x{...} escapes above U+FFFF:
#
#   $ grep -rnP '[\x{1F300}-\x{1FAFF}]' .
#   grep: character code point value in \x{} or \o{} is too large
#
# and in a pipeline that error is easy to miss while the exit status still reads as
# "clean". The scan then reports success having examined nothing. Forcing a UTF-8
# locale fixes it; the self-test below fails loudly if the regex engine is ever
# unable to match a known emoji, so this can never degrade to a silent pass.
set -uo pipefail

export LC_ALL=C.UTF-8

# U+1F300-U+1FAFF pictographs, U+2600-U+27BF misc symbols/dingbats, U+FE0F selector.
# Typographic arrows (U+2190-U+21FF, U+2B00-U+2BFF) are NOT emoji and are deliberate
# domain notation here (t<->z boundaries, "sapling->orchard" pool paths, the severity
# ramp in CLAUDE.md), so they are not matched.
PATTERN='[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}\x{FE0F}]'

# Self-test: the engine must match a real emoji, or the scan is meaningless.
if ! printf '\xF0\x9F\x9A\x80\n' | grep -qP "$PATTERN"; then
  echo "check-no-emoji: FATAL - grep -P cannot match astral code points in this locale." >&2
  echo "check-no-emoji: the scan would report a false negative. Aborting." >&2
  exit 2
fi

# `.next*` rather than `.next`, because the exclusion is about BUILD OUTPUT and
# not about one directory name. HANDOFF-11 built into `.next-snapshot` for one
# afternoon and this guard scanned it - minified vendor code, full of emoji,
# reported as findings in files nobody wrote. The build directory a tool chooses
# is not this rule's business; the source tree is.
# docs/2.0/research/ holds imported third-party
# research that uses U+26A0 as an UNVERIFIED marker; both are carved out by A9.
# apps/web (HANDOFF-01) is the first tree with user-visible copy outside the
# original list: CSS carries content strings through ::before, and .mjs carries
# script output. Both are scanned now. .next is generated and is excluded so a
# post-build run does not walk route types.
hits=$(grep -rnP "$PATTERN" \
  --include='*.md' --include='*.ts' --include='*.tsx' --include='*.yml' --include='*.yaml' \
  --include='*.css' --include='*.mjs' --include='*.cjs' --include='*.js' \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.turbo --exclude-dir=dist \
  --exclude-dir='.next*' --exclude-dir=research \
  . 2>/dev/null)

if [ -n "$hits" ]; then
  echo "check-no-emoji: FAIL - emoji found (CLAUDE.md forbids emoji in code, copy, commits and PR bodies):" >&2
  echo "$hits" >&2
  exit 1
fi

echo "check-no-emoji: OK - no emoji in *.md, *.ts, *.tsx, *.yml, *.css, *.mjs, *.js (excluding research/ and every .next* build directory)."
