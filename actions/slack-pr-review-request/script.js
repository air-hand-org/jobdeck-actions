const createMessage = require('./message');

module.exports = async ({ github, context, core, env = process.env }) => {
  const eventPr = context.payload.pull_request;
  if (!eventPr) {
    throw new Error('The event must contain a PR.');
  }
  if (eventPr.head.repo?.full_name !== `${context.repo.owner}/${context.repo.repo}`) {
    core.info('Skipping a fork PR.');
    return null;
  }
  if (eventPr.draft || eventPr.state !== 'open') {
    core.info('Skipping a draft or closed PR event.');
    return null;
  }

  // An event can wait in the queue while its PR becomes draft, closes, or gets
  // a new head. Re-fetch before sending so stale events do not request review.
  const { data: livePr } = await github.rest.pulls.get({
    ...context.repo,
    pull_number: eventPr.number,
  });
  if (livePr.draft || livePr.state !== 'open' || livePr.head.sha !== eventPr.head.sha) {
    core.info('Skipping a draft, closed, or superseded PR head.');
    return null;
  }

  return createMessage({
    context,
    channelId: env.SLACK_CHANNEL_ID,
    reviewerUserId: env.SLACK_REVIEWER_USER_ID,
  });
};
