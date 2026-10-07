module.exports = ({ context, channelId, reviewerUserId }) => {
  // Use runner context and revision identifiers; never include PR titles or bodies.
  const { owner, repo } = context.repo;
  const repositoryUrl = `${context.serverUrl}/${owner}/${repo}`;
  const pr = context.payload.pull_request;
  return {
    channel: channelId,
    text: `<@${reviewerUserId}> Please review ${repositoryUrl}/pull/${pr.number}\n` +
      `Head: ${pr.head.sha}\nEvent: ${context.payload.action}\n` +
      `Workflow: ${repositoryUrl}/actions/runs/${context.runId}`,
    unfurl_links: false,
    unfurl_media: false,
  };
};
