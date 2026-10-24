# jobdeck-actions

Reusable GitHub Actions for jobdeck repositories.

- [Slack PR review requests](docs/slack-pr-review-request.md): request a reviewer through a separate Slack notifier app without checking out PR code.

## Go caches

`actions/cache-go` caches Go modules/build data and, by default, golangci-lint analysis data.
Set `exact-key-only: "true"` to omit restore-key fallbacks for both caches. This opts into
separate `go-exact-v1` / `golangci-exact-v1` namespaces so existing fallback-populated
archives are not reused. The default (`"false"`) preserves existing keys and fallbacks.
The existing `golangci-lint: "false"` option still disables the lint cache.

This controls dependency-cache restoration, not cache size: an exact-key archive can
still grow as builds run, and a cache miss requires downloading/building dependencies.
