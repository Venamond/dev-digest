#!/usr/bin/env bash
# Fail if server/client vendored Zod contracts have drifted.
# server/src/vendor/shared is the source of truth; client/ must stay byte-identical.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
left="$root/server/src/vendor/shared"
right="$root/client/src/vendor/shared"

if ! diff -rq "$left" "$right" >/dev/null; then
  echo "::error::server/src/vendor/shared and client/src/vendor/shared have drifted."
  echo "Resync with: rsync -a --delete server/src/vendor/shared/ client/src/vendor/shared/"
  echo
  diff -rq "$left" "$right" || true
  exit 1
fi

echo "vendor/shared in sync"
