module.exports = async ({ github, context }) => {
  const {
    TARGET_REPOSITORY,
    SERVICE_NAME,
    SERVICE_NAMES,
  } = process.env;

  const release = context.payload.release;
  if (SERVICE_NAME && SERVICE_NAMES) {
    throw new Error('Specify either service-name or service-names, not both.');
  }

  let services;
  try {
    services = SERVICE_NAMES ? JSON.parse(SERVICE_NAMES) : [SERVICE_NAME];
  } catch {
    throw new Error('service-names must be a JSON array.');
  }
  if (!Array.isArray(services) || services.length === 0 || !services.every((service) => typeof service === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(service))) {
    throw new Error('service-name or service-names must specify valid service names.');
  }
  if (new Set(services).size !== services.length) {
    throw new Error('service-names must not contain duplicates.');
  }

  await github.rest.repos.createDispatchEvent({
    owner: context.repo.owner,
    repo: TARGET_REPOSITORY,
    event_type: 'image-published',
    client_payload: {
      services,
      tag: release.tag_name,
      release_url: release.html_url,
    },
  });
}
