# AI News Agent

> 基于 `@mariozechner/pi-ai` 和 `@mariozechner/pi-coding-agent` 的 AI 新闻热点搜集和总结 Agent  
> 使用 GLM-4 大模型进行智能分析

## 📋 项目简介

这是一个教学项目，旨在展示如何使用 `@mariozechner/pi-ai` 和 `@mariozechner/pi-coding-agent` 两个强大的库来构建自定义 AI Agent。

**核心功能**：
- 🔍 从 HackerNews 和中文科技媒体获取最新 AI/科技新闻
- 🌐 支持 Ve2x、Linux.do、Reddit、Product Hunt 多源抓取
- 🤖 支持 GLM / OpenAI / Claude / Gemini 等多模型 API 分析总结
- 🌍 支持中英双语新闻源
- 📊 提供详细的趋势分析和行业洞察
- 🛠️ 完整的自定义工具实现示例
- 🐦 支持从 X/Twitter 获取关键词热点（可选）
- ⚙️ 关键词、RSS 源、时间窗口等可通过环境变量配置
- 📮 支持将摘要推送到 Telegram（可选）
- ✉️ 支持摘要生成后邮件推送（Resend，可选）
- 📰 自动生成可订阅的 RSS 摘要文件
- 📝 自动生成 `docs/daily/YYYY-MM-DD.md` 并回写 README 最新摘要与话题趋势

<!-- digest:latest:start -->
## 最新简报 (2026-02-22)



重点:


完整内容: [docs/daily/2026-02-22.md](docs/daily/2026-02-22.md)
<!-- digest:latest:end -->

<!-- digest:trend:start -->
## 话题趋势 (2026-02-22)

| Topic | 7d | 30d | 近7天分布 |
| --- | --- | --- | --- |
| Other | 192 | 192 | 0, 0, 0, 44, 47, 50, 51 |
| AI | 180 | 180 | 0, 0, 0, 47, 43, 44, 46 |
| Data | 50 | 50 | 0, 0, 0, 13, 9, 14, 14 |
| Frontend | 16 | 16 | 0, 0, 0, 5, 5, 5, 1 |
| Backend | 8 | 8 | 0, 0, 0, 2, 3, 2, 1 |
| OpenSource | 8 | 8 | 0, 0, 0, 2, 2, 2, 2 |
| Mobile | 4 | 4 | 0, 0, 0, 1, 2, 0, 1 |
| Startup | 4 | 4 | 0, 0, 0, 1, 1, 1, 1 |
| Security | 3 | 3 | 0, 0, 0, 2, 1, 0, 0 |
| Cloud | 3 | 3 | 0, 0, 0, 1, 1, 0, 1 |
<!-- digest:trend:end -->

**教学价值**：
- ✅ 学习如何定义和实现自定义工具（Tool）
- ✅ 学习如何创建和配置 AI Agent
- ✅ 学习如何使用 GLM-4 进行 LLM 调用
- ✅ 学习工具链（tool chaining）的实现
- ✅ 学习事件驱动的 Agent 架构
- ✅ 真实的 API 集成和数据处理

---

## 🏗️ 项目架构

```
pi-agent/
├── src/
│   ├── types/
│   │   └── news.types.ts           # TypeScript 类型定义
│   ├── services/
│   │   ├── hackernews.service.ts  # HackerNews API 封装
│   │   └── rss.service.ts         # RSS 解析服务
│   ├── tools/
│   │   ├── fetch-news.tool.ts     # 工具1: 新闻获取
│   │   └── summarize-news.tool.ts # 工具2: GLM-4 总结
│   ├── agent.ts                    # Agent 核心逻辑
│   └── index.ts                    # 主入口
├── examples/
│   ├── basic-usage.ts             # 基础使用示例
│   └── advanced-usage.ts          # 高级使用示例
├── package.json
├── tsconfig.json
└── .env.example
```

---

## 🚀 快速开始

完整配置流程见：`docs/configuration-guide.md`

### 1. 环境要求

