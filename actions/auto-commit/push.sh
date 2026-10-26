#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/paths.sh"
((${#paths[@]})) || exit 0
git check-ref-format "refs/heads/${HEAD_BRANCH:?}"
[[ $(git rev-parse HEAD) == "${EXPECTED_HEAD:?}" ]] || exit 1
[[ $(git log -1 --format=%s) != 'chore: regenerate Renovate artifacts' ]] || exit 1
# The token is operation-local; never persist it in checkout/config credentials.
auth=$(printf 'x-access-token:%s' "${PUSH_TOKEN:?}" | base64 -w0)
remote_head=$(git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $auth" \
  ls-remote --exit-code origin "refs/heads/$HEAD_BRANCH")
if [[ ${remote_head%%$'\t'*} != "$EXPECTED_HEAD" ]]; then
  echo 'PR head advanced; refusing to overwrite concurrent changes.' >&2
  exit 1
fi
# --only excludes even pre-staged outside changes, leaving their index intact.
git --literal-pathspecs -c user.name="${APP_SLUG:?}[bot]" \
  -c user.email="${APP_SLUG}[bot]@users.noreply.github.com" \
  commit --only -m 'chore: regenerate Renovate artifacts' -- "${paths[@]}"
# Normal non-force push also rejects an update racing the head check.
git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $auth" \
  push origin "HEAD:refs/heads/$HEAD_BRANCH"
echo 'Artifacts pushed. This run fails intentionally; the new head must pass normal CI.'
exit 1
