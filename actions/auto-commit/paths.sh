#!/usr/bin/env bash
# Sourced by both phases; all selectors are literal repository-relative paths.
[[ $(git rev-parse --show-prefix) == '' ]] || { echo 'Run from the repository root.' >&2; exit 1; }
selectors=()
while IFS= read -r path || [[ -n $path ]]; do
  [[ -n $path ]] || continue
  path=${path%/}
  case "$path" in
    ''|.|/*|-*|:*|..|../*|*/../*|*/..|./*|*/./*|*/.|*//*|.git|.git/*)
      printf 'Unsafe selected path: %q\n' "$path" >&2; exit 1 ;;
  esac
  resolved=$(realpath -m -- "$path")
  [[ $resolved == "$(pwd -P)/"* ]] || { echo 'Selected path escapes the repository.' >&2; exit 1; }
  selectors+=(":(top,literal)$path")
done <<< "${PATHS:?Specify newline-separated paths}"
((${#selectors[@]})) || { echo 'No paths specified.' >&2; exit 1; }
# --no-renames exposes both ends of moves; NULs preserve arbitrary file names.
mapfile -d '' -t paths < <({ git diff --no-renames --name-only -z HEAD -- "${selectors[@]}"; git ls-files --others --exclude-standard -z -- "${selectors[@]}"; } | sort -zu)
