const assert = require('node:assert/strict');
const test = require('node:test');
const prepare = require('./script');

for (const eventName of ['pull_request', 'issue_comment']) {
  test(`${eventName} identifies the PR and notifies using current metadata regardless of policy`, async () => {
    const context = {
      eventName, repo: { owner: 'example', repo: 'application' },
      serverUrl: 'https://github.com', runId: 123,
      payload: eventName === 'pull_request'
        ? { action: 'synchronize', pull_request: { number: 42, head: { sha: 'old' } } }
        : { action: 'created', issue: { number: 42, pull_request: {} } },
    };
    const github = { rest: { pulls: { get: async (args) => {
      assert.deepEqual(args, { owner: 'example', repo: 'application', pull_number: 42 });
      return { data: { number: 42, state: 'closed', merged: true, draft: true,
        auto_merge: {}, head: { sha: 'current', repo: { full_name: 'example/application' } } } };
    } } } };
    const payload = await prepare({ github, context, core: { info() {} }, env: {
      SLACK_CHANNEL_ID: 'channel', SLACK_REVIEWER_USER_ID: 'reviewer',
    } });
    assert.equal(payload.text, '<@reviewer> Please review https://github.com/example/application/pull/42\n' +
      `Head: current\nEvent: ${context.payload.action}\nWorkflow: https://github.com/example/application/actions/runs/123`);
    assert.equal(payload.channel, 'channel');
    assert.equal(payload.unfurl_links, false);
    assert.equal(payload.unfurl_media, false);
  });
}

for (const eventName of ['pull_request', 'issue_comment']) {
  test(`${eventName} skips a fork using freshly fetched PR metadata`, async () => {
    const context = {
      eventName, repo: { owner: 'example', repo: 'application' },
      payload: eventName === 'pull_request'
        ? { pull_request: { number: 42, head: { repo: { full_name: 'example/application' } } } }
        : { issue: { number: 42, pull_request: {} } },
    };
    let fetched = false;
    const github = { rest: { pulls: { get: async (args) => {
      assert.deepEqual(args, { owner: 'example', repo: 'application', pull_number: 42 });
      fetched = true;
      return { data: { number: 42, head: { sha: 'current', repo: { full_name: 'fork/application' } } } };
    } } } };
    assert.equal(await prepare({ github, context }), undefined);
    assert.equal(fetched, true);
  });
}

test('ordinary issues do not supply PR identity', async () => {
  await assert.rejects(prepare({ context: { payload: { issue: { number: 42 } } } }), /PR/);
});

test('failed PR metadata lookup propagates without preparing a notification', async () => {
  await assert.rejects(prepare({ context: { repo: {}, payload: { pull_request: { number: 42 } } },
    github: { rest: { pulls: { get: async () => { throw new Error('lookup failed'); } } } },
  }), /lookup failed/);
});
