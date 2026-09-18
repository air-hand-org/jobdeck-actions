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
  services = SERVICE_NAMES
    ? SERVICE_NAMES.split(',').map((service) => service.trim())
    : [SERVICE_NAME];
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
      services: services,
      tag: release.tag_name,
      release_url: release.html_url,
    },
  });
}
