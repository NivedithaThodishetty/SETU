/**
 * SETU Mobile — build-time config.
 *
 * Extends app.json with the two things that legitimately differ per build.
 *
 * Cleartext HTTP is the interesting one. Android blocks it by default, and it
 * should stay blocked in anything shipped: the production engine is HTTPS, so a
 * release build has no honest reason to talk to a plain-http host. But a
 * development or internal-preview build is routinely pointed at a laptop on the
 * same Wi-Fi — `http://192.168.x.x:3000` — and without this it fails with a
 * network error that looks exactly like the server being down. So it is enabled
 * for those profiles only, rather than weakening every build to make a demo work.
 */

const base = require('./app.json');

const profile = process.env.EAS_BUILD_PROFILE || (process.env.CI ? 'production' : 'development');
const allowCleartext = profile !== 'production';

module.exports = ({ config }) => {
  const expo = { ...base.expo, ...config };

  return {
    ...expo,
    plugins: [
      ...(expo.plugins || []),
      // A peer dependency of expo-audio rather than something SETU imports
      // directly. Without it a standalone build can crash the first time
      // read-aloud tries to play a clip — which is fine in Expo Go, where the
      // module is already present, and exactly the class of failure that only
      // shows up in the APK.
      'expo-asset',
      [
        'expo-build-properties',
        {
          android: {
            usesCleartextTraffic: allowCleartext,
          },
        },
      ],
    ],
    extra: {
      ...(expo.extra || {}),
      buildProfile: profile,
      /**
       * Compiled-in engine address.
       *
       * Set `EXPO_PUBLIC_API_URL` on an EAS profile to point a build at staging
       * without touching source. Left undefined, the app falls back to the
       * production URL in constants/config.ts.
       */
      apiUrl: process.env.EXPO_PUBLIC_API_URL || undefined,
    },
  };
};
