Describe 'specified-path auto-commit scripts'
  action_dir="$SHELLSPEC_PROJECT_ROOT/actions/auto-commit"
  setup() {
    fixture_root=$(mktemp -d)
    fixture="$fixture_root/work"
    mkdir "$fixture"
    cd "$fixture" || return
    git init -q
    git config user.name Test
    git config user.email test@example.invalid
    mkdir -p third_party/licenses/linux-amd64/example
    printf 'original\n' > third_party/licenses/linux-amd64/example/LICENSE
    printf 'module example\n' > go.mod
    git add .
    git commit -qm initial
    EXPECTED_HEAD=$(git rev-parse HEAD)
    PATHS=third_party/licenses/linux-amd64
    export PATHS
    ELIGIBLE=true
    # Keep action outputs outside the worktree.
    GITHUB_OUTPUT="$fixture_root/output"
    export EXPECTED_HEAD ELIGIBLE GITHUB_OUTPUT
  }
  cleanup() { cd "$SHELLSPEC_PROJECT_ROOT"; rm -rf "$fixture_root"; }
  BeforeEach setup
  AfterEach cleanup

  validate() { bash "$action_dir/validate.sh"; }
  change_license() { printf 'updated\n' > third_party/licenses/linux-amd64/example/LICENSE; }
  clean_tree() {
    validate > /dev/null || return
    test ! -s "$GITHUB_OUTPUT"
  }
  It 'continues without requesting a push for a clean tree'
    When call clean_tree
    The status should be success
  End

  stage_license() {
    change_license
    validate > /dev/null || return
    test "$(cat "$GITHUB_OUTPUT")" = push=true &&
      test "$(git diff --cached --name-only)" = third_party/licenses/linux-amd64/example/LICENSE &&
      test "$(git rev-parse HEAD)" = "$EXPECTED_HEAD"
  }
  It 'stages allowed changes and requests a push without committing'
    When call stage_license
    The status should be success
  End

  Context 'allowed file states'
    Parameters
      untracked
      staged
      deleted
      unusual-name
    End
    stage_variant() {
      case "$1" in
        untracked) printf new > third_party/licenses/linux-amd64/example/NOTICE ;;
        staged) change_license; git add third_party/licenses/linux-amd64/example/LICENSE ;;
        deleted) rm third_party/licenses/linux-amd64/example/LICENSE ;;
        unusual-name) printf new > "third_party/licenses/linux-amd64/example/NOTICE
