#!/usr/bin/env bash
set -euo pipefail

upstream_commit="5b9f9a52038e3420d496fdc04c19f6dcd49d9474"
router_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
migrations_directory="${router_directory}/migrations"

if [[ -d "$migrations_directory" ]] && find "$migrations_directory" -type f -print -quit | grep -q .; then
  printf 'Pinned migrations are already present at %s\n' "$migrations_directory"
  exit 0
fi

temporary_source="$(mktemp -d)"
cleanup() {
  rm -rf "$temporary_source"
}
trap cleanup EXIT

git -C "$temporary_source" init --quiet
git -C "$temporary_source" remote add origin https://github.com/juspay/hyperswitch.git
git -C "$temporary_source" fetch --quiet --depth 1 origin "$upstream_commit"
git -C "$temporary_source" checkout --quiet --detach FETCH_HEAD

rm -rf "$migrations_directory"
cp -a "${temporary_source}/migrations" "$migrations_directory"
printf 'Fetched migrations from Hyperswitch %s\n' "$upstream_commit"
