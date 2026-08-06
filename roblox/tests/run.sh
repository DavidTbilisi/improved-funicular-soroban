#!/usr/bin/env bash
# Headless test runner for the pure-logic Luau modules. Requires the `luau` CLI
# (https://github.com/luau-lang/luau/releases). Run from anywhere:
#   ./roblox/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")"

# Prefer the CLI on PATH; fall back to a binary dropped beside the project
# (roblox/luau.exe on Windows — gitignored, fetched once from the releases).
LUAU="${LUAU:-luau}"
if ! command -v "$LUAU" >/dev/null 2>&1 && [ -x "../luau.exe" ]; then
  LUAU="../luau.exe"
fi

fail=0
for spec in *.spec.luau; do
  if ! "$LUAU" "$spec"; then
    fail=1
  fi
done

# Luau's standard library has no `io`, so a spec cannot read a source file —
# the "will Roblox actually draw this glyph?" check has to be a node script.
echo
if command -v node >/dev/null 2>&1; then
  if ! node ../scripts/check-glyphs.mjs; then
    fail=1
  fi
else
  echo "glyphs: SKIPPED (node not on PATH)"
fi

echo
if [ "$fail" -eq 0 ]; then
  echo "ALL SPECS PASSED"
else
  echo "SOME SPECS FAILED"
  exit 1
fi
