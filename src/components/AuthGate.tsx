/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Sign-in screen. Email + password via Firebase Auth.
 *
 * Single-user mode: the email is hardcoded to ALLOWED_EMAIL (from
 * `firebase.ts`). Sign-up is disabled at the UI level — Firebase will still
 * accept a new sign-up on first run via `signUp`, but the server middleware
 * rejects anything that isn't the allowed email.
 */

import { useState, type FormEvent } from 'react';
import { LogIn, Mail, Lock, AlertCircle, Loader2, ShieldAlert, Settings } from 'lucide-react';
import { signIn, ALLOWED_EMAIL, isAllowedEmailConfigured } from '../firebase';

interface AuthGateProps {
  configured: boolean;
}

const MIN_PASSWORD_LEN = 6;

function friendlyAuthError(code: string, message: string): string {
  switch (code) {
    case 'pipping/not-authorized':
      return 'This app is private. Only the configured owner can sign in.';
    case 'auth/invalid-email':
      return 'That email address looks malformed.';
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Wrong email or password.';
    case 'auth/email-already-in-use':
      return 'An account with that email already exists. Try signing in.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a minute and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection.';
    default:
      return message || 'Authentication failed.';
  }
}

export default function AuthGate({ configured }: AuthGateProps) {
  // Email is pre-filled and locked to the allowed owner. The form rejects
  // any edit, so there's no surface for the wrong email to even reach
  // Firebase (and `signIn()` also re-checks).
  const [email] = useState<string>(ALLOWED_EMAIL);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ----- Missing Firebase config -----
  if (!configured) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-4 sm:p-6 pt-safe bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50">
        <div className="max-w-lg w-full p-5 sm:p-6 rounded-2xl border border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300 text-sm space-y-2">
          <h2 className="font-bold text-base flex items-center gap-2">
            <AlertCircle className="w-5 h-5" /> Firebase client config missing
          </h2>
          <p>
            Set the following <code className="font-mono">VITE_FIREBASE_*</code> env vars
            in <code className="font-mono">.env</code> and rebuild:
          </p>
          <ul className="list-disc pl-6 font-mono text-xs space-y-0.5">
            <li>VITE_FIREBASE_API_KEY</li>
            <li>VITE_FIREBASE_AUTH_DOMAIN</li>
            <li>VITE_FIREBASE_PROJECT_ID</li>
            <li>VITE_FIREBASE_APP_ID</li>
          </ul>
          <p className="text-xs">
            See <code className="font-mono">.env.example</code> and <code className="font-mono">DEPLOY.md</code>.
          </p>
        </div>
      </div>
    );
  }

  // ----- Missing VITE_ALLOWED_EMAIL -----
  if (!isAllowedEmailConfigured()) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-4 sm:p-6 pt-safe bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50">
        <div className="max-w-lg w-full p-5 sm:p-6 rounded-2xl border border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-300 text-sm space-y-2">
          <h2 className="font-bold text-base flex items-center gap-2">
            <Settings className="w-5 h-5" /> Owner email not configured
          </h2>
          <p>
            The single-user email is read from the <code className="font-mono">VITE_ALLOWED_EMAIL</code> env
            var and is not set. The sign-in form is disabled until it is.
          </p>
          <p>
            Edit <code className="font-mono">.env</code> and set:
          </p>
          <pre className="font-mono text-xs bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5">
VITE_ALLOWED_EMAIL=you@example.com
ALLOWED_EMAIL=you@example.com
          </pre>
          <p className="text-xs">
            Both vars must match. The server <code className="font-mono">ALLOWED_EMAIL</code> is the
            real gate — the client value only controls the form. Then rebuild (<code>npm run build</code>).
          </p>
        </div>
      </div>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!password) {
      setError('Password is required.');
      return;
    }
    if (password.length < MIN_PASSWORD_LEN) {
      setError(`Password must be at least ${MIN_PASSWORD_LEN} characters.`);
      return;
    }
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (err) {
      const e = err as { code?: string; message?: string };
      setError(friendlyAuthError(e.code || '', e.message || ''));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4 sm:p-6 pt-safe bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-50 font-sans">
      <div className="absolute top-0 left-1/4 w-[400px] h-[300px] rounded-full blur-[160px] bg-emerald-500/5 pointer-events-none hidden dark:block" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[400px] rounded-full blur-[180px] bg-emerald-600/5 pointer-events-none hidden dark:block" />

      <div className="max-w-md w-full relative z-10">
        <div className="flex items-center gap-2 mb-6">
          <span className="flex h-3.5 w-3.5 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
          </span>
          <h1 className="text-2xl font-bold tracking-tight">pipPing</h1>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800 text-zinc-500 font-medium">
            v0.1
          </span>
        </div>

        <div className="p-6 rounded-2xl border bg-white dark:bg-zinc-900/40 border-zinc-200 dark:border-zinc-800 shadow-sm">
          <h2 className="text-lg font-semibold mb-1">Sign in</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-5">
            Welcome back. Sign in to manage your price alerts.
          </p>

          <form onSubmit={onSubmit} className="space-y-3.5">
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                Email
              </span>
              <div className="mt-1 relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                <input
                  type="email"
                  autoComplete="email"
                  required
                  readOnly
                  value={email}
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border bg-zinc-100/70 dark:bg-zinc-950/40 border-zinc-200 dark:border-zinc-800 text-sm text-zinc-500 dark:text-zinc-400 cursor-not-allowed select-all"
                />
              </div>
            </label>

            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                Password
              </span>
              <div className="mt-1 relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                  minLength={MIN_PASSWORD_LEN}
                  autoFocus
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg border bg-zinc-50 dark:bg-zinc-950/40 border-zinc-200 dark:border-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/60 disabled:opacity-50"
                  placeholder="••••••••"
                />
              </div>
            </label>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg border border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              Sign in
            </button>
          </form>
        </div>

        <div className="mt-4 flex items-center justify-center gap-1.5 text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">
          <ShieldAlert className="w-3 h-3" />
          Private instance · restricted to {ALLOWED_EMAIL}
        </div>
      </div>
    </div>
  );
}
