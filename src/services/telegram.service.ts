interface TelegramOptions {
  botToken?: string;
  chatId?: string | number;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: {
      id: number;
      type: string;
    };
  };
}

export class TelegramService {
  async sendMessage(options: TelegramOptions & { text: string; replyToMessageId?: number }): Promise<boolean> {
    if (!options.botToken || !options.chatId) {
      console.warn('Telegram credentials not configured, skip Telegram push.');
      return false;
    }

    const api = `https://api.telegram.org/bot${options.botToken}/sendMessage`;
    const response = await fetch(api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: options.chatId,
        text: options.text,
        reply_to_message_id: options.replyToMessageId,
        disable_web_page_preview: false
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Telegram API ${response.status}: ${body}`);
    }

    return true;
  }

  async getUpdates(options: { botToken?: string; offset?: number; timeoutSeconds?: number }): Promise<TelegramUpdate[]> {
    if (!options.botToken) {
      return [];
    }

    const url = new URL(`https://api.telegram.org/bot${options.botToken}/getUpdates`);
    if (typeof options.offset === 'number') {
      url.searchParams.set('offset', String(options.offset));
    }
    url.searchParams.set('timeout', String(options.timeoutSeconds ?? 25));

    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Telegram getUpdates ${response.status}: ${body}`);
    }

    const data = await response.json() as { ok: boolean; result?: TelegramUpdate[] };
    if (!data.ok || !Array.isArray(data.result)) {
      return [];
    }
    return data.result;
  }
}

export const telegramService = new TelegramService();
