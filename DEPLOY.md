# pipPing — Deploy Guide (Render free tier)

End-to-end steps to put pipPing live on the public internet for free.

**Why Render:** zero billing setup, automatic HTTPS, builds straight from GitHub, deploys on `git push`. The free plan idles after 15 min of inactivity, so we'll keep it warm with a free cron-job ping every 10 min.

**Heads up:** Render free tier has an **ephemeral filesystem** — your alerts (in SQLite) survive restarts but get wiped on every deploy. For a personal tool that's fine. If you want true persistence later we can swap in Supabase free Postgres.

---

## Prerequisites

- A Telegram bot token from `@BotFather`
- Your numerical Telegram chat id (message `@userinfobot` to get it)
- A Twelve Data API key (free tier from https://twelvedata.com)
- This repo pushed to GitHub on the `main` branch

---

## 1. Create the Render service

1. Go to https://render.com → sign up with your GitHub account.
2. Authorize Render to read your repos. You can grant access to **only `pipPing`** (recommended).
3. Top right: **New +** → **Blueprint**.
4. Pick the `pipPing` repo. Render reads `render.yaml` and proposes a service.
5. Click **Apply**.
6. On the secrets prompt, fill in:
   - `TELEGRAM_BOT_TOKEN` — from BotFather
   - `TELEGRAM_CHAT_ID` — from `@userinfobot`
   - `TWELVE_DATA_API_KEY` — from twelvedata.com
7. Click **Create New Resources**.

The first build takes ~3-5 min. Watch the live log; you should see:

```
[server] pipPing listening on :8080
[engine] crypto=60000ms; td=WebSocket+300000ms-fallback
[ws-td] connected
[ws-td] subscribe-status ok=2 (XAU/USD,EUR/USD) fail=2 (USD/JPY,AUD/JPY)
```

Render shows your public URL near the top, like `https://pipping-XXXX.onrender.com`. Open it from your phone.

---

## 2. Set up the keep-alive cron-job (so the service never sleeps)

Render's free plan stops the container after **15 min of no inbound HTTP traffic**. We ping `/api/ping` every 10 min to keep it warm.

1. Go to https://cron-job.org → sign up free (email only, no card).
2. Dashboard → **Create cronjob**.
3. Fill in:
   - **Title:** `pipPing keepalive`
   - **URL:** `https://YOUR-RENDER-HOST.onrender.com/api/ping`
   - **Schedule:** select **Every 10 minutes**
   - **Notifications:** turn on "Notify on failure" (optional, but useful)
4. Save.

That's it. The container will stay warm 24/7. You can verify by checking the cron-job.org execution history — every fire should return `200 OK` with body `pong`.

---

## 3. Verify end-to-end

Open your Render URL on your phone:

1. The pipPing UI loads, XAU/USD ticker comes alive within ~30s.
2. Create an alert — set "Cross price" to a value just above the current XAU/USD price.
3. When XAU/USD crosses, Telegram should DM you within ~1s.

To force a Telegram message right away without waiting for a cross, click **Test Push** on any alert.

---

## 4. Updating later

Push to `main` on GitHub. Render auto-deploys. ~3 min later it's live.

To change an env var: Render dashboard → your service → **Environment** → edit → save (Render redeploys).

---

## Free-tier limits (worth knowing)

- **Render free**: 750 instance-hours/month (= 31 days × 24h, exactly enough). 512 MB RAM. 0.1 CPU. Spin-down after 15 min idle (we prevent this with the cron).
- **cron-job.org**: 60 jobs free, every 1 min minimum. Very generous.
- **Twelve Data Basic**: 800 credits/day, 8 calls/min. Most free pairs accepted on WS, JPY pairs gated → polled every 5 min.
- **Binance**: free, no key needed, ~1200 weight/min limit. Negligible at our usage.
- **Telegram Bot API**: free, no quota worth caring about.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Render build fails on `npm ci` | `package-lock.json` out of sync | Locally run `rm -rf node_modules package-lock.json && npm install`, commit the new lock file, push |
| `subscribe-status fail=4` | TD plan rejects all symbols | Check the `TWELVE_DATA_API_KEY` env var is correct in Render |
| No Telegram DM ever | Wrong `TELEGRAM_CHAT_ID` | Send any message to your bot first, then re-fetch your chat_id from `@userinfobot` |
| Alerts vanish overnight | Container restarted (rare) | Expected on free tier — recreate. Migrate to Supabase Postgres if it bothers you. |
| `/api/ping` returns 502 | Service is asleep, mid-spin-up | Wait 30-60s, ping again. Confirm cron-job.org is running every 10 min. |
