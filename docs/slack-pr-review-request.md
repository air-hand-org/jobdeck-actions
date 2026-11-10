# Slack PR review requests

`.github/workflows/reusable-slack-pr-review-request.yaml` requests review through
 the official Slack Action's `chat.postMessage`. The top-level `text` contains a
reviewer mention, PR URL, head SHA, event name, and workflow run URL. PR titles,
bodies, and files are not included or executed.

## Caller workflow

Publish the reusable workflow first and replace `REVIEW_WORKFLOW_COMMIT_SHA`
with its full commit SHA. The workflow and `$/actions/slack-pr-review-request`
action resolve from the same commit without checking out PR code.

```yaml
name: Request PR review
on:
  pull_request:
    types: [opened, reopened, ready_for_review, synchronize]
permissions: {}
jobs:
  request-review:
    if: >-
      github.event.pull_request.state == 'open' &&
      !github.event.pull_request.draft &&
      github.event.pull_request.head.repo.full_name == github.repository
    permissions:
      pull-requests: read
    uses: air-hand-org/jobdeck-actions/.github/workflows/reusable-slack-pr-review-request.yaml@REVIEW_WORKFLOW_COMMIT_SHA
    secrets:
      channel-id: ${{ secrets.SLACK_REVIEW_CHANNEL_ID }}
      reviewer-user-id: ${{ secrets.SLACK_REVIEWER_USER_ID }}
      slack-bot-token: ${{ secrets.SLACK_REVIEW_NOTIFIER_BOT_TOKEN }}
```

The caller owns event types, CI success and tested-head freshness, PR
state/draft/auto-merge restrictions, and manual-command permissions. The notifier
infers the PR number from `pull_request.number` or `issue_comment.issue.number`
when `issue.pull_request` is present and fetches current PR metadata. For both
event shapes, it skips forks by comparing the fetched `head.repo.full_name` with
the current repository. Otherwise it sends the existing message regardless of
PR state, without other eligibility or permission checks. Never call it from an
untrusted comment without validating the exact command and current repository
write permission first. Neither workflow checks out PR code or consumes artifacts.

GitHub does not pass Actions Secrets to fork `pull_request` runs. Dependabot PRs are also
subject to GitHub's restricted secret handling; configure corresponding
Dependabot secrets if notifications are needed for them.

The GitHub token needs only `pull-requests: read`. Pass the three named secrets;
`secrets: inherit`, a PAT, GitHub App key, and repository write access are
unnecessary for the notification.

## Slack setup

Reuse a notifier Slack App separate from Hermes, because Hermes excludes its
own posts. Grant `chat:write`, install the App, and invite its bot to the target
channel. Channel membership avoids needing `chat:write.public`.

Set these Actions Secrets in the calling repository, or use organization secrets
available to it:

| Actions Secret | Value |
| --- | --- |
| `SLACK_REVIEW_NOTIFIER_BOT_TOKEN` | Notifier App's Bot User OAuth Token (`xoxb-...`), separate from Hermes |
| `SLACK_REVIEW_CHANNEL_ID` | ID of the channel receiving requests |
| `SLACK_REVIEWER_USER_ID` | Slack user ID of the reviewer to mention |

Channel and user IDs are actual workspace identifiers. They are passed as
secrets to avoid publishing them in source files or Actions logs. Examples and
tests contain no actual workspace IDs. The composite action receives the mapped
values as inputs. Hermes must accept bot mentions in the channel.

## Events and repeat requests

The example caller requests review on opening, reopening, readiness, and head
updates for eligible PRs. Other callers can gate requests on CI or a manual
`issue_comment` command. Comment workflows must be on the default branch before
GitHub can trigger them.

Before sending, the notifier fetches the PR and uses its current head SHA.
Caller eligibility checks and delivery are not atomic: state or head can change
between them. Hermes must verify the requested head before publishing a result.

The job serializes requests by repository and PR with `cancel-in-progress: false`.
GitHub can replace pending runs, so rapid updates can collapse to the latest
head. Reopening, becoming ready again, retry, or manual rerun can request the same
SHA more than once. No durable deduplication store or exactly-once guarantee is
provided. Review labels and release gating are outside this workflow's scope.

## Failures and verification

The preparation step reports failures through `core.setFailed`. Delivery uses
`slackapi/slack-github-action` with `errors: true` and its default retry policy.
Remaining Slack API or transport errors fail the job. A retry can duplicate a
message if an earlier request was accepted before its response was lost. Inspect
the failed run and channel before manually rerunning, and correct the App's
permissions, membership, or token as needed.

`make test` checks message generation and notification preparation for both
event shapes, current metadata, unrestricted PR states and lookup failures.
GitHub API calls are stubbed; no Slack workspace is required. `make lint` checks
workflow security and pinning.

After rollout, use a real non-draft same-repository PR to confirm Slack receives
the request and Hermes fetches the PR and starts reviewing. Successful delivery
alone does not prove a review started. Confirm ready-for-review, reopening, head
updates, and draft skipping through real events as needed.
