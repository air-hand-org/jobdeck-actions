const assert = require('node:assert/strict');
const test = require('node:test');
const createMessage = require('./message');

test('builds a top-level Slack review request with the PR URL and requested head', () => {
  const context = {
    repo: { owner: 'example', repo: 'application' },
    serverUrl: 'https://github.com',
    runId: 1234,
    payload: {
      action: 'synchronize',
      pull_request: {
        number: 42,
        head: { sha: 'a'.repeat(40) },
        title: 'PR title should not appear in the request',
        body: 'PR body should not appear in the request',
      },
    },
  };

  const payload = createMessage({ context, channelId: 'C0123456789', reviewerUserId: 'U0123456789' });

  assert.deepEqual(payload, {
    channel: 'C0123456789',
    text: '<@U0123456789> Please review https://github.com/example/application/pull/42\n' +
      `Head: ${'a'.repeat(40)}\nEvent: synchronize\n` +
      'Workflow: https://github.com/example/application/actions/runs/1234',
    unfurl_links: false,
    unfurl_media: false,
  });
});