- Node.js >= 18.0.0
- npm >= 9.0.0
- GLM-4 API Key (从 [智谱AI](https://open.bigmodel.cn/) 获取)

### 2. 安装依赖

```bash
cd pi-agent
npm install
```

### 3. 配置 API Key

创建 `.env` 文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件，添加你的 GLM-4 API Key：

```env
ZHIPU_API_KEY=your_actual_api_key_here
```

### 4. 运行 Agent

```bash
# 运行聚合流水线（抓取 -> AI 分析 -> Markdown/README -> 推送）
npm run start:digest

# 每日两次调度执行（默认 09:00,18:00）
npm run start:schedule

# 运行对话式 Agent 模式
npm start -- --agent "获取最新的大模型和AI应用相关新闻"

# Agent 模式（英文）
npm start -- --agent "Get the latest machine learning breakthroughs from the past week"

# Telegram 对话模式（Bot 收消息并调用 Agent 自动回复）
npm run start:telegram

# 运行基础示例
npm run example:basic

# 运行高级示例
npm run example:advanced
```

---

## ⏰ GitHub Actions 定时运行

已提供工作流：`.github/workflows/digest-schedule.yml`

- 定时：每天 `09:00`、`18:00`（北京时间，GitHub 使用 UTC 的 `01:00`、`10:00`）
- 支持手动触发：`workflow_dispatch`
- 执行后会自动提交更新的 `README.md`、`docs/daily`、`data`、`output`

请在仓库 `Settings -> Secrets and variables -> Actions` 中配置至少以下 Secrets：

- `ZAI_API_KEY`（或你实际使用的模型 API Key）
- `LLM_PROVIDER`、`LLM_MODEL`
- `TELEGRAM_BOT_TOKEN`、`TELEGRAM_CHAT_ID`（如果需要 Telegram 推送）
- `EMAIL_ENABLED`、`RESEND_API_KEY`、`EMAIL_FROM`、`EMAIL_TO`（如果需要邮件推送）

可选 Secrets（不配则走代码默认值）：

- `NEWS_KEYWORDS`、`RSS_FEEDS`、`VE2X_FEEDS`、`LINUX_DO_FEEDS`、`REDDIT_FEEDS`、`PRODUCT_HUNT_FEEDS`
- `INCLUDE_GITHUB_TRENDING`、`INCLUDE_VE2X`、`INCLUDE_LINUX_DO`、`INCLUDE_REDDIT`、`INCLUDE_PRODUCT_HUNT`、`INCLUDE_TWITTER`
- `GITHUB_TRENDING_LANGUAGES`、`X_BEARER_TOKEN`、`X_KEYWORDS`

---

## 📚 核心概念教学

### 一、@mariozechner/pi-ai 核心用法

#### 1. 模型配置

```typescript
import { getModel } from '@mariozechner/pi-ai';

// 配置 GLM-4 模型
const model = getModel('zhipu', 'glm-4');

// 支持的其他模型
const gpt4 = getModel('openai', 'gpt-4o');
const claude = getModel('anthropic', 'claude-sonnet-4-20250514');
const gemini = getModel('google', 'gemini-2.5-flash');
```

**教学要点**：
- `getModel(provider, modelName)` 统一接口
- 支持 20+ AI 提供商
- 轻松切换不同 LLM

#### 2. Context 管理

```typescript
import type { Context } from '@mariozechner/pi-ai';

const context: Context = {
  systemPrompt: 'You are a helpful assistant.',
  messages: [
    {
      role: 'user',
      content: 'What is TypeScript?',
      timestamp: Date.now()
    }
  ],
  tools: []  // 可选：工具定义
};
```

**教学要点**：
- `systemPrompt` 定义 AI 行为
- `messages` 存储对话历史
- `tools` 注册可用工具

#### 3. LLM 调用

```typescript
import { complete } from '@mariozechner/pi-ai';

// 一次性调用
const response = await complete(model, context);

// 提取文本
const text = response.content
  .filter(block => block.type === 'text')
  .map(block => block.text)
  .join('\n');

// Token 统计
console.log('Tokens:', response.usage.totalTokens);
console.log('Cost:', response.usage.cost.total);
```

**教学要点**：
- `complete()` 用于一次性调用
- `stream()` 用于流式输出
- 自动追踪 token 使用和成本

#### 4. 工具定义

```typescript
import { Type } from '@sinclair/typebox';
import { StringEnum } from '@mariozechner/pi-ai';
import type { Tool } from '@mariozechner/pi-ai';

const myTool: Tool = {
  name: 'my_tool',
  description: 'Tool description for the LLM',
  
  // 参数定义
  parameters: Type.Object({
    category: StringEnum(['option1', 'option2'] as const, {
      description: 'Category description',
      default: 'option1'
    }),
    limit: Type.Number({
      description: 'Maximum number',
      default: 10,
      minimum: 1,
      maximum: 100
    })
  }),
  
  // 执行逻辑
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // 检查取消
    if (signal?.aborted) {
      throw new Error('Cancelled');
    }
    
    // 进度反馈
    onUpdate?.({
      content: [{ type: 'text', text: 'Processing...' }],
      details: { progress: 50 }
    });
    
    // 执行业务逻辑
    const result = await doSomething(params);
    
    // 返回结果
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
      details: { count: result.length }
    };
  }
};
```

**教学要点**：
- 使用 `Type.Object` 定义参数
- 使用 `StringEnum` 定义枚举（兼容所有 LLM）
- `execute()` 必须是 async 函数
- 使用 `onUpdate()` 提供进度
- 检查 `signal?.aborted` 支持取消
- 返回 `{ content, details }` 结构

---

### 二、@mariozechner/pi-coding-agent 核心用法

#### 1. Agent 创建

```typescript
import { Agent } from '@mariozechner/pi-agent-core';
import { getModel } from '@mariozechner/pi-ai';

const agent = new Agent({
  initialState: {
    // 系统提示词
    systemPrompt: 'You are a helpful assistant with tools.',
    
    // LLM 模型
    model: getModel('zhipu', 'glm-4'),
    
    // 注册工具
    tools: [tool1, tool2],
    
    // 初始消息
    messages: []
  }
});
```

**教学要点**：
- `new Agent({ initialState })` 创建 Agent
- `systemPrompt` 定义 Agent 角色和行为
- `tools` 数组注册所有可用工具
- `model` 指定使用的 LLM

#### 2. 事件订阅

```typescript
agent.subscribe((event) => {
  switch (event.type) {
    case 'message_update':
      // 处理消息更新
      const msgEvent = event.assistantMessageEvent;
      
      if (msgEvent.type === 'text_delta') {
        // 流式文本输出
        process.stdout.write(msgEvent.delta);
      }
      else if (msgEvent.type === 'toolcall_end') {
        // 工具调用完成
        console.log(`Tool ${msgEvent.toolCall.name} completed`);
      }
      break;
      
    case 'tool_result':
      // 工具执行结果
      console.log('Tool result:', event.toolName);
      console.log('Details:', event.details);
      break;
      
    case 'error':
      // 错误处理
      console.error('Error:', event.error.message);
      break;
  }
});
```

**教学要点**：
- `agent.subscribe()` 订阅所有事件
- `message_update` - 消息流式更新
- `tool_result` - 工具执行结果
- `error` - 错误事件
- 事件类型：`text_delta`, `toolcall_delta`, `toolcall_end`

#### 3. 发起对话

```typescript
// 发送文本提示
await agent.prompt('Your query here');

// 带图像的提示（如果需要）
await agent.prompt('Describe this image', [
  {
    type: 'image',
    data: base64ImageData,
    mimeType: 'image/jpeg'
  }
]);
```

**教学要点**：
- `agent.prompt()` 发起对话
- 支持多模态输入（文本 + 图像）
- 自动处理工具调用链

---

## 🔧 项目实现详解

### 工具 1: fetch_news（新闻获取）

**位置**: `src/tools/fetch-news.tool.ts`

**功能**：从 HackerNews 和中文 RSS feeds 获取 AI/科技新闻

**数据源**：
- **HackerNews** (70-80%, 英文)
  - Top Stories API
  - Best Stories API  
  - AI 关键词智能过滤
  
- **中文 RSS Feeds** (20-30%, 中文)
  - 机器之心
  - 新智元
  - AI科技大本营

**参数**：

```typescript
{
  category: 'ai' | 'ml' | 'nlp' | 'cv' | 'robotics' | 'all',  // 新闻分类
  language: 'en' | 'zh' | 'all',  // 语言过滤
  limit: number,      // 1-50
  timeRange: '1d' | '3d' | '7d'  // 时间范围
}
```

**核心实现**：

```typescript
async execute(toolCallId, params, signal, onUpdate, ctx) {
  // 1. 并行请求多个数据源
  const [hnArticles, rssArticles] = await Promise.all([
    hackerNewsService.fetchAINews({ limit, timeRange }),
    rssService.fetchChineseNews({ limit, timeRange })
  ]);
  
  // 2. 合并和排序
  let allArticles = [...hnArticles, ...rssArticles];
  allArticles.sort(byPublishDate);
  
  // 3. 返回结构化数据
  return {
    content: [{ type: 'text', text: formattedOutput }],
    details: { articleCount, distribution }
  };
}
```

**教学要点**：
- 并行 API 调用 (`Promise.all`)
- 数据过滤和转换
- 错误处理和降级
- 进度反馈实现

---

### 工具 2: summarize_news（GLM-4 总结）

**位置**: `src/tools/summarize-news.tool.ts`

**功能**：使用 GLM-4 对新闻进行深度分析

**参数**：

```typescript
{
  newsData: string,  // JSON 字符串（从 fetch_news 获取）
  style: 'brief' | 'detailed' | 'keywords'  // 总结风格
}
```

**详细模式输出**：

```json
{
  "overview": "整体概述",
  "mainTopics": ["主题1", "主题2", ...],
  "keyTrends": ["趋势1", "趋势2", ...],
  "detailedAnalysis": {
    "breakthroughs": ["技术突破"],
    "industryImpacts": ["行业影响"],
    "futureImplications": ["未来展望"],
    "regionalInsights": {
      "international": "国际动态",
      "china": "中国动态"
    }
  },
  "topArticles": [
    { "title": "...", "url": "...", "reason": "..." }
  ]
}
```

**核心实现**：

```typescript
async execute(toolCallId, params, signal, onUpdate, ctx) {
  // 1. 解析输入数据
  const newsJson = JSON.parse(params.newsData);
  
  // 2. 配置 GLM-4
  const model = getModel('zhipu', 'glm-4');
  
  // 3. 构建提示词
  const prompt = buildDetailedAnalysisPrompt(newsJson);
  
  // 4. 调用 LLM
  const response = await complete(model, {
    systemPrompt: 'You are an expert AI news analyst...',
    messages: [{ role: 'user', content: prompt }]
  });
  
  // 5. 提取结果和统计
  const analysis = response.content[0].text;
  const usage = response.usage;
  
  // 6. 返回格式化结果
  return {
    content: [{ type: 'text', text: formattedAnalysis }],
    details: { tokenUsage: usage, ... }
  };
}
```

**教学要点**：
- GLM-4 配置和调用
- 提示词工程（详细/简短/关键词）
- JSON 输出解析
- Token 使用追踪
- 错误处理

---

### Agent 主程序

**位置**: `src/agent.ts`

**核心配置**：

```typescript
const agent = new Agent({
  initialState: {
    systemPrompt: `You are an AI News Research Assistant...
    
Available tools:
1. fetch_news - Retrieve news from HackerNews and RSS
2. summarize_news - Analyze with GLM-4

Workflow:
1. fetch_news to get articles
2. summarize_news to analyze
3. Present insights`,

    model: getModel('zhipu', 'glm-4'),
    tools: [fetchNewsTool, summarizeNewsTool],
    messages: []
  }
});
```

**事件处理**：

```typescript
agent.subscribe((event) => {
  switch (event.type) {
    case 'message_update':
      // 流式输出、工具调用进度
      handleMessageUpdate(event);
      break;
      
    case 'tool_result':
      // 显示工具执行详情
      console.log(`Tool ${event.toolName}:`, event.details);
      break;
      
    case 'error':
      // 错误处理
      console.error(event.error);
      break;
  }
});
```

**教学要点**：
- Agent 初始化配置
- 系统提示词设计原则
- 工具链自动流转
- 事件驱动架构
- 流式输出处理

---

## 📊 使用示例

### 示例 1: 基础查询

```bash
npm start "Get the latest AI news from the past week"
```

**预期流程**：
1. Agent 调用 `fetch_news` 工具
2. 获取 15+ 篇新闻（英文 + 中文）
3. Agent 自动调用 `summarize_news`
4. GLM-4 分析并生成详细报告

### 示例 2: 中文新闻

```bash
npm start "获取最新的大模型和自然语言处理相关新闻"
```

### 示例 3: 特定分类

```bash
npm start "Show me computer vision breakthroughs from the past 3 days"
```

### 示例 4: 对比分析

```bash
npm start "Compare AI developments in Western vs Chinese tech communities"
```

---

## 🎓 学习要点总结

### @mariozechner/pi-ai

1. ✅ **模型配置**: `getModel(provider, model)`
2. ✅ **Context 管理**: `{ systemPrompt, messages, tools }`
3. ✅ **LLM 调用**: `complete()` 和 `stream()`
4. ✅ **工具定义**: `Type.Object()`, `StringEnum()`
5. ✅ **Token 追踪**: `response.usage`
6. ✅ **多提供商**: 轻松切换 OpenAI/Anthropic/Google/Zhipu

### @mariozechner/pi-coding-agent

1. ✅ **Agent 创建**: `new Agent({ initialState })`
2. ✅ **系统提示词**: 定义 Agent 行为和角色
3. ✅ **工具注册**: `tools: [tool1, tool2]`
4. ✅ **异步执行**: `async execute()`
5. ✅ **进度反馈**: `onUpdate()`
6. ✅ **事件订阅**: `agent.subscribe()`
7. ✅ **工具链**: 自动工具协作
8. ✅ **对话管理**: `agent.prompt()`

### 实际应用技能

1. ✅ HTTP API 调用和封装
2. ✅ RSS 解析和数据转换
3. ✅ 并行请求处理
4. ✅ 数据过滤和聚合
5. ✅ 提示词工程
6. ✅ 错误处理和降级
7. ✅ TypeScript 类型安全
8. ✅ 事件驱动架构

---

## 🔄 扩展指南

### 添加新工具

1. 在 `src/tools/` 创建新文件
2. 定义工具结构：

```typescript
export const myNewTool: Tool = {
  name: 'my_new_tool',
  description: '...',
  parameters: Type.Object({ ... }),
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    // 实现逻辑
  }
};
```

3. 在 `src/agent.ts` 注册：

```typescript
tools: [fetchNewsTool, summarizeNewsTool, myNewTool]
```

### 切换 LLM 模型

```typescript
// 使用 GPT-4
model: getModel('openai', 'gpt-4o')

// 使用 Claude
model: getModel('anthropic', 'claude-sonnet-4-20250514')

// 使用 Gemini
model: getModel('google', 'gemini-2.5-flash')
```

### 添加新的新闻源

编辑 `src/services/rss.service.ts`：

```typescript
const RSS_FEEDS: RSSFeedConfig[] = [
  // ... 现有 feeds
  {
    name: '新源名称',
    url: 'https://example.com/rss',
    language: 'zh',
    category: 'ai'
  }
];
```

---

## 🐛 常见问题

### Q: ZHIPU_API_KEY 未找到

**A**: 确保在项目根目录创建了 `.env` 文件，并正确设置了 API Key：

```bash
ZHIPU_API_KEY=your_actual_key_here
```

### Q: RSS feeds 获取失败

**A**: 可能的原因：
- 网络连接问题
- RSS 源暂时不可用
- 需要代理（在 .env 设置 `HTTP_PROXY`）

Agent 会自动降级，仅使用 HackerNews 数据。

### Q: GLM-4 调用失败

**A**: 检查：
1. API Key 是否正确
2. API Key 是否有足够配额
3. 网络连接是否正常

### Q: 如何限制 API 成本？

**A**: 
- 减少 `limit` 参数（获取更少文章）
- 使用 `brief` 风格而非 `detailed`
- 检查 token 使用统计

---

## 📝 项目文件说明

| 文件 | 行数 | 说明 |
|------|------|------|
| `src/types/news.types.ts` | ~120 | TypeScript 类型定义 |
| `src/services/hackernews.service.ts` | ~250 | HackerNews API 封装 |
| `src/services/rss.service.ts` | ~200 | RSS 解析服务 |
| `src/tools/fetch-news.tool.ts` | ~200 | 新闻获取工具 |
| `src/tools/summarize-news.tool.ts` | ~180 | GLM-4 总结工具 |
| `src/agent.ts` | ~180 | Agent 核心逻辑 |
| `src/index.ts` | ~50 | 主入口 |
| `examples/basic-usage.ts` | ~100 | 基础示例 |
| `examples/advanced-usage.ts` | ~150 | 高级示例 |
| **总计** | **~1,430** | **代码行数** |

---

## 🎯 下一步

1. **运行项目**: 按照快速开始指南运行 Agent
2. **阅读代码**: 仔细阅读带注释的源代码
3. **修改工具**: 尝试修改工具参数和逻辑
4. **添加功能**: 实现新的工具或数据源
5. **切换模型**: 尝试使用不同的 LLM 模型

---

## 📚 参考资源

- [@mariozechner/pi-ai 文档](https://github.com/badlogic/pi-mono)
- [@mariozechner/pi-coding-agent 文档](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent)
- [智谱 AI GLM-4](https://open.bigmodel.cn/)
- [HackerNews API](https://github.com/HackerNews/API)
- [TypeBox](https://github.com/sinclairzx81/typebox)

---

## 📄 许可证

MIT

---

## 🙏 致谢

感谢 [@mariozechner](https://github.com/badlogic) 开发的优秀工具库！

---

**Happy Coding!** 🚀
