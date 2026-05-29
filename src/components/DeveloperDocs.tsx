/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Copy, Check, Terminal, ExternalLink, Settings, Radio } from 'lucide-react';
import { CLOUDFLARE_WORKER_CODE } from '../data';

export default function DeveloperDocs() {
  const [activeTab, setActiveTab] = useState<'telegram' | 'cloudflare' | 'kv'>('telegram');
  const [copied, setCopied] = useState<boolean>(false);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(CLOUDFLARE_WORKER_CODE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const getTabClass = (tab: 'telegram' | 'cloudflare' | 'kv') => {
    return `px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all cursor-pointer
      ${activeTab === tab
        ? 'border-emerald-500 text-emerald-500 dark:text-emerald-400 font-bold'
        : 'border-transparent text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`;
  };

  return (
    <div
      id="dev-docs-terminal-card"
      className="rounded-2xl border dark:bg-zinc-900 dark:border-zinc-800 bg-white border-zinc-200 overflow-hidden shadow-sm"
    >
      {/* Header Bar styled as a premium IDE terminal tab */}
      <div className="bg-zinc-50 dark:bg-zinc-950 px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1.5 shrink-0">
            <span className="w-3 h-3 rounded-full bg-rose-500/85"></span>
            <span className="w-3 h-3 rounded-full bg-amber-500/85"></span>
            <span className="w-3 h-3 rounded-full bg-emerald-500/85"></span>
          </div>
          <span className="text-xs font-mono font-medium text-zinc-400 dark:text-zinc-500 flex items-center gap-1">
            <Terminal className="w-3.5 h-3.5" /> pipPing-cron-stack.md
          </span>
        </div>
        <span className="text-[10px] font-mono text-zinc-400 px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800">
          PRO FREE ARCHITECTURE
        </span>
      </div>

      {/* Docs tab navigation */}
      <div className="flex border-b border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-950/40 select-none">
        <button id="tab-telegram" onClick={() => setActiveTab('telegram')} className={getTabClass('telegram')}>
          1. Telegram Bot
        </button>
        <button id="tab-cloudflare" onClick={() => setActiveTab('cloudflare')} className={getTabClass('cloudflare')}>
          2. Cloudflare Cron
        </button>
        <button id="tab-kv" onClick={() => setActiveTab('kv')} className={getTabClass('kv')}>
          3. KV Integration
        </button>
      </div>

      <div className="p-6">
        {/* Tab 1: Telegram instructions */}
        {activeTab === 'telegram' && (
          <div id="tab-content-telegram" className="space-y-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded bg-emerald-500/10 text-emerald-500 shrink-0">1</div>
              <div>
                <h4 className="font-bold text-zinc-900 dark:text-zinc-150">Create your Bot Token with BotFather</h4>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Open Telegram and search for the verified bot account <code>@BotFather</code>. Send the command <code>/newbot</code> and follow the prompts to obtain your private API access token.
                </p>
                <div className="mt-2 bg-zinc-50 dark:bg-zinc-950 p-2.5 rounded-xl border border-zinc-200/60 dark:border-zinc-900 font-mono text-xs dark:text-emerald-400 text-emerald-600">
                  TOKEN: 7123456789:AAFgH-someSecretKeyRefSymbolHere
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 rounded bg-emerald-500/10 text-emerald-500 shrink-0">2</div>
              <div>
                <h4 className="font-bold text-zinc-900 dark:text-zinc-150">Acquire your Telegram Chat ID</h4>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Start a chat with your new bot and click or send /start. Then, message <code>@userinfobot</code> in Telegram to instantly request your numerical individual user chat ID.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 rounded bg-emerald-500/10 text-emerald-500 shrink-0">3</div>
              <div>
                <h4 className="font-bold text-zinc-900 dark:text-zinc-150">Configure Channels / Groups</h4>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  If pushing to a public channel or group, add your newly created Bot as an Administrator with &quot;Post Messages&quot; permission. Use the channel&apos;s handle directly in the Chat ID field (e.g., <code>@pip_alerts_group</code>).
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Cloudflare Cron Worker code template & copy action */}
        {activeTab === 'cloudflare' && (
          <div id="tab-content-cloudflare" className="space-y-4">
            <div className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              <p>
                Create a <strong>Cloudflare Worker</strong> (Free tier permits 100,000 runs/day), paste this code, and setup a <strong>Trigger Cron</strong> to call your handler every 1 minute (<code>*/1 * * * *</code>).
              </p>
            </div>

            <div className="relative">
              <div className="absolute right-3.5 top-3.5 z-10">
                <button
                  id="btn-copy-script"
                  onClick={handleCopyCode}
                  className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-semibold shadow-md"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy Script</span>
                    </>
                  )}
                </button>
              </div>

              <pre className="p-5 rounded-xl bg-zinc-50 dark:bg-zinc-950 font-mono text-xs text-zinc-650 dark:text-zinc-300 border border-zinc-200/60 dark:border-zinc-900 overflow-x-auto max-h-[300px] leading-relaxed">
                {CLOUDFLARE_WORKER_CODE}
              </pre>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/10 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
              <Settings className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong>Verify Secrets Variable Names in Cloudflare Console:</strong>
                <p className="mt-1 leading-relaxed">
                  Go to your Cloudflare Worker Settings → Variables and assign: <br />
                  1. <code>TELEGRAM_BOT_TOKEN</code> (from BotFather) <br />
                  2. <code>TWELVE_DATA_API_KEY</code> (get free forex/gold key from twelvedata.com)
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: KV integrations details */}
        {activeTab === 'kv' && (
          <div id="tab-content-kv" className="space-y-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            <h4 className="font-bold text-zinc-900 dark:text-zinc-150 flex items-center gap-1.5">
              <Radio className="w-4 h-4 text-emerald-500 animate-pulse" />
              Dynamic Sync with Cloudflare KV Store
            </h4>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              To fully synchronize this React UI with the background Cloudflare Worker, you can write alerts directly to a **Cloudflare KV namespace**, so the Worker instantly pulls the latest list of user thresholds.
            </p>

            <div className="p-4 rounded-xl border dark:bg-zinc-950 dark:border-zinc-900 bg-zinc-50/50 space-y-2">
              <h5 className="font-bold text-xs text-zinc-800 dark:text-zinc-300 font-mono uppercase">
                Example REST Sync setup:
              </h5>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                In your server backend or via direct edge calls, write to your KV bucket:
              </p>
              <pre className="p-3 rounded-lg dark:bg-zinc-900 bg-zinc-200/50 font-mono text-[11px] text-zinc-750 dark:text-zinc-200 overflow-x-auto">
{`// Write Alert thresholds to Cloudflare KV
await env.PIPPING_ALERTS_KV.put(
  "user_alerts_list",
  JSON.stringify(alertsArray)
);`}
              </pre>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 text-xs border-t border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-400 dark:text-zinc-500">
                Need Twelve Data or Binance API help?
              </span>
              <div className="flex gap-4">
                <a
                  href="https://binance-docs.github.io/apidocs/spot/en/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-emerald-500 text-zinc-500 transition-colors font-medium hover:underline"
                >
                  Binance API <ExternalLink className="w-3 h-3" />
                </a>
                <a
                  href="https://twelvedata.com/docs"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-emerald-500 text-zinc-500 transition-colors font-medium hover:underline"
                >
                  Twelve Data Docs <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
