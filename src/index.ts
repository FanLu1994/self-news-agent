/**
 * AI 新闻 Agent 主入口
 * 
 * 教学要点：
 * 1. 命令行参数解析
 * 2. 环境变量检查
 * 3. Agent 启动
 */

import { runDigestPipeline } from './digest.js';

const FLAG_AGENT = '--agent';
const FLAG_DIGEST = '--digest';
const FLAG_TELEGRAM = '--telegram';

function parseQuery(args: string[]): string {
  const cleaned = args.filter(arg => ![FLAG_AGENT, FLAG_DIGEST, FLAG_TELEGRAM].includes(arg));
  return cleaned.join(' ').trim() || getDefaultQuery();
}

async function main() {
  const args = process.argv.slice(2);

  try {
    if (args.includes(FLAG_AGENT)) {
      const { runNewsAgent } = await import('./agent.js');
      console.log('启动 AI 新闻 Agent 模式...\n');
      await runNewsAgent(parseQuery(args));
      process.exit(0);
    }

    if (args.includes(FLAG_DIGEST)) {
      console.log('启动新闻聚合流水线模式...\n');
      await runDigestPipeline();
      console.log('\n✅ 流水线完成，程序退出');
      process.exit(0);
    }

    const { runTelegramBotChat } = await import('./telegram-chat.js');
    console.log('启动 Telegram 对话模式...\n');
    await runTelegramBotChat();
  } catch (error) {
    console.error('致命错误:', error);
    process.exit(1);
  }
}

/**
 * 获取默认查询
 */
function getDefaultQuery(): string {
  const defaultQueries = [
    '获取过去一周的最新 AI 新闻，重点关注重大突破和趋势。提供详细分析。',
    '展示大语言模型和 AI 应用的最新发展。',
    '本周最重要的 AI 新闻是什么？',
    '获取最近的 AI 新闻并分析关键趋势和行业影响。',
  ];

  // 随机选择一个默认查询
  const randomIndex = Math.floor(Math.random() * defaultQueries.length);
  return defaultQueries[randomIndex];
}

main().catch(error => {
  console.error('未处理的错误:', error);
  process.exit(1);
});
