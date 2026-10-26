#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/paths.sh"
((${#paths[@]})) || exit 0
[[ ${ELIGIBLE:-false} == true ]] || { echo 'Caller has not authorized this PR.' >&2; exit 1; }
[[ $(git rev-parse HEAD) == "${EXPECTED_HEAD:?}" ]] || exit 1
git --literal-pathspecs add -- "${paths[@]}"
printf 'push=true\n'
printf 'push=true\n' >> "${GITHUB_OUTPUT:?}"
