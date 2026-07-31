/**
 * Telegram sender. Outbound only: we POST to api.telegram.org/sendMessage.
 * No webhook, no polling, no inbound bot commands.
 */

export interface TelegramAlertContext {
  symbol: string;          // e.g. "EUR/USD"
  category: string;        // forex | crypto | gold | ...
  label: string;           // user's freeform label for the alert
  targetPrice: number;     // the threshold the user set
  triggerPrice: number;    // the actual price when the alert fired
  direction: 'above' | 'below';
  isTest?: boolean;
  source?: string;         // "Binance" | "TwelveData WS" | "TwelveData REST" etc.
  firedAt?: Date;
}

const ASSET_ICON: Record<string, string> = {
  forex: '💱',
  crypto: '🪙',
  gold: '🥇',
  commodity: '🥈',
  index: '📊',
};

function fmtPrice(price: number, category: string): string {
  if (!isFinite(price)) return String(price);
  const decimals = category === 'forex' ? 5 : 2;
  return price.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Build the message body sent to Telegram.
 * Uses HTML parse_mode (more forgiving than Markdown for user-supplied labels).
 */
export function buildAlertMessage(ctx: TelegramAlertContext): string {
  const icon = ASSET_ICON[ctx.category] || '📈';
  const arrow = ctx.direction === 'above' ? '⬆️' : '⬇️';
  const headline = ctx.isTest ? '🧪 pipPing — TEST' : '🔔 pipPing alert';
  const verb = ctx.direction === 'above' ? 'crossed above' : 'dropped below';
  const time = (ctx.firedAt ?? new Date()).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  });

  // diff between actual and target, for context
  const diff = ctx.triggerPrice - ctx.targetPrice;
  const diffSign = diff >= 0 ? '+' : '';
  const diffPct = (diff / ctx.targetPrice) * 100;
  const diffStr = `${diffSign}${fmtPrice(diff, ctx.category)} (${diffSign}${diffPct.toFixed(2)}%)`;

  return [
    `<b>${headline}</b>`,
    '',
    `${icon} <b>${escapeHtml(ctx.symbol)}</b> ${arrow} ${verb} <b>${fmtPrice(ctx.targetPrice, ctx.category)}</b>`,
    '',
    `💰 Now: <b>${fmtPrice(ctx.triggerPrice, ctx.category)}</b>`,
    `📐 Δ vs target: <code>${diffStr}</code>`,
    `🏷 ${escapeHtml(ctx.label)}`,
    `🕒 ${escapeHtml(time)}${ctx.source ? ` · <i>${escapeHtml(ctx.source)}</i>` : ''}`,
  ].join('\n');
}

export async function sendTelegram(token: string, chatId: string, text: string): Promise<boolean> {
  if (!token) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN is empty - skipping send');
    return false;
  }
  if (!chatId) {
    console.warn('[telegram] chatId is empty - skipping send');
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.warn(`[telegram] sendMessage failed status=${res.status} body=${body}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[telegram] sendMessage error', err);
    return false;
  }
}
