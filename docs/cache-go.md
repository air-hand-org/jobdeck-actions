# Go caches

`actions/cache-go` caches Go modules/build data and, by default, golangci-lint analysis data.
Set `exact-key-only: "true"` to omit restore-key fallbacks for both caches. Both modes
preserve the existing `go-` / `golangci-` cache keys. The default (`"false"`) retains
broad OS-specific restore-key fallbacks for backward compatibility.
The existing `golangci-lint: "false"` option still disables the lint cache.

This controls dependency-cache restoration, not cache size: an exact-key archive can
still grow as builds run, and a cache miss requires downloading/building dependencies.
