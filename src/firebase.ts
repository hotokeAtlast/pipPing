/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Firebase Client SDK init + auth helpers.
 *
 * The web config is intentionally public (it ships in the JS bundle of
 * every Firebase web app). The secret material lives on the server in
 * FIREBASE_SERVICE_ACCOUNT_JSON, which the Admin SDK uses to verify the
 * ID tokens we send on every API request.
 *
 * Single-user mode: only the email in `VITE_ALLOWED_EMAIL` can sign in.
 * The same check is enforced on the server in `server/auth.ts` via
 * `ALLOWED_EMAIL` (defence in depth — server check is the real gate).
 *
 * Both env vars must be set to the same email. If either is missing, the
 * client refuses to show a sign-in form at all (config error) and the
 * server returns 403 on every API call.
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  type Auth,
  type User,
} from 'firebase/auth';

/** Custom error code we throw when a non-owner tries to sign in or sign up. */
export const NOT_AUTHORIZED_CODE = 'pipping/not-authorized';

/**
 * The one and only email allowed to use this app.
 *
 * Read from `VITE_ALLOWED_EMAIL` at build time so it never has to be
 * committed to the repo. Empty string when unconfigured — in that case
 * `isAllowedEmailConfigured()` is false and the AuthGate shows a config
 * error instead of a sign-in form.
 */
const rawAllowedEmail = (import.meta.env.VITE_ALLOWED_EMAIL as string | undefined)?.trim() || '';

/** Lowercased comparison form. */
const allowedEmailLower = rawAllowedEmail.toLowerCase();

/** Public, masked form (e.g. "h••••@gmail.com") for the UI. */
export const ALLOWED_EMAIL = rawAllowedEmail;

/** True iff VITE_ALLOWED_EMAIL is set to a non-empty value. */
export function isAllowedEmailConfigured(): boolean {
  return rawAllowedEmail.length > 0;
}

/** True iff the given email matches the single allowed owner. */
export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email || !allowedEmailLower) return false;
  return email.trim().toLowerCase() === allowedEmailLower;
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

export function isFirebaseConfigured(): boolean {
  return !!(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
  );
}

function ensureApp(): { app: FirebaseApp; auth: Auth } {
  if (!isFirebaseConfigured()) {
    throw new Error(
      'Firebase client config is missing. Set VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, and VITE_FIREBASE_APP_ID in your .env (see .env.example).',
    );
  }
  if (!app) {
    app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    auth = getAuth(app);
  }
  return { app, auth: auth! };
}

export function getFirebaseAuth(): Auth {
  return ensureApp().auth;
}

/** Get a fresh ID token for the currently signed-in user (forces a refresh). */
export async function getIdToken(forceRefresh = false): Promise<string | null> {
  const { auth } = ensureApp();
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}

/** Returns a valid ID token, refreshing if it's about to expire (<60s). */
export async function getValidIdToken(): Promise<string | null> {
  const { auth } = ensureApp();
  const user = auth.currentUser;
  if (!user) return null;
  // getIdToken() with no arg refreshes automatically if expired/close to expiry.
  return user.getIdToken();
}

/** Throws the not-authorized error. */
function notAuthorized(email: string): never {
  const err = new Error(
    `This app is private. Only the configured owner can sign in (you tried ${email || '—'}).`,
  ) as Error & { code: string };
  err.code = NOT_AUTHORIZED_CODE;
  throw err;
}

export async function signIn(email: string, password: string): Promise<User> {
  if (!isAllowedEmailConfigured() || !isAllowedEmail(email)) {
    notAuthorized(email);
  }
  const { auth } = ensureApp();
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function signUp(email: string, password: string): Promise<User> {
  if (!isAllowedEmailConfigured() || !isAllowedEmail(email)) {
    notAuthorized(email);
  }
  const { auth } = ensureApp();
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function signOut(): Promise<void> {
  const { auth } = ensureApp();
  await fbSignOut(auth);
}

// Re-export the Firebase User type under a project-local name so callers
// don't have to know the firebase/* import path.
export type FirebaseUser = User;

export function onAuthChanged(cb: (user: User | null) => void): () => void {
  if (!isFirebaseConfigured()) {
    // Fire once with null so callers can render an error state.
    cb(null);
    return () => {};
  }
  const { auth } = ensureApp();
  return onAuthStateChanged(auth, cb);
}
