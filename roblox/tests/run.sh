#!/usr/bin/env bash
# Headless test runner for the pure-logic Luau modules. Requires the `luau` CLI
# (https://github.com/luau-lang/luau/releases). Run from anywhere:
#   ./roblox/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")"

fail=0
for spec in *.spec.luau; do
  if ! luau "$spec"; then
    fail=1
  fi
done

echo
if [ "$fail" -eq 0 ]; then
  echo "ALL SPECS PASSED"
else
  echo "SOME SPECS FAILED"
  exit 1
fi