with spaces" ;;
      esac
      validate > /dev/null || return
      test "$(cat "$GITHUB_OUTPUT")" = push=true &&
        test -n "$(git diff --cached --name-only)" &&
        test "$(git rev-parse HEAD)" = "$EXPECTED_HEAD"
    }
    It 'stages license additions, pre-staged edits, deletions and unusual names'
      When call stage_variant "$1"
      The status should be success
    End
  End

  Context 'outside paths'
  Parameters
    README.md
    go.mod
    go.sum
    internal/repository/gen/auth.sql.go
    internal/repository/gen/db.go
    internal/repository/gen/models.go
    internal/repository/gen/querier.go
    internal/app/gen_auth_repository_moq_test.go
    internal/app/gen_auth_store_moq_test.go
    internal/app/gen_token_issuer_moq_test.go
    third_party/licenses/other/LICENSE
  End
  reject_outside() {
    change_license
    mkdir -p "$(dirname "$1")"
    printf unexpected > "$1"
    validate > /dev/null || return
    test "$(cat "$GITHUB_OUTPUT")" = push=true &&
      test "$(git diff --cached --name-only)" = third_party/licenses/linux-amd64/example/LICENSE &&
      test -n "$(git status --porcelain -- "$1")"
  }
  It 'leaves outside changes untouched alongside selected changes'
    When call reject_outside "$1"
    The status should be success
  End
  End

  Context
  Parameters
    ineligible
    wrong-head
    repeated
  End
  reject_guard() {
    change_license
    case "$1" in
      ineligible) ELIGIBLE=false ;;
      wrong-head) EXPECTED_HEAD=0000000000000000000000000000000000000000 ;;
      repeated) git commit --allow-empty -qm 'chore: regenerate Renovate artifacts'; EXPECTED_HEAD=$(git rev-parse HEAD) ;;
    esac
    validate > /dev/null 2>&1
    test "$?" = 1 &&
      test -z "$(git diff --cached --name-only)" && test ! -s "$GITHUB_OUTPUT"
  }
  It 'rejects unsafe generation without staging'
    When call reject_guard "$1"
    The status should be success
  End
  End

  Context
  Parameters
    success
    addition
    deletion
    unusual-name
    wrong-head
    invalid-branch
    advanced
    race
  End
  push_update() {
    remote="$fixture_root/remote.git"
    git init --bare -q "$remote"
    git remote add origin "$remote"
    git push -q origin HEAD:refs/heads/renovate/test
    stage_license || return
    printf staged-outside > go.mod
    git add go.mod
    printf unstaged-outside > README.md
    expected_file=third_party/licenses/linux-amd64/example/LICENSE
    case "$1" in
      addition) expected_file=third_party/licenses/linux-amd64/example/NOTICE; git restore --staged --worktree third_party/licenses/linux-amd64/example/LICENSE; printf new > "$expected_file" ;;
      deletion) rm "$expected_file" ;;
      unusual-name) expected_file=$(printf 'third_party/licenses/linux-amd64/example/space\nand newline'); git restore --staged --worktree third_party/licenses/linux-amd64/example/LICENSE; printf new > "$expected_file" ;;
    esac
    validate > /dev/null || return
    original_head=$EXPECTED_HEAD
    branch=renovate/test
    case "$1" in
      wrong-head) EXPECTED_HEAD=0000000000000000000000000000000000000000 ;;
      invalid-branch) branch='bad..branch' ;;
    esac
    if [ "$1" = advanced ] || [ "$1" = race ]; then
      other="$fixture_root/other"
      git clone -q -b renovate/test "$remote" "$other"
      git -C "$other" -c user.name=Other -c user.email=other@example.invalid commit --allow-empty -qm concurrent
      concurrent=$(git -C "$other" rev-parse HEAD)
      if [ "$1" = advanced ]; then
        git -C "$other" push -q origin HEAD
      else
        # Advance the remote after ls-remote, when the local commit is created.
        printf '#!/bin/sh\ngit -C "%s" push -q origin HEAD\n' "$other" > .git/hooks/pre-commit
        chmod +x .git/hooks/pre-commit
      fi
    fi
    HEAD_BRANCH=$branch PUSH_TOKEN=fixture APP_SLUG=configured-release-app \
      bash "$action_dir/push.sh" > "$fixture_root/push.log" 2>&1
    result=$?
    actual=$(git --git-dir="$remote" rev-parse refs/heads/renovate/test)
    test "$result" = 1 || return
    if [ "$1" = wrong-head ] || [ "$1" = invalid-branch ]; then
      test "$actual" = "$original_head" && test "$(git rev-parse HEAD)" = "$original_head"
    elif [ "$1" != advanced ] && [ "$1" != race ]; then
      test "$actual" = "$(git rev-parse HEAD)" &&
        test "$(git rev-parse HEAD^)" = "$EXPECTED_HEAD" &&
        test "$(git -c core.quotePath=false diff-tree --no-commit-id --name-only -z -r HEAD | tr '\000' '\001')" = "$(printf '%s\001' "$expected_file")" &&
        test "$(git diff --cached --name-only)" = go.mod &&
        test "$(cat README.md)" = unstaged-outside &&
        test "$(git log -1 --format='%an <%ae>|%cn <%ce>')" = 'configured-release-app[bot] <configured-release-app[bot]@users.noreply.github.com>|configured-release-app[bot] <configured-release-app[bot]@users.noreply.github.com>' &&
        test "$(git log -1 --format=%s)" = 'chore: regenerate Renovate artifacts' &&
        grep -q 'fails intentionally' "$fixture_root/push.log"
    else
      test "$actual" = "$concurrent"
    fi
    result=$?
    rm -rf "$remote" "${other:-$fixture/unused}"
    return "$result"
  }
  It 'pushes with App identity or preserves a concurrent remote head'
    When call push_update "$1"
    The status should be success
  End
  End

  outside_only() {
    printf outside > go.mod
    git add go.mod
    ELIGIBLE=false EXPECTED_HEAD=wrong validate > /dev/null || return
    test ! -s "$GITHUB_OUTPUT" &&
      test "$(git diff --cached --name-only)" = go.mod
  }
  It 'succeeds without a push for outside-only staged changes'
    When call outside_only
    The status should be success
  End

  Context 'unsafe selectors'
    Parameters
      '../escape'
      '/absolute'
      'nested/../../escape'
      ':(glob)**'
      '--all'
      '.'
      '.git/config'
      'escape/file'
    End
    invalid_path() {
      ln -s "$fixture_root" escape
      change_license
      PATHS=$1 validate > /dev/null 2>&1
      test "$?" = 1 && test -z "$(git diff --cached --name-only)" && test ! -s "$GITHUB_OUTPUT"
    }
    It 'rejects path escape, option and pathspec injection before staging'
      When call invalid_path "$1"
      The status should be success
    End
  End

  Context 'literal selections'
    Parameters
      file
      multiple
      glob
      rename
    End
    selected_paths() {
      case "$1" in
        file) PATHS=third_party/licenses/linux-amd64/example/LICENSE; change_license ;;
        multiple) PATHS=$(printf 'go.mod\nthird_party/licenses/linux-amd64'); printf updated > go.mod; change_license ;;
        glob) PATHS='literal*'; printf literal > 'literal*'; printf outside > literal-other ;;
        rename) mv go.mod third_party/licenses/linux-amd64/moved ;;
      esac
      validate > /dev/null || return
      test "$(cat "$GITHUB_OUTPUT")" = push=true || return
      case "$1" in
        file) test "$(git diff --cached --name-only)" = "$PATHS" ;;
        multiple) test "$(git diff --cached --name-only | wc -l)" = 2 ;;
        glob) test "$(git diff --cached --name-only)" = 'literal*' ;;
        rename) test "$(git diff --cached --name-only)" = third_party/licenses/linux-amd64/moved && test -n "$(git diff --name-only -- go.mod)" ;;
      esac
    }
    It 'selects exact files, multiple paths, literal glob names and only the selected side of renames'
      When call selected_paths "$1"
      The status should be success
    End
  End
End
