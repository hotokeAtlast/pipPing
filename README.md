# pipPing

Self-hosted, unlimited price alerts for forex, gold and crypto — pushed to Telegram.

- **Frontend:** React 19 + Vite + TypeScript + Tailwind v4
- **Backend:** single Node process — Express API + price-poll engine + Telegram sender
- **Storage:** SQLite via Node's built-in `node:sqlite` (zero native deps, **requires Node 24.15+**)
- **Price data:** Binance (crypto, free) + Twelve Data (forex/gold, free tier)
- **Notifications:** Telegram bot (free, unlimited)
- **Deploy target:** GCP e2-micro Always-Free VM (or anything that runs Node 24.15+)

## Quick start (local dev)

```bash
npm install
cp .env.example .env       # fill in TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TWELVE_DATA_API_KEY
npm run dev                # runs Vite (port 3000) and the API (port 8080) together
```

Open http://localhost:3000.

## Production (single process)

```bash
npm ci
npm run build              # builds the frontend into dist/
npm start                  # serves dist/ + /api on $PORT (default 8080)
```

See [DEPLOY.md](./DEPLOY.md) for the full GCP VM walkthrough.

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

## License

Apache-2.0
