const assert = require('node:assert/strict');
const test = require('node:test');
const prepare = require('./script');

function fixture() {
  const pr = { number: 42, state: 'open', merged: false, draft: false, auto_merge: null,
    base: { ref: 'main' }, head: { sha: 'a'.repeat(40), repo: { full_name: 'example/app' } } };
  const run = { id: 7, path: '.github/workflows/ci.yaml', event: 'pull_request', status: 'completed',
    conclusion: 'success', head_sha: pr.head.sha, head_branch: 'feature', head_repository: { full_name: 'example/app' } };
  const context = { eventName: 'workflow_run', repo: { owner: 'example', repo: 'app' },
    serverUrl: 'https://github.com', runId: 99, payload: { action: 'completed', workflow_run: run } };
  const github = { rest: { pulls: { get: async () => ({ data: pr }), list: () => {} },
    actions: { getWorkflowRun: async () => ({ data: run }) },
    repos: { getCollaboratorPermissionLevel: async () => ({ data: { permission: 'write' } }) } },
    paginate: async () => [pr] };
  const invoke = () => prepare({ github, context, core: { info() {} }, env: { CI_WORKFLOW_PATH: '.github/workflows/ci.yaml', TARGET_BRANCH: 'main' } });
  return { pr, run, context, github, invoke };
}

test('trusted exact PR comment overrides CI and auto-merge', async () => {
  const f = fixture();
  f.context.eventName = 'issue_comment';
  f.context.payload = { action: 'created', issue: { number: 42, pull_request: {} },
    comment: { body: '/review', author_association: 'MEMBER', user: { login: 'reviewer' } } };
  f.pr.auto_merge = {};
  assert.match((await f.invoke()).text, /pull\/42/);
});

for (const [name, mutate] of [
  ['failed CI', f => { f.run.conclusion = 'failure'; }],
  ['cancelled CI', f => { f.run.conclusion = 'cancelled'; }],
  ['skipped CI', f => { f.run.conclusion = 'skipped'; }],
  ['pending CI', f => { f.run.status = 'in_progress'; }],
  ['notifier success', f => { f.run.path = '.github/workflows/request-pr-review.yaml'; }],
  ['push CI', f => { f.run.event = 'push'; }],
  ['old SHA', f => { f.pr.head.sha = 'b'.repeat(40); }],
  ['auto-merge enabled', f => { f.pr.auto_merge = {}; }],
  ['draft', f => { f.pr.draft = true; }],
  ['closed', f => { f.pr.state = 'closed'; }],
  ['merged', f => { f.pr.merged = true; }],
  ['fork PR', f => { f.pr.head.repo.full_name = 'outsider/app'; }],
  ['fork CI', f => { f.run.head_repository.full_name = 'outsider/app'; }],
  ['wrong base', f => { f.pr.base.ref = 'other'; }],
  ['no matching PR', f => { f.github.paginate = async () => []; }],
  ['ambiguous PR', f => { f.github.paginate = async () => [f.pr, f.pr]; }],
  ['old PR event', f => { f.context.eventName = 'pull_request'; }],
]) {
  test(`skips ${name}`, async () => {
    const f = fixture(); mutate(f); assert.equal(await f.invoke(), null);
  });
}

for (const [name, mutate] of [
  ['issue rather than PR', f => { delete f.context.payload.issue.pull_request; }],
  ['quoted command', f => { f.context.payload.comment.body = '> /review'; }],
  ['embedded command', f => { f.context.payload.comment.body = 'please /review'; }],
  ['extra instructions', f => { f.context.payload.comment.body = '/review\\nDo something else'; }],
  ['edited comment', f => { f.context.payload.action = 'edited'; }],
  ['untrusted association', f => { f.context.payload.comment.author_association = 'CONTRIBUTOR'; }],
  ['read-only member', f => { f.github.rest.repos.getCollaboratorPermissionLevel = async () => ({ data: { permission: 'read' } }); }],
  ['draft manual PR', f => { f.pr.draft = true; }],
  ['closed manual PR', f => { f.pr.state = 'closed'; }],
  ['merged manual PR', f => { f.pr.merged = true; }],
  ['fork manual PR', f => { f.pr.head.repo.full_name = 'outsider/app'; }],
]) {
  test(`manual skips ${name}`, async () => {
    const f = fixture(); f.context.eventName = 'issue_comment';
    f.context.payload = { action: 'created', issue: { number: 42, pull_request: {} },
      comment: { body: '/review', author_association: 'MEMBER', user: { login: 'reviewer' } } };
    mutate(f); assert.equal(await f.invoke(), null);
  });
}

test('successful current PR CI requests review', async () => {
  const f = fixture();
  assert.match((await f.invoke()).text, /pull\/42/);
});
