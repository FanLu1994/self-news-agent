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
  /**
   * Telegram 消息最大长度限制
   */
  private readonly MAX_MESSAGE_LENGTH = 4096;

  /**
   * 发送消息（自动处理长消息分割）
   */
  async sendMessage(options: TelegramOptions & { text: string; replyToMessageId?: number }): Promise<boolean> {
    if (!options.botToken || !options.chatId) {
      console.warn('Telegram credentials not configured, skip Telegram push.');
      return false;
    }

    const text = options.text;

    // 如果消息长度在限制内，直接发送
    if (text.length <= this.MAX_MESSAGE_LENGTH) {
      return await this.sendSingleMessage({
        botToken: options.botToken,
        chatId: options.chatId,
        text,
        replyToMessageId: options.replyToMessageId
      });
    }

    // 消息太长，需要分割发送
    console.log(`消息过长 (${text.length} 字符)，将分割为多条消息发送`);

    const chunks = this.splitMessage(text, this.MAX_MESSAGE_LENGTH);
    let successCount = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const isFirst = i === 0;
      const isLast = i === chunks.length - 1;

      // 为第一条消息添加 reply_to_message_id（如果指定）
      const replyToMessageId = isFirst ? options.replyToMessageId : undefined;

      // 在每条消息前添加序号（除了最后一条）
      let messageText = chunk;
      if (!isLast) {
        messageText = `${chunk}\n\n_（${i + 1}/${chunks.length}，继续...）_`;
      }

      const success = await this.sendSingleMessage({
        botToken: options.botToken,
        chatId: options.chatId,
        text: messageText,
        replyToMessageId
      });

      if (success) {
        successCount++;
      }

      // 避免触发 Telegram 速率限制（每秒最多 30 条消息）
      if (i < chunks.length - 1) {
        await this.sleep(100); // 间隔 100ms
      }
    }

    console.log(`Telegram 消息发送完成: ${successCount}/${chunks.length} 条成功`);
    return successCount === chunks.length;
  }

  /**
   * 发送单条消息
   */
  private async sendSingleMessage(options: {
    botToken: string;
    chatId: string | number;
    text: string;
    replyToMessageId?: number;
  }): Promise<boolean> {
    const api = `https://api.telegram.org/bot${options.botToken}/sendMessage`;
    const response = await fetch(api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: options.chatId,
        text: options.text,
        reply_to_message_id: options.replyToMessageId,
        disable_web_page_preview: false,
        parse_mode: 'Markdown'  // 支持 Markdown 格式
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Telegram API ${response.status}: ${body}`);
    }

    return true;
  }

  /**
   * 智能分割长消息
   * 尽量在换行符处分割，避免截断句子
   */
  private splitMessage(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > maxLength) {
      // 找到最接近 maxLength 的换行符
      let splitIndex = maxLength;

      // 在最后 200 字符内查找换行符
      const searchRange = remaining.slice(maxLength - 200, maxLength + 200);
      const lastNewline = searchRange.lastIndexOf('\n');

      if (lastNewline !== -1) {
        splitIndex = (maxLength - 200) + lastNewline + 1;
      }

      // 如果没找到换行符，尝试在句号处分割
      if (splitIndex === maxLength) {
        const lastPeriod = remaining.slice(0, maxLength).lastIndexOf('。');
        if (lastPeriod !== -1 && lastPeriod > maxLength - 200) {
          splitIndex = lastPeriod + 1;
        }
      }

      // 如果还是没找到，就强制分割
      if (splitIndex === maxLength) {
        splitIndex = maxLength;
      }

      chunks.push(remaining.slice(0, splitIndex).trim());
      remaining = remaining.slice(splitIndex).trim();
    }

    if (remaining.length > 0) {
      chunks.push(remaining);
    }

    return chunks;
  }

  /**
   * 延迟指定毫秒数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
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
