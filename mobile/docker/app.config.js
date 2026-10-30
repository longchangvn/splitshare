// Container-only dynamic config (copied over app.config.js by mobile/Dockerfile).
// The hosted dev server runs logged out (EXPO_OFFLINE), so it can't sign
// manifests. With extra.eas.projectId present, a signed-in Expo Go demands a
// signed manifest ("not signed in to Expo CLI"); without it the project loads
// as an anonymous experience for any tester.
module.exports = ({ config }) => {
  const { eas, ...extra } = config.extra || {};
  return { ...config, extra };
};
