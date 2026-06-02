# pipPing — Deploy Guide (Render free tier)

End-to-end steps to put pipPing live on the public internet for free.

**Why Render:** zero billing setup, automatic HTTPS, builds straight from GitHub, deploys on `git push`. The free plan idles after 15 min of inactivity, so we'll keep it warm with a free cron-job ping every 10 min.

pipPing uses **Firebase** for both auth and persistence:
- **Firebase Auth** (email/password) — every API call is gated by an ID token
- **Cloud Firestore** — alerts, logs and the price cache live here, so they survive deploys and container restarts

---

## Prerequisites

- A Telegram bot token from `@BotFather`
- Your numerical Telegram chat id (message `@userinfobot` to get it)
- A Twelve Data API key (free tier from https://twelvedata.com)
- A Firebase project (free Spark plan is fine) — https://console.firebase.google.com
- This repo pushed to GitHub on the `main` branch

---

## 1. Create the Firebase project

1. Go to https://console.firebase.google.com → **Add project** → name it (e.g. `pipping`) → continue (disable Analytics, you don't need it).
2. **Enable Email/Password auth:** Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.
3. **Enable Firestore:** Build → Firestore Database → Create database → Production mode → pick a region (e.g. `asia-south1` for India). Don't worry about rules for now — the Admin SDK bypasses them.
4. **Get the web app config:** Project settings (gear icon) → General → Your apps → click `</>` to add a **Web app** → register it → copy the `firebaseConfig` values:
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `appId`
5. **Get a service account key (server-side secret):** Project settings → **Service accounts** tab → **Generate new private key** → download the JSON file. Keep it secret — anyone with it has full access to your Firestore.

---

## 2. Create the Render service

1. Go to https://render.com → sign up with your GitHub account.
2. Authorize Render to read your repos. You can grant access to **only `pipPing`** (recommended).
3. Top right: **New +** → **Blueprint**.
4. Pick the `pipPing` repo. Render reads `render.yaml` and proposes a service.
5. Click **Apply**.
6. On the secrets prompt, fill in:

   **Public (Firebase web config — safe to expose):**
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_APP_ID`

   **Secrets:**
   - `TELEGRAM_BOT_TOKEN` — from BotFather
   - `TELEGRAM_CHAT_ID` — from `@userinfobot`
   - `TWELVE_DATA_API_KEY` — from twelvedata.com
   - `FIREBASE_SERVICE_ACCOUNT_JSON` — open the JSON file you downloaded in step 1, copy the **entire contents** (one big line), and paste it in.

7. Click **Create New Resources**.

The first build takes ~3-5 min. Watch the live log; you should see:

```
[firebase] initialized from FIREBASE_SERVICE_ACCOUNT_JSON
[server] pipPing listening on :8080
[engine] crypto=60000ms; td=WebSocket+300000ms-fallback
[ws-td] connected
```

Render shows your public URL near the top, like `https://pipping-XXXX.onrender.com`. Open it from your phone.

---

## 3. Set up the keep-alive cron-job (so the service never sleeps)

Render's free plan stops the container after **15 min of no inbound HTTP traffic**. We ping `/api/ping` every 10 min to keep it warm.

1. Go to https://cron-job.org → sign up free (email only, no card).
2. Dashboard → **Create cronjob**.
3. Fill in:
   - **Title:** `pipPing keepalive`
   - **URL:** `https://YOUR-RENDER-HOST.onrender.com/api/ping`
   - **Schedule:** select **Every 10 minutes**
   - **Notifications:** turn on "Notify on failure" (optional, but useful)
4. Save.

That's it. The container will stay warm 24/7.

---

## 4. Verify end-to-end

Open your Render URL on your phone:

1. The pipPing sign-in screen loads.
2. Click **Create an account**, enter any email + a 6+ character password. The account is created in Firebase Auth.
3. The dashboard loads, XAU/USD ticker comes alive within ~30s. The 24h change % next to each pair is now live too.
4. Click the **top half** of any ticker card (symbol + price) to load that pair into the create-alert form.
5. Click the **bottom half** of any ticker card (24h change + sparkline) to open a full-screen candlestick chart for that pair, with your existing alerts drawn as horizontal lines and past triggers marked on the timeline. Use the interval switcher (1m / 5m / 15m / 1h / 4h / 1D) to zoom in or out.
6. Create an alert — set "Cross price" to a value just above the current XAU/USD price.
7. When XAU/USD crosses, Telegram should DM you within ~1s.

To force a Telegram message right away without waiting for a cross, click **Test Push** on any alert. The "Alert at current" button inside the chart modal creates a new alert with the current price as the threshold, ready for you to save.

---

## 5. Updating later

Push to `main` on GitHub. Render auto-deploys. ~3 min later it's live.

To change an env var: Render dashboard → your service → **Environment** → edit → save (Render redeploys).

---

## Free-tier limits (worth knowing)

- **Render free**: 750 instance-hours/month (= 31 days × 24h, exactly enough). 512 MB RAM. 0.1 CPU. Spin-down after 15 min idle (we prevent this with the cron).
- **cron-job.org**: 60 jobs free, every 1 min minimum. Very generous.
- **Twelve Data Basic**: 800 credits/day, 8 calls/min. Most free pairs accepted on WS, JPY pairs gated → polled every 5 min. The chart history endpoint uses `/time_series` (1 credit per request) — opening a chart for a forex/gold pair costs 1 credit. Crypto chart history goes through Binance, no key needed.
- **Binance**: free, no key needed, ~1200 weight/min limit. Negligible at our usage.
- **Telegram Bot API**: free, no quota worth caring about.
- **Firebase Auth**: free for the volumes we'll use.
- **Firestore (Spark plan)**: 1 GiB storage, 50K reads/day, 20K writes/day. pipPing's polling engine does ~5 reads + ~5 writes every minute, so you can run 24/7 comfortably on the free tier.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Render build fails on `npm ci` | `package-lock.json` out of sync | Locally run `rm -rf node_modules package-lock.json && npm install`, commit the new lock file, push |
| Login screen shows "Firebase client config missing" | Missing VITE_FIREBASE_* env vars | Add them in Render → Environment, redeploy |
| Sign-in returns `400` from Firebase | Auth not enabled | Firebase Console → Authentication → Sign-in method → enable Email/Password |
| `firebase-admin` throws "unable to find credentials" | `FIREBASE_SERVICE_ACCOUNT_JSON` empty or malformed | Re-copy the JSON; validate it parses with `JSON.parse` |
| 24h change always `0.00%` | Twelvedata /quote returned 400/404 for one of the symbols | The engine falls back to the last good value; the next poll will retry. If it persists, check the symbol list in `server/prices.ts` against your TD plan. |
| Chart shows "Could not load history" | Binance or Twelve Data rate-limited / no permission | Crypto uses Binance (no key) — should always work. Forex/gold uses `/time_series` which may be gated on the Basic plan; if it fails, the rest of the app still works, only the chart for that pair is empty. |
| `subscribe-status fail=4` | TD plan rejects all symbols | Check the `TWELVE_DATA_API_KEY` env var is correct in Render |
| No Telegram DM ever | Wrong `TELEGRAM_CHAT_ID` | Send any message to your bot first, then re-fetch your chat_id from `@userinfobot` |
| `/api/ping` returns 502 | Service is asleep, mid-spin-up | Wait 30-60s, ping again. Confirm cron-job.org is running every 10 min. |
