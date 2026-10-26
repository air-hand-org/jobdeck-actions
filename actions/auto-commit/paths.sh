#!/usr/bin/env bash
# Sourced by both phases; all selectors are literal repository-relative paths.
[[ $(git rev-parse --show-prefix) == '' ]] || { echo 'Run from the repository root.' >&2; exit 1; }
root=$(pwd -P)
selectors=()
while IFS= read -r path || [[ -n $path ]]; do
  [[ -n $path ]] || continue
  path=${path%/}
  [[ $path != /* ]] || { echo 'Select repository-relative paths.' >&2; exit 1; }
  # Normalize dot segments without replacing a selected symlink with its target.
  path=$(realpath -ms -- "$path")
  resolved=$(realpath -m -- "$path")
  [[ $path == "$root/"* && $resolved == "$root/"* ]] || { echo 'Select paths strictly within the repository.' >&2; exit 1; }
  selectors+=(":(top,literal)${path#"$root/"}")
done <<< "${PATHS:?Specify newline-separated paths}"
((${#selectors[@]})) || { echo 'No paths specified.' >&2; exit 1; }
# --no-renames exposes both ends of moves; NULs preserve arbitrary file names.
mapfile -d '' -t paths < <({ git diff --no-renames --name-only -z HEAD -- "${selectors[@]}"; git ls-files --others --exclude-standard -z -- "${selectors[@]}"; } | sort -zu)
