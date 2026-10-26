# Auto-commit selected generated paths

`air-hand-org/jobdeck-actions/actions/auto-commit` commits changes only under
explicit files or directories. It leaves all outside changes (including staged
changes) untouched for the caller's normal CI/clean-tree gate. A successful push
**exits 1 intentionally**: the old run must not pass in place of CI on the new head.
No selected diff means success without minting a token, even if outside paths differ.

## Caller responsibilities

Use this only in an ordinary `pull_request` workflow, not `pull_request_target`.
The caller decides eligibility: authorize a trusted same-repository PR, check out
its exact head SHA with `persist-credentials: false`, and generate the artifacts
before invoking this action. Do not expose App credentials to untrusted fork code.
Set `eligible` from the PR author/repository, not the triggering actor: App pushes
must run normal validation too. Run the caller's existing generation/clean-tree
checks after this action when it returns successfully.

The example below authorizes Renovate; the action itself is not Renovate-specific.

```yaml
- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  with:
    ref: ${{ github.event.pull_request.head.sha }}
    persist-credentials: false
# Run the repository's own artifact generation command here.
- uses: air-hand-org/jobdeck-actions/actions/auto-commit@<released-commit-sha>
  with:
    eligible: ${{ github.event.pull_request.user.login == 'renovate[bot]' && github.event.pull_request.head.repo.full_name == github.repository }}
    paths: |
      third_party/licenses/linux-amd64
    expected-head: ${{ github.event.pull_request.head.sha }}
    head-branch: ${{ github.event.pull_request.head.ref }}
    repository: ${{ github.event.repository.name }}
    app-client-id: ${{ vars.APP_CLIENT_ID }}
    app-private-key: ${{ secrets.APP_PRIVATE_KEY }}
```

## Inputs

All inputs are required.

| Input | Contract |
| --- | --- |
| `paths` | Newline-separated literal files/directories relative to the repository root. Spaces are preserved; blank lines are ignored. No glob expansion, shell splitting or Git pathspec expressions. Use a directory to include descendants with newline-containing filenames. Root selection (including normalized `.`), absolute paths and paths resolving outside the checkout are rejected. Safe dot segments and repeated separators are normalized without replacing a selected symlink with its target. A final directory slash is accepted. Git metadata and missing paths yield no selected diff. Syntax-like filenames (such as `literal*`, `--all` or `:(glob)**`) are literal, never patterns or options. |
| `eligible` | Literal `true` only when the caller authorizes updating this same-repository PR. |
| `expected-head` | Exact PR head SHA used for checkout and generation. |
| `head-branch` | Same-repository PR branch, without `refs/heads/`. |
| `repository` | Current repository name, without owner; scopes the App token to this repository. |
| `app-client-id` | Client ID of the installed GitHub App with Contents write access. |
| `app-private-key` | App private key. Used only after selected-path validation finds changes. |

Run from the checkout root on Linux with Bash, Git, GNU coreutils and a configured
`origin` pointing at the same GitHub repository. The action does not generate files,
select Renovate PRs, change checkout refs, or install tools. There are no outputs.

## Commit and push behavior

Tracked edits, additions and deletions and nonignored untracked files are included
only within the selected paths. Rename detection is disabled so a move across the
selection boundary cannot hide its outside endpoint. Selected paths are staged;
pre-staged outside paths are neither committed nor unstaged. Selected files are
committed using their generated working-tree contents, not partial index contents.

The fixed subject `chore: regenerate artifacts by auto-commit action` prevents a
repeat commit when generation changes again on the automatically generated head.
This loop guard runs only in the push phase, before the remote read/commit, and
does not depend on the triggering actor. A repeated-generation failure requires
investigation, not another automatic commit.

After validation the action creates a repository-scoped Contents-write App token.
Its returned `app-slug` determines both author and committer:
`SLUG[bot] <SLUG[bot]@users.noreply.github.com>`. Configure Renovate's
`gitIgnoredAuthors` with the actual resulting email so Renovate can rebase its PRs.
Token authentication is passed only to the remote-head read and push Git commands,
never saved in Git configuration or supplied to commit hooks.

The local HEAD must match `expected-head`. The remote branch must still have that
head immediately before committing, and a normal **non-force** push rejects a
concurrent update after the check. A rejected push fails without overwriting the
remote; a local generated commit can remain in that disposable checkout. A
successful push also fails deliberately so the new commit receives normal CI.
