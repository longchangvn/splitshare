// Container-only dynamic config (copied over app.config.js by mobile/Dockerfile).
// Expo Go on a physical iOS device only opens a dev-server project whose
// manifest is signed for the same Expo account it is signed in to. Signing
// needs extra.eas.projectId (+ EXPO_TOKEN at runtime), so make sure it is set
// even when app.json doesn't carry it.
module.exports = ({ config }) => {
  const projectId = process.env.EXPO_PROJECT_ID || config.extra?.eas?.projectId;
  if (!projectId) return config;
  return {
    ...config,
    extra: { ...config.extra, eas: { ...config.extra?.eas, projectId } },
  };
};
