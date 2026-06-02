/**
 * Firebase Admin SDK init.
 *
 * Reads service-account credentials from one of:
 *   1. FIREBASE_SERVICE_ACCOUNT_JSON  - full service-account JSON, single line
 *                                       (easiest for Render: paste the entire
 *                                       JSON file contents into one env var)
 *   2. GOOGLE_APPLICATION_CREDENTIALS - path to a service-account JSON file
 *                                       (good for local dev)
 *
 * Initialization happens at module load (not behind a function) so the
 * exported `db` (Firestore) is always usable by importers — the Admin SDK
 * throws `app/no-app` if you touch `admin.firestore()` before
 * `admin.initializeApp()`.
 */

import admin from 'firebase-admin';

function bootstrap() {
  const inlineJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (inlineJson && inlineJson.trim().length > 0) {
    const credentials = JSON.parse(inlineJson);
    admin.initializeApp({
      credential: admin.credential.cert(credentials),
    });
    console.log('[firebase] initialized from FIREBASE_SERVICE_ACCOUNT_JSON');
    return;
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
    console.log('[firebase] initialized from GOOGLE_APPLICATION_CREDENTIALS');
    return;
  }

  throw new Error(
    'Firebase Admin credentials missing. Set one of:\n' +
      '  - FIREBASE_SERVICE_ACCOUNT_JSON (paste the whole service-account JSON on one line)\n' +
      '  - GOOGLE_APPLICATION_CREDENTIALS (path to the JSON key file)\n' +
      'See DEPLOY.md for how to generate the key.',
  );
}

bootstrap();

export const db = admin.firestore();
