# Slack PR review requests

`.github/workflows/reusable-slack-pr-review-request.yaml` sends a top-level
Slack reviewer mention, PR URL, current head SHA, event, and notifier run URL.
PR titles, bodies, comments, and files are never passed to the reviewer or
executed. The notifier app must be separate from Hermes, which ignores its own
posts.

## Caller workflow

Pin `REVIEW_WORKFLOW_COMMIT_SHA` to the reviewed full commit SHA. Select the
actual PR CI workflow's name in `workflow_run.workflows` and its exact path in
`ci-workflow-path`; never select the notifier itself.

```yaml
name: Request PR review
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
  issue_comment:
    types: [created]
permissions: {}
jobs:
  notify:
    if: >-
      (github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success') ||
      (github.event_name == 'issue_comment' && github.event.issue.pull_request && github.event.comment.body == '/review')
    permissions:
      actions: read
      contents: read
      pull-requests: read
    uses: air-hand-org/jobdeck-actions/.github/workflows/reusable-slack-pr-review-request.yaml@REVIEW_WORKFLOW_COMMIT_SHA
    with:
      ci-workflow-path: .github/workflows/ci.yaml
      target-branch: main
    secrets:
      channel-id: ${{ secrets.SLACK_REVIEW_CHANNEL_ID }}
      reviewer-user-id: ${{ secrets.SLACK_REVIEWER_USER_ID }}
      slack-bot-token: ${{ secrets.SLACK_REVIEW_NOTIFIER_BOT_TOKEN }}
```

Both events require the caller workflow to exist on the default branch. The
reusable workflow and its `$/actions/slack-pr-review-request` resolve from the
same pinned commit without checking out PR code. These privileged events can
access secrets, so do not add PR checkouts, artifacts, or executable PR content.

## Eligibility and manual override

Automatic requests require a freshly fetched Actions run for the configured CI
path: event `pull_request`, status `completed`, conclusion `success`, and a head
repository matching the caller. The action resolves the open PR by head branch
and base branch, then re-fetches it. Only an open, unmerged, non-draft,
same-repository PR on the configured base with the exact CI head SHA and
`auto_merge: null` requests review. Mergeability is not used as a substitute for
the auto-merge setting. Missing or ambiguous PR matches fail closed, including
when `workflow_run.pull_requests` is empty.

A newly created PR conversation comment containing only `/review` requests
review without requiring green CI or disabling auto-merge. Only `OWNER`,
`MEMBER`, or `COLLABORATOR` authors with current repository write, maintain, or
admin permission (including a custom role's push permission) are accepted.
Read-only members, issues, edited comments, embedded commands, quoted commands,
and additional instructions do not request review. The same open/unmerged,
non-draft, same-repository and base-branch restrictions still apply.

State can change after the final API read. Hermes must verify the requested
head before publishing a review. Becoming ready, reopening, or disabling
auto-merge after CI has already completed does not emit a new automatic request;
use `/review` or rerun CI. There is no durable deduplication or exactly-once
promise: CI reruns, repeated commands, and delivery retries can repeat a SHA.
Automatic requests serialize by head branch; manual requests serialize by PR.
GitHub can replace queued pending runs.

## Slack setup and permissions

Grant the notifier Slack app `chat:write`, install it, and invite its bot to the
target channel. Configure the caller's Actions secrets:

| Secret | Value |
| --- | --- |
| `SLACK_REVIEW_NOTIFIER_BOT_TOKEN` | Separate notifier app's bot token |
| `SLACK_REVIEW_CHANNEL_ID` | Review channel ID |
| `SLACK_REVIEWER_USER_ID` | Hermes reviewer user ID |

Hermes must accept bot mentions in the channel. Pass only these named secrets;
no PAT, App private key, write token, or `secrets: inherit` is needed. GitHub
permissions are `actions: read` for live CI runs, `pull-requests: read` for PR
state, and `contents: read` for repository collaborator-permission lookup.

## Verification and failures

`make test` exercises message generation and the automatic/manual eligibility
matrix with API-boundary fixtures, plus the existing shell suites. `make lint`
checks workflow security and immutable action pins. Local tests do not send
Slack messages or prove GitHub event scheduling. After merging the shared
workflow and caller, verify a real successful current-head CI completion,
auto-merge suppression, stale-head suppression, and a trusted `/review` comment.
Confirm both Slack delivery and Hermes starting review separately.

Preparation API failures fail the job without sending a request. Slack delivery
uses `errors: true` and the official action's default retries. A lost response
can duplicate an accepted message; inspect the channel before retrying.
