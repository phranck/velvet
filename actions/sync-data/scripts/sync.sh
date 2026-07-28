#!/usr/bin/env bash

set -euo pipefail

: "${VELVET_ROOT:?VELVET_ROOT is required}"
: "${VELVET_WORKSPACE:?VELVET_WORKSPACE is required}"
: "${VELVET_OUTPUT:?VELVET_OUTPUT is required}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
: "${GITHUB_REF_NAME:?GITHUB_REF_NAME is required}"

if [[ ! "$VELVET_OUTPUT" =~ ^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$ ]] ||
  [[ "/$VELVET_OUTPUT/" == *"/../"* ]] ||
  [[ "/$VELVET_OUTPUT/" == *"/./"* ]]; then
  echo "velvet sync failed: output must be a normalized repository-relative path" >&2
  exit 1
fi

if [[ "$VELVET_OUTPUT" != "v1" && "$VELVET_OUTPUT" != */v1 ]]; then
  echo "velvet sync failed: output must end in the v1 contract directory" >&2
  exit 1
fi

case "$VELVET_OUTPUT" in
  history | history/* | .git | .git/* | .github | .github/* | .upptimerc.yml)
    echo "velvet sync failed: output path is reserved by the consumer repository" >&2
    exit 1
    ;;
esac

source_sha="$(git -C "$VELVET_WORKSPACE" rev-parse HEAD)"

bun --cwd "$VELVET_ROOT" run --filter @velvet/contracts build
bun --cwd "$VELVET_ROOT" run --filter @velvet/upptime-adapter build

export VELVET_SOURCE_REF="$source_sha"
export VELVET_OUTPUT_DIRECTORY="$VELVET_WORKSPACE/$VELVET_OUTPUT"
bun "$VELVET_ROOT/packages/upptime-adapter/dist/cli.js"

git -C "$VELVET_WORKSPACE" add -A -- "$VELVET_OUTPUT"
if git -C "$VELVET_WORKSPACE" diff --cached --quiet -- "$VELVET_OUTPUT"; then
  echo "velvet: normalized data is unchanged"
  exit 0
fi

git -C "$VELVET_WORKSPACE" config user.name "github-actions[bot]"
git -C "$VELVET_WORKSPACE" config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git -C "$VELVET_WORKSPACE" commit --only -m "chore(velvet): sync data [skip ci]" -- "$VELVET_OUTPUT"
git -C "$VELVET_WORKSPACE" push origin "HEAD:$GITHUB_REF_NAME"
