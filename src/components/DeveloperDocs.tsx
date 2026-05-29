/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Terminal, ExternalLink, Settings, Server } from 'lucide-react';

export default function DeveloperDocs() {
  const [activeTab, setActiveTab] = useState<'telegram' | 'vm' | 'apis'>('telegram');

  const tabClass = (tab: 'telegram' | 'vm' | 'apis') =>
    `px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all cursor-pointer
      ${
        activeTab === tab
          ? 'border-emerald-500 text-emerald-500 dark:text-emerald-400 font-bold'
          : 'border-transparent text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
      }`;

  return (
    <div className="rounded-2xl border dark:bg-zinc-900 dark:border-zinc-800 bg-white border-zinc-200 overflow-hidden shadow-sm">
      <div className="bg-zinc-50 dark:bg-zinc-950 px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1.5 shrink-0">
            <span className="w-3 h-3 rounded-full bg-rose-500/85"></span>
            <span className="w-3 h-3 rounded-full bg-amber-500/85"></span>
            <span className="w-3 h-3 rounded-full bg-emerald-500/85"></span>
          </div>
          <span className="text-xs font-mono font-medium text-zinc-400 dark:text-zinc-500 flex items-center gap-1">
            <Terminal className="w-3.5 h-3.5" /> pipPing-setup.md
          </span>
        </div>
        <span className="text-[10px] font-mono text-zinc-400 px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/50 dark:border-zinc-800">
          GCP ALWAYS-FREE STACK
        </span>
      </div>

      <div className="flex border-b border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-950/40 select-none">
        <button onClick={() => setActiveTab('telegram')} className={tabClass('telegram')}>
          1. Telegram
        </button>
        <button onClick={() => setActiveTab('vm')} className={tabClass('vm')}>
          2. GCP VM
        </button>
        <button onClick={() => setActiveTab('apis')} className={tabClass('apis')}>
          3. Price APIs
        </button>
      </div>

      <div className="p-6">
        {activeTab === 'telegram' && (
          <div className="space-y-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded bg-emerald-500/10 text-emerald-500 shrink-0">1</div>
              <div>
                <h4 className="font-bold text-zinc-900 dark:text-zinc-150">Create your bot</h4>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Open Telegram, search for <code>@BotFather</code>, send <code>/newbot</code>, follow the prompts. Save the bot token.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 rounded bg-emerald-500/10 text-emerald-500 shrink-0">2</div>
              <div>
                <h4 className="font-bold text-zinc-900 dark:text-zinc-150">Get your chat id</h4>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Send any message to your new bot, then message <code>@userinfobot</code> on Telegram. It will reply with your numerical chat id (e.g. <code>542981358</code>).
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 rounded bg-emerald-500/10 text-emerald-500 shrink-0">3</div>
              <div>
                <h4 className="font-bold text-zinc-900 dark:text-zinc-150">Configure the server</h4>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Put both values in <code>.env</code>:
                </p>
                <pre className="mt-2 p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/60 dark:border-zinc-900 font-mono text-[11px] text-zinc-600 dark:text-zinc-300 overflow-x-auto">
{`TELEGRAM_BOT_TOKEN=123456:AA...
TELEGRAM_CHAT_ID=542981358`}
                </pre>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'vm' && (
          <div className="space-y-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Deploy on a GCP <strong>e2-micro</strong> in <code>us-west1</code>, <code>us-central1</code>, or <code>us-east1</code> to stay in the Always-Free tier. See <code>DEPLOY.md</code> in the repo for the full step-by-step.
            </p>

            <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/60 dark:border-zinc-900 font-mono text-[11px] text-zinc-600 dark:text-zinc-300 space-y-1">
              <div className="text-emerald-500"># on the VM</div>
              <div>sudo apt install -y nodejs npm git build-essential python3</div>
              <div>git clone https://github.com/&lt;you&gt;/pipPing /opt/pipping</div>
              <div>cd /opt/pipping && npm ci && npm run build</div>
              <div>cp .env.example .env && nano .env</div>
              <div>npm start</div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/10 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
              <Settings className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong>Run as a service:</strong> use the <code>deploy/pipping.service</code> systemd unit so the process restarts on crash and survives reboot.
              </div>
            </div>
          </div>
        )}

        {activeTab === 'apis' && (
          <div className="space-y-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            <h4 className="font-bold text-zinc-900 dark:text-zinc-150 flex items-center gap-1.5">
              <Server className="w-4 h-4 text-emerald-500" />
              Price data sources
            </h4>
            <ul className="text-xs text-zinc-500 dark:text-zinc-400 space-y-2 leading-relaxed">
              <li>
                <strong>Binance</strong> — public ticker for crypto. No key required, effectively unlimited.
              </li>
              <li>
                <strong>Twelve Data</strong> — forex and gold. Free tier: <strong>800 calls/day, 8/min</strong>. The backend batches all forex/gold symbols into a single call per poll cycle, and defaults to a 2-min interval (≈720 calls/day).
              </li>
            </ul>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 text-xs border-t border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-400 dark:text-zinc-500">References</span>
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
