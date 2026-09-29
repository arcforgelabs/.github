#!/usr/bin/env bash
# Re-vendor upstream Barnacle and re-apply patches/.
#   scripts/sync-upstream.sh            verify vendor/ == upstream@pinned sha + patches (CI)
#   scripts/sync-upstream.sh <new-sha>  re-vendor at <new-sha>, apply patches, update UPSTREAM
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
vendor="$root/vendor/openclaw"
# shellcheck disable=SC1091
source <(sed -n 's/^\(repo\|sha\|files\)=\(.*\)$/\1="\2"/p' "$vendor/UPSTREAM")
target="${1:-$sha}"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
for f in $files; do
  mkdir -p "$work/$(dirname "$f")"
  curl -fsSL "https://raw.githubusercontent.com/$repo/$target/$f" -o "$work/$f"
done
for p in "$root"/patches/*.patch; do
  git -C "$work" apply --unidiff-zero -p0 "$p" 2>/dev/null || (cd "$work" && patch -s -p0 < "$p")
done
if [ $# -eq 0 ]; then
  for f in $files; do
    cmp -s "$work/$f" "$vendor/$f" || { echo "vendor drift: $f differs from $repo@$sha + patches" >&2; exit 1; }
  done
  echo "vendor/openclaw matches $repo@$sha + patches"
else
  for f in $files; do mkdir -p "$vendor/$(dirname "$f")"; cp "$work/$f" "$vendor/$f"; done
  sed -i "s/^sha=.*/sha=$target/" "$vendor/UPSTREAM"
  echo "re-vendored $repo@$target; run the tests before committing"
fi
