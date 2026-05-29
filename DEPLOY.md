# pipPing — VM Deploy Guide

End-to-end steps to run pipPing on a free GCP e2-micro VM with Telegram push alerts.

---

## 0. Prerequisites

- GCP account (the $300 trial is fine to bootstrap; the VM stays free after the trial in eligible regions)
- A Telegram bot token from `@BotFather`
- Your numerical Telegram chat id (message `@userinfobot` to get it)
- A Twelve Data API key (https://twelvedata.com — free tier)

---

## 1. Create the e2-micro VM

The Always-Free tier requires:

- Machine type: **e2-micro**
- Region: **us-west1**, **us-central1**, or **us-east1** (no other region qualifies)
- Disk: standard persistent disk, 30 GB or less
- OS: Debian 12 or Ubuntu 22.04+

In the GCP console: Compute Engine → VM instances → Create.

After the VM is up, SSH in via the GCP console.

---

## 2. Install runtime

```bash
sudo apt update
sudo apt install -y git
```

Install Node 24 LTS (required — pipPing uses Node's built-in SQLite which needs Node >= 24.15):

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # should be >= 24.15
```

> No native compilation toolchain is needed. pipPing has zero native dependencies.

---

## 3. Clone the repo

```bash
sudo mkdir -p /opt/pipping
sudo chown $USER:$USER /opt/pipping
git clone https://github.com/hotokeAtlast/pipPing /opt/pipping
cd /opt/pipping
```

---

## 4. Install + build

```bash
npm ci
npm run build      # produces dist/ which the server will serve
```

---

## 5. Configure environment

```bash
cp .env.example .env
nano .env
```

Fill in:

```
TELEGRAM_BOT_TOKEN=123456:AAFg...your_token...
TELEGRAM_CHAT_ID=542981358
TWELVE_DATA_API_KEY=your_twelvedata_key
PORT=8080
POLL_INTERVAL_MS=120000
```

---

## 6. First run (verify Telegram works)

```bash
npm start
```

You should see:

```
[server] pipPing listening on :8080
[engine] poll loop every 120000ms
```

In another terminal (or via the web UI on port 8080), create a tiny alert that will fire immediately, e.g. BTC `above 1`. Within ~2 minutes the bot should DM you on Telegram.

Stop the foreground process with Ctrl-C once verified.

---

## 7. Run as a systemd service

Create a dedicated user and install the unit file:

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin pipping || true
sudo chown -R pipping:pipping /opt/pipping

sudo cp /opt/pipping/deploy/pipping.service /etc/systemd/system/pipping.service
sudo systemctl daemon-reload
sudo systemctl enable --now pipping
sudo systemctl status pipping
```

Tail logs:

```bash
sudo journalctl -u pipping -f
```

---

## 8. Open the firewall

In the GCP console: VPC network → Firewall → Create firewall rule.

- Name: `allow-pipping`
- Targets: All instances in the network (or a specific tag)
- Source IP ranges: `0.0.0.0/0` (or restrict to your IP)
- Protocols and ports: `tcp:8080`

You can now reach the UI at `http://<vm-external-ip>:8080`.

> **Recommended:** put a reverse proxy (Caddy) in front to add free TLS via Let's Encrypt and serve on `:443`. Out of scope for v1.

---

## 9. Updates

```bash
cd /opt/pipping
sudo -u pipping git pull
sudo -u pipping npm ci
sudo -u pipping npm run build
sudo systemctl restart pipping
```

---

## Free-tier quota math (for reference)

- **Twelve Data**: 800 calls/day, 8 calls/min on free tier. With `POLL_INTERVAL_MS=120000` and all 4 forex/gold symbols batched into one call per tick: 720 calls/day. ✅ under quota.
- **Binance**: public ticker, no auth, ~1200 weight/min limit. We use ~3 calls/tick for crypto. Negligible.
- **GCP e2-micro**: 1 instance free in eligible regions, 30 GB disk, 1 GB egress/month. Idle pipPing uses well under the egress cap.
- **Telegram Bot API**: free, no quota worth caring about for personal use.
