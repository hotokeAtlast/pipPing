# pipPing

Self-hosted, unlimited price alerts for forex, gold and crypto — pushed to Telegram.

- **Frontend:** React 19 + Vite + TypeScript + Tailwind v4
- **Backend:** single Node process — Express API + price-poll engine + Telegram sender
- **Auth + Storage:** Firebase — Email/password auth (client SDK) + Firestore (Admin SDK on server). Alerts, logs and the price cache live in Firestore, so they survive container restarts and deploys.
- **Price data:** Binance (crypto, free) + Twelve Data (forex/gold, free tier)
- **Notifications:** Telegram bot (free, unlimited)
- **Deploy target:** Render free tier (one-click via `render.yaml`), or any host running Node 24.15+

## Quick start (local dev)

```bash
npm install
cp .env.example .env       # fill in TELEGRAM_*, TWELVE_DATA_API_KEY, Firebase vars + ALLOWED_EMAIL
npm run dev                # runs Vite (port 3000) and the API (port 8080) together
```

Open http://localhost:3000.

The first screen is a sign-in page. **pipPing is a single-user instance** —
the email is read from the `ALLOWED_EMAIL` env var (server) and the
`VITE_ALLOWED_EMAIL` env var (client). Both must be set to the same value
and the same address. Any other email is rejected on both the client
(before reaching Firebase) and the server (with a 403 on every API call).

> The email is **not** committed to the repo — it's only in your local
> `.env` (which is gitignored) and in your hosting provider's env-var UI.

Firebase Auth handles accounts; the server verifies the ID token on every API
call, then reads/writes Firestore.

## Production (single process)

```bash
npm ci
npm run build              # builds the frontend into dist/
npm start                  # serves dist/ + /api on $PORT (default 8080)
```

See [DEPLOY.md](./DEPLOY.md) for the Render free-tier walkthrough (it covers
the Firebase setup).

## How alerts fire

1. UI sends `POST /api/alerts` with the asset, condition, and target price.
2. The engine polls Binance + Twelve Data every `POLL_INTERVAL_MS` (default 2 min).
3. When an active alert's condition is met, the backend sends a Telegram message and marks the alert inactive (so it can't double-fire on the next tick).
4. Toggle the alert back on from the UI to re-arm it.

## Useful endpoints

- `GET /api/health` — env var status, poll interval
- `GET /api/alerts` / `POST /api/alerts` / `PATCH /api/alerts/:id` / `DELETE /api/alerts/:id`
- `POST /api/alerts/:id/test` — sends an immediate Telegram message for an alert (useful for verifying setup)
- `GET /api/logs` — notification history
- `GET /api/prices` — last cached price per asset
- `GET /api/ping` — lightweight keep-alive (no auth)

All `/api/*` endpoints except `/api/health` and `/api/ping` require a valid
`Authorization: Bearer <firebase-id-token>` header. The React app sends this
automatically.

## License

Apache-2.0
