/**
 * AI 新闻 Agent 主程序
 * 
 * 教学要点 (@mariozechner/pi-coding-agent):
 * 1. 使用 new Agent({ initialState }) 创建 Agent
 * 2. 配置 systemPrompt 定义 Agent 行为
 * 3. 使用 getModel() 配置 LLM 模型
 * 4. 注册自定义工具到 tools 数组
 * 5. 使用 agent.subscribe() 订阅事件
 * 6. 处理不同类型的事件 (message_update, tool_result, error)
 * 7. 使用 agent.prompt() 发起对话
 * 8. 流式输出展示
 */

import { Agent } from '@mariozechner/pi-agent-core';
import { fetchNewsTool } from './tools/fetch-news.tool.js';
import { summarizeNewsTool } from './tools/summarize-news.tool.js';
import { getConfiguredModel, getPiAiModel } from './model.js';
import 'dotenv/config';

/**
 * 创建新闻热点 Agent
 * 
 * 教学要点：Agent 初始化和配置
 */
function getSystemPrompt(modelProvider: string, modelName: string): string {
  return `你是一个由 ${modelProvider}/${modelName} 驱动的 AI 新闻研究助手。

🎯 你的角色：
帮助用户发现、分析和理解来自全球的最新 AI 和技术新闻。

🛠️ 你的能力：
你可以使用两个强大的工具：

1. **fetch_news**：获取实时 AI/技术新闻文章
   - 数据源：HackerNews（英文）+ 中文科技媒体 RSS + GitHub Trending（可选）+ X/Twitter（可选）
   - 筛选条件：类别（ai/ml/nlp/cv/robotics）、语言（en/zh/all）、时间范围（1d/3d/7d）
   - 返回：包含标题、摘要、来源、URL 的结构化文章列表

2. **summarize_news**：使用当前配置的大模型分析新闻
   - 识别主要话题和关键趋势
   - 突出技术突破和行业影响
   - 提供未来影响和区域洞察
   - 风格：简要（要点）、详细（综合分析）、关键词（关键术语）

📋 你的工作流程：
当用户询问新闻时：
1. 使用 fetch_news 根据用户请求获取相关文章
2. 自动使用 summarize_news 分析文章
3. 以清晰、结构良好的格式呈现洞察
4. 突出最重要的发展及其意义

记住：你是一位专家分析师。要有洞察力、准确，并帮助用户理解快速发展的 AI 领域。所有输出都使用中文。`;
}

export function createNewsAgent() {
  const modelConfig = getConfiguredModel();
  const model = getPiAiModel();

  // 教学要点：Agent 初始化配置
  const agent = new Agent({
    initialState: {
      // 教学要点：系统提示词 - 定义 Agent 的角色、能力和行为
      systemPrompt: getSystemPrompt(modelConfig.provider, modelConfig.model),

      // 教学要点：配置 LLM 模型
      model,
      
      // 教学要点：思维链配置 (如果模型支持)
      // thinkingLevel: 'medium',
      
      // 教学要点：注册自定义工具
      tools: [
        fetchNewsTool,
        summarizeNewsTool
      ],
      
      // 初始消息为空
      messages: []
    }
  });

  // 教学要点：订阅 Agent 事件
  agent.subscribe((event) => {
    switch (event.type) {
      case 'message_update':
        // 处理消息更新事件
        handleMessageUpdate(event);
        break;

      case 'tool_result':
        // 工具执行结果
        handleToolResult(event);
        break;

      case 'error':
        // 错误处理
        console.error(`\n❌ Agent Error: ${event.error.message}`);
        if (event.error.stack) {
          console.error('Stack trace:', event.error.stack);
        }
        break;
    }
  });

  return agent;
}

/**
 * 处理消息更新事件
 * 教学要点：不同类型的消息事件处理
 */
function handleMessageUpdate(event: any) {
  const msgEvent = event.assistantMessageEvent;
  
  switch (msgEvent.type) {
    case 'text_delta':
      // 教学要点：流式文本输出
      process.stdout.write(msgEvent.delta);
      break;
    
    case 'toolcall_delta':
      // 工具调用进度（部分参数）
      const toolCall = msgEvent.partial.content[msgEvent.contentIndex];
      if (toolCall && toolCall.type === 'toolCall') {
        // 可以在这里显示工具调用进度
        // console.log(`\n🔧 Calling tool: ${toolCall.name}...`);
      }
      break;
    
    case 'toolcall_end':
      // 教学要点：工具调用完成
      const completedTool = msgEvent.toolCall;
      console.log(`\n✓ Tool "${completedTool.name}" completed`);
      
      // 可选：显示工具参数
      if (completedTool.arguments) {
        console.log(`  Parameters:`, JSON.stringify(completedTool.arguments, null, 2));
      }
      break;
    
    case 'thinking_delta':
      // 思维过程（如果模型支持 reasoning）
      // process.stdout.write(msgEvent.delta);
      break;
  }
}

/**
 * 处理工具结果事件
 * 教学要点：工具执行结果处理
 */
function handleToolResult(event: any) {
  console.log(`\n📦 Tool Result: ${event.toolName}`);
  
  if (event.details) {
    // 显示工具执行的详细信息
    if (event.toolName === 'fetch_news') {
      console.log(`   Articles found: ${event.details.articleCount}`);
      console.log(`   Category: ${event.details.category}`);
      console.log(`   Language: ${event.details.language}`);
      console.log(`   Time range: ${event.details.timeRange}`);
      if (event.details.distribution) {
        console.log(`   Distribution: ${event.details.distribution.english} EN, ${event.details.distribution.chinese} ZH, ${event.details.distribution.twitter || 0} X, ${event.details.distribution.github || 0} GH`);
      }
    } else if (event.toolName === 'summarize_news') {
      console.log(`   Articles analyzed: ${event.details.articlesAnalyzed}`);
      console.log(`   Style: ${event.details.style}`);
      if (event.details.tokenUsage) {
        const usage = event.details.tokenUsage;
        console.log(`   Token usage: ${usage.total} (${usage.input} in, ${usage.output} out)`);
        console.log(`   Cost: $${usage.cost.toFixed(6)}`);
      }
    }
  }
}

/**
 * 运行 Agent（便捷函数）
 * 教学要点：Agent 使用示例
 */
export async function runNewsAgent(query: string) {
  const modelConfig = getConfiguredModel();
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                🤖 AI News Agent (Multi-LLM)                      ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');
  
  console.log(`📝 User Query: ${query}\n`);
  console.log(`🧠 Model: ${modelConfig.provider}/${modelConfig.model}\n`);
  console.log('─'.repeat(70));
  console.log();

  const agent = createNewsAgent();

  try {
    // 教学要点：发送提示并等待完成
    await agent.prompt(query);
    
    console.log('\n\n' + '─'.repeat(70));
    console.log('✅ Agent task completed successfully\n');
    
  } catch (error) {
    console.error('\n❌ Agent encountered an error:');
    console.error(error);
    process.exit(1);
  }
}

export async function askNewsAgent(query: string): Promise<string> {
  const agent = createNewsAgent();
  let responseText = '';
  agent.subscribe((event) => {
    if (event.type !== 'message_update') return;
    const msgEvent = event.assistantMessageEvent;
    if (msgEvent?.type === 'text_delta') {
      responseText += msgEvent.delta;
    }
  });
  await agent.prompt(query);
  return responseText.trim() || '暂时没有可返回的结果。';
}
