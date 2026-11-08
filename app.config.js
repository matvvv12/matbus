// Expo config for local development and GitHub Pages deployments.
// GitHub Pages project sites are served from /<repository-name>/,
// so Expo must prefix its web asset URLs with that path.
module.exports = ({ config }) => {
  const repositorySlug = process.env.GITHUB_REPOSITORY || '';
  const [owner, repository] = repositorySlug.split('/');

  const isAccountSite = Boolean(
    owner && repository && repository.toLowerCase() === `${owner.toLowerCase()}.github.io`
  );

  const nextConfig = {
    ...config,
    web: {
      ...(config.web || {}),
      // MatBus is a single-entry Expo web app hosted as static files.
      output: 'single',
    },
  };

  if (repository && !isAccountSite) {
    nextConfig.experiments = {
      ...(config.experiments || {}),
      baseUrl: `/${repository}`,
    };
  }

  return nextConfig;
};
