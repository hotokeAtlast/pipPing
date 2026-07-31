/**
 * Express middleware: verify Firebase Auth ID token from the
 * `Authorization: Bearer <token>` header.
 *
 * On success, attaches `req.user = { uid, email }`.
 * On failure, returns 401 (no/expired token) or 403 (token valid but
 * the email is not the allowed owner of this private instance).
 *
 * Single-user mode: only the email in the `ALLOWED_EMAIL` env var can use
 * the API. The same check is enforced on the client in `src/firebase.ts`
 * (defence in depth). The env var is read at module load — change it
 * requires a server restart.
 *
 * If `ALLOWED_EMAIL` is not set, every authenticated request is rejected
 * with 403 (fail closed) and a warning is logged at startup.
 */

import type { Request, Response, NextFunction } from 'express';
import { getAuth } from 'firebase-admin/auth';

const allowedEmailRaw = (process.env.ALLOWED_EMAIL || '').trim();
const allowedEmailLower = allowedEmailRaw.toLowerCase();

if (!allowedEmailLower) {
  console.warn(
    '[auth] ALLOWED_EMAIL env var is not set. The server will reject every API request with 403. ' +
      'Set it in your .env (see .env.example) and restart the server.',
  );
} else {
  // Don't print the email at startup — keep it out of the server log too.
  console.log(`[auth] private instance — API restricted to a single configured email`);
}

/** Public, for the 403 error message. Falls back to a generic string. */
export const ALLOWED_EMAIL = allowedEmailRaw || '<unset>';

export interface AuthedUser {
  uid: string;
  email?: string;
}

export interface AuthedRequest extends Request {
  user?: AuthedUser;
}

function isAllowedEmail(email: string | undefined): boolean {
  if (!email || !allowedEmailLower) return false;
  return email.trim().toLowerCase() === allowedEmailLower;
}

export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Fail closed: if the env var isn't set, refuse every API call.
  if (!allowedEmailLower) {
    res.status(403).json({
      error: 'forbidden',
      message: 'Server is not configured. Set ALLOWED_EMAIL in the server env and restart.',
    });
    return;
  }
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'missing or invalid Authorization header' });
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'empty bearer token' });
    return;
  }
  try {
    const decoded = await getAuth().verifyIdToken(token);
    if (!isAllowedEmail(decoded.email)) {
      // Don't log the rejected email either — keeps the server log clean
      // and avoids the email being scraped from logs / log aggregators.
      console.warn('[auth] rejected: signed-in user is not the configured owner');
      res.status(403).json({
        error: 'forbidden',
        message: 'This instance is private.',
      });
      return;
    }
    req.user = { uid: decoded.uid, email: decoded.email };
    next();
  } catch (err) {
    console.warn('[auth] verifyIdToken failed:', (err as Error).message);
    res.status(401).json({ error: 'invalid or expired token' });
  }
}
