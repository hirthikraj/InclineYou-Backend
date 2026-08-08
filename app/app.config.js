const fs = require('fs');

/**
 * Extends app.json at build time.
 *
 * google-services.json is not in the repo (each Firebase project has its own), so
 * we only set `android.googleServicesFile` when the file is actually present.
 * Declaring it unconditionally would break `expo prebuild` / EAS builds for anyone
 * who hasn't downloaded it yet.
 *
 * On EAS, provide it as the GOOGLE_SERVICES_JSON secret file and point this at it.
 */
module.exports = ({ config }) => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? './google-services.json';
  const hasGoogleServices = fs.existsSync(googleServicesFile);

  if (!hasGoogleServices) {
    console.warn(
      '[app.config] google-services.json not found — building without FCM push. ' +
        'Download it from the Firebase console into app/ to enable notifications.',
    );
  }

  return {
    ...config,
    android: {
      ...config.android,
      ...(hasGoogleServices ? { googleServicesFile } : {}),
    },
  };
};
