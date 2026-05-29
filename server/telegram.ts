/**
 * Telegram sender. Outbound only: we POST to api.telegram.org/sendMessage.
 * No webhook, no polling, no inbound bot commands in v1.
 */

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
        parse_mode: 'Markdown',
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
