const createMessage = require('./message');

module.exports = async ({ github, context, core, env = process.env }) => {
  const repository = `${context.repo.owner}/${context.repo.repo}`;
  let number;
  let expectedSha;
  const manual = context.eventName === 'issue_comment';
  if (manual) {
    const { issue, comment } = context.payload;
    if (context.payload.action !== 'created' || !issue?.pull_request || comment?.body?.trim() !== '/review' ||
        !['OWNER', 'MEMBER', 'COLLABORATOR'].includes(comment.author_association)) return null;
    const { data: permission } = await github.rest.repos.getCollaboratorPermissionLevel({
      ...context.repo, username: comment.user.login,
    });
    if (!['admin', 'maintain', 'write'].includes(permission.permission) && permission.user?.permissions?.push !== true) return null;
    number = issue.number;
  } else {
    if (context.eventName !== 'workflow_run' || context.payload.action !== 'completed') return null;
    const { data: run } = await github.rest.actions.getWorkflowRun({
      ...context.repo, run_id: context.payload.workflow_run.id,
    });
    if (run.path !== env.CI_WORKFLOW_PATH || run.event !== 'pull_request' ||
        run.status !== 'completed' || run.conclusion !== 'success' ||
        run.head_repository?.full_name !== repository) return null;
    const prs = await github.paginate(github.rest.pulls.list, {
      ...context.repo, state: 'open', head: `${context.repo.owner}:${run.head_branch}`,
      base: env.TARGET_BRANCH, per_page: 100,
    });
    if (prs.length !== 1) return null;
    number = prs[0].number;
    expectedSha = run.head_sha;
  }
  // Fetch live state immediately before constructing the request, never execute PR code.
  const { data: pr } = await github.rest.pulls.get({ ...context.repo, pull_number: number });
  if (pr.draft || pr.state !== 'open' || pr.merged || pr.head.repo?.full_name !== repository ||
      pr.base.ref !== env.TARGET_BRANCH || (!manual && (pr.head.sha !== expectedSha || pr.auto_merge !== null))) return null;
  core.info('Requesting review for the current PR head.');
  return createMessage({ context: { ...context, payload: { ...context.payload, pull_request: pr } },
    channelId: env.SLACK_CHANNEL_ID, reviewerUserId: env.SLACK_REVIEWER_USER_ID });
};
