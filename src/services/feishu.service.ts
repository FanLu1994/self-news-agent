import { createHmac } from 'node:crypto';

interface FeishuOptions {
  enabled: boolean;
  webhookUrl?: string;
  secret?: string;
}

interface FeishuApiResponse {
  code?: number;
  msg?: string;
}

export class FeishuService {
  private readonly MAX_MESSAGE_LENGTH = 4000;

  async sendMessage(options: FeishuOptions & { text: string }): Promise<boolean> {
    if (!options.enabled) return false;

    if (!options.webhookUrl) {
      console.warn('Feishu skipped: FEISHU_WEBHOOK_URL 未配置。');
      return false;
    }

    const chunks = this.splitMessage(options.text, this.MAX_MESSAGE_LENGTH);
    let successCount = 0;

    for (let i = 0; i < chunks.length; i++) {
      const text = chunks.length > 1
        ? `${chunks[i]}\n\n（${i + 1}/${chunks.length}）`
        : chunks[i];

      const ok = await this.sendSingleMessage({
        webhookUrl: options.webhookUrl,
        secret: options.secret,
        text
      });

      if (ok) successCount++;
      if (i < chunks.length - 1) {
        await this.sleep(100);
      }
    }

    console.log(`Feishu 消息发送完成: ${successCount}/${chunks.length} 条成功`);
    return successCount === chunks.length;
  }

  private async sendSingleMessage(options: {
    webhookUrl: string;
    secret?: string;
    text: string;
  }): Promise<boolean> {
    const body: Record<string, unknown> = {
      msg_type: 'text',
      content: {
        text: options.text
      }
    };

    if (options.secret) {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      body.timestamp = timestamp;
      body.sign = this.createSignature(timestamp, options.secret);
    }

    const response = await fetch(options.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`Feishu API ${response.status}: ${responseText}`);
    }

    let data: FeishuApiResponse;
    try {
      data = JSON.parse(responseText) as FeishuApiResponse;
    } catch {
      throw new Error(`Feishu API returned invalid JSON: ${responseText}`);
    }

    if (data.code !== 0) {
      throw new Error(`Feishu API ${data.code ?? 'unknown'}: ${data.msg ?? responseText}`);
    }

    return true;
  }

  private createSignature(timestamp: string, secret: string): string {
    const stringToSign = `${timestamp}\n${secret}`;
    return createHmac('sha256', stringToSign).update('').digest('base64');
  }

  private splitMessage(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > maxLength) {
      let splitIndex = maxLength;
      const searchStart = Math.max(0, maxLength - 200);
      const searchRange = remaining.slice(searchStart, maxLength);
      const lastNewline = searchRange.lastIndexOf('\n');

      if (lastNewline !== -1) {
        splitIndex = searchStart + lastNewline + 1;
      } else {
        const lastPeriod = remaining.slice(0, maxLength).lastIndexOf('。');
        if (lastPeriod !== -1 && lastPeriod > maxLength - 200) {
          splitIndex = lastPeriod + 1;
        }
      }

      chunks.push(remaining.slice(0, splitIndex).trim());
      remaining = remaining.slice(splitIndex).trim();
    }

    if (remaining.length > 0) {
      chunks.push(remaining);
    }

    return chunks;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const feishuService = new FeishuService();
