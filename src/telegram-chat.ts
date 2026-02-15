import { askNewsAgent } from './agent.js';
import { loadConfig } from './config.js';
import { telegramService } from './services/telegram.service.js';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function splitLongMessage(text: string, maxLen: number = 3500): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    chunks.push(text.slice(cursor, cursor + maxLen));
    cursor += maxLen;
  }
  return chunks;
}

export async function runTelegramBotChat(): Promise<void> {
  const config = loadConfig();
  const botToken = config.telegramBotToken;
  const allowedChatId = config.telegramChatId ? String(config.telegramChatId) : undefined;

  if (!botToken) {
    throw new Error('TELEGRAM_BOT_TOKEN 未配置，无法启动 Telegram 对话模式。');
  }

  let offset: number | undefined;
  console.log('Telegram 对话模式已启动，等待消息...');

  while (true) {
    try {
      const updates = await telegramService.getUpdates({
        botToken,
        offset,
        timeoutSeconds: 25
      });

      for (const update of updates) {
        offset = update.update_id + 1;
        const message = update.message;
        if (!message?.text) continue;

        const chatId = String(message.chat.id);
        if (allowedChatId && chatId !== allowedChatId) {
          await telegramService.sendMessage({
            botToken,
            chatId,
            text: '当前机器人未授权此 chat。请联系管理员配置 TELEGRAM_CHAT_ID。'
          });
          continue;
        }

        const text = message.text.trim();
        if (!text) continue;

        if (text === '/start' || text === '/help') {
          await telegramService.sendMessage({
            botToken,
            chatId,
            replyToMessageId: message.message_id,
            text: '直接发送问题即可，我会调用新闻 Agent 回复你。\n示例：获取过去3天 AI Agent 相关新闻并总结趋势。'
          });
          continue;
        }

        const answer = await askNewsAgent(text);
        const chunks = splitLongMessage(answer);

        for (let i = 0; i < chunks.length; i += 1) {
          await telegramService.sendMessage({
            botToken,
            chatId,
            replyToMessageId: i === 0 ? message.message_id : undefined,
            text: chunks[i]
          });
        }
      }
    } catch (error) {
      console.error('Telegram polling error:', error);
      await sleep(3000);
    }
  }
}
