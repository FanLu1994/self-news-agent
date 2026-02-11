/**
 * AI 新闻 Agent 主入口
 * 
 * 教学要点：
 * 1. 命令行参数解析
 * 2. 环境变量检查
 * 3. Agent 启动
 */

import { runNewsAgent } from './agent.js';

/**
 * 主函数
 */
async function main() {
  // 从命令行获取查询参数
  // 用法: npm start "你的查询"
  const args = process.argv.slice(2);
  const query = args.join(' ') || getDefaultQuery();

  console.log('启动 AI 新闻 Agent...\n');

  try {
    await runNewsAgent(query);
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

// 运行主函数
main().catch(error => {
  console.error('未处理的错误:', error);
  process.exit(1);
});
