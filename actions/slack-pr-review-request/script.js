const createMessage = require('./message');

module.exports = async ({ github, context, core, env = process.env }) => {
  const number = context.payload.pull_request?.number ??
    (context.payload.issue?.pull_request ? context.payload.issue.number : undefined);
  if (!number) {
    throw new Error('The event must contain a PR.');
  }
  // Use current metadata for delivery and the shared fork restriction.
  const { data: pr } = await github.rest.pulls.get({
    ...context.repo,
    pull_number: number,
  });
  if (pr.head.repo.full_name !== `${context.repo.owner}/${context.repo.repo}`) {
    core.info('Skipping a fork PR.');
    return;
  }
  return createMessage({
    context,
    pr,
    channelId: env.SLACK_CHANNEL_ID,
    reviewerUserId: env.SLACK_REVIEWER_USER_ID,
  });
};
