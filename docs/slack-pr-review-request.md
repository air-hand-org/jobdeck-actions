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

The caller controls the event types. Fork PRs are excluded because GitHub does
not pass Actions Secrets to their `pull_request` runs. Dependabot PRs are also
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

Opening or reopening a non-draft PR, making a draft ready, and changing its head
with `synchronize` request review. Draft and closed PRs are skipped. Before
sending, the action fetches the PR again: an event can wait while the PR becomes
draft, closes, or gets a new head. Superseded events are skipped. The state can
still change after that check, so Hermes must verify the requested head before
publishing a result.

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

`make test` checks only message generation: the top-level mention, PR URL,
requested head, event, run URL, and payload fields. It needs no API stubs, Slack
workspace, or mock server. `make lint` checks workflow security and pinning.

After rollout, use a real non-draft same-repository PR to confirm Slack receives
the request and Hermes fetches the PR and starts reviewing. Successful delivery
alone does not prove a review started. Confirm ready-for-review, reopening, head
updates, and draft skipping through real events as needed.
