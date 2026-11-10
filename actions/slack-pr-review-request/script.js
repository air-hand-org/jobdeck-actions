const createMessage = require('./message');

module.exports = async ({ github, context, env = process.env }) => {
  const number = context.payload.pull_request?.number ??
    (context.payload.issue?.pull_request ? context.payload.issue.number : undefined);
  if (!number) {
    throw new Error('The event must contain a PR.');
  }
  // Eligibility belongs to the caller. Always use current metadata for delivery.
  const { data: pr } = await github.rest.pulls.get({
    ...context.repo,
    pull_number: number,
  });
  return createMessage({
    context,
    pr,
    channelId: env.SLACK_CHANNEL_ID,
    reviewerUserId: env.SLACK_REVIEWER_USER_ID,
  });
};
