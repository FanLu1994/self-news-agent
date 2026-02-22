# Self News Agent 配置指南

> AI 驱动的个性化新闻聚合与摘要工具，支持多数据源、智能分析和多渠道推送。

## 配置策略

本项目采用**明确的配置分离策略**：

| 配置类型 | 存放位置 | 说明 |
|---------|---------|------|
| **敏感信息** | `.env` / GitHub Secrets | API Keys、Tokens 等机密信息，**绝不提交到代码仓库** |
| **功能配置** | `config.json` | 数据源、开关、路径等，可提交到代码仓库 |
| **覆盖配置** | 环境变量（可选） | 仅用于 GitHub Actions 特殊覆盖，本地不推荐 |

**核心原则：** 每个配置项只在 `config.json` 或 `.env` 中配置，避免重复和混淆。

---

## 快速开始

### 1. 环境要求

- **Node.js** 20+
- **npm** 或其他包管理器
- **DeepSeek API Key**（免费/低成本）[获取地址](https://platform.deepseek.com/)

### 2. 本地安装

```bash
# 克隆仓库
git clone <your-repo-url>
cd self-news-agent

# 安装依赖
npm install

# 创建环境变量文件
cp .env.example .env
```

### 3. 配置敏感信息（.env）

编辑 `.env` 文件，**仅配置以下敏感信息**：

```env
# ========== LLM 配置 ==========
OPENAI_API_KEY=sk-your-deepseek-api-key-here
OPENAI_BASE_URL=https://api.deepseek.com

# ========== Telegram 推送（可选）==========
# TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
# TELEGRAM_CHAT_ID=123456789

# ========== Email 推送（可选）==========
# EMAIL_ENABLED=true
# RESEND_API_KEY=re_xxxxxxxxxxxxx
```

### 4. 配置功能选项（config.json）

编辑 `config.json` 文件，配置数据源、开关和路径：

```json
{
  "$schema": "./config.schema.json",
  "keywords": {
    "news": "",
    "x": "ai,llm,agent,coding"
  },
  "fetch": {
    "maxItemsPerSource": 20,
    "timeRange": "1d",
    "summaryStyle": "detailed"
  },
  "sources": {
    "rss": {
      "enabled": true,
      "feeds": [
        "https://www.hellogithub.com/rss",
        "https://feeds.feedburner.com/ruanyifeng"
      ]
    },
    "ve2x": { "enabled": true, "feeds": ["https://www.v2ex.com/index.xml"] },
    "linuxDo": { "enabled": true, "feeds": ["https://linux.do/latest.rss"] },
    "reddit": {
      "enabled": true,
      "feeds": ["https://www.reddit.com/r/artificial/.rss"]
    },
    "productHunt": { "enabled": true, "feeds": ["https://www.producthunt.com/feed"] },
    "twitter": { "enabled": false },
    "githubTrending": { "enabled": true },
    "hackerNews": { "enabled": true }
  },
  "output": {
    "rssPath": "output/news-digest.xml",
    "dailyDir": "docs/daily",
    "topicStatsPath": "data/topic-stats-history.json",
    "readmePath": "README.md",
    "updateReadme": true
  },
  "push": {
    "telegram": { "enabled": false },
    "email": {
      "enabled": false,
      "from": "Self News <noreply@yourdomain.com>",
      "to": "your-email@example.com"
    }
  }
}
```

### 5. 运行测试

```bash
# 工作流模式：抓取新闻并生成摘要
npm start

# Telegram 对话模式：交互式查询新闻
npm run telegram
```

执行成功后会生成/更新：
- `docs/daily/YYYY-MM-DD.md` - 每日新闻存档
- `data/topic-stats-history.json` - 话题统计历史
- `output/news-digest.xml` - RSS 订阅源
- `README.md` - 最新新闻摘要

---

## 配置详解

### 一、敏感信息（.env 或 GitHub Secrets）

以下配置**必须**通过环境变量配置，不可放在 `config.json`：

| 配置项 | 说明 | 获取方式 |
|-------|------|---------|
| `OPENAI_API_KEY` | DeepSeek/OpenAI API Key | [DeepSeek 控制台](https://platform.deepseek.com/) |
| `OPENAI_BASE_URL` | API 基础 URL | DeepSeek: `https://api.deepseek.com` |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token | 向 [@BotFather](https://t.me/botfather) 发送 `/newbot` |
| `TELEGRAM_CHAT_ID` | Telegram 聊天 ID | 访问 `https://api.telegram.org/bot<TOKEN>/getUpdates` |
| `RESEND_API_KEY` | Resend 邮件服务 Key | [Resend 控制台](https://resend.com/) |

**Telegram Chat ID 获取步骤：**
1. 向你的 Bot 发送任意消息
2. 浏览器访问：`https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
3. 在返回的 JSON 中找到 `chat.id` 数值

### 二、数据源配置（config.json）

#### 2.1 数据源开关

在 `config.json` 的 `sources` 节点中控制：

```json
{
  "sources": {
    "rss": { "enabled": true },
    "ve2x": { "enabled": true },
    "linuxDo": { "enabled": true },
    "reddit": { "enabled": true },
    "productHunt": { "enabled": true },
    "twitter": { "enabled": false },
    "githubTrending": { "enabled": true },
    "hackerNews": { "enabled": true }
  }
}
```

| 数据源 | enabled 默认值 | 说明 |
|--------|---------------|------|
| `rss` | `true` | 自定义 RSS 源 |
| `ve2x` | `true` | V2EX 社区 |
| `linuxDo` | `true` | Linux.do 论坛 |
| `reddit` | `true` | Reddit 子版块 |
| `productHunt` | `true` | Product Hunt |
| `twitter` | `false` | X/Twitter（需配置 `X_BEARER_TOKEN`） |
| `githubTrending` | `true` | GitHub 热门项目 |
| `hackerNews` | `true` | Hacker News |

#### 2.2 自定义数据源

**RSS 源：**
```json
{
  "sources": {
    "rss": {
      "enabled": true,
      "feeds": [
        "https://example.com/feed1.xml",
        "https://example.com/feed2.xml"
      ]
    }
  }
}
```

**Reddit 子版块：**
```json
{
  "sources": {
    "reddit": {
      "enabled": true,
      "feeds": [
        "https://www.reddit.com/r/artificial/.rss",
        "https://www.reddit.com/r/MachineLearning/.rss",
        "https://www.reddit.com/r/LocalLLaMA/.rss"
      ]
    }
  }
}
```

### 三、内容过滤配置（config.json）

```json
{
  "keywords": {
    "news": "ai,llm,agent",      // RSS/HN/Reddit 等关键词过滤（逗号分隔）
    "x": "ai,llm,agent,coding"   // Twitter 关键词
  },
  "fetch": {
    "maxItemsPerSource": 20,     // 每个来源最大抓取数
    "timeRange": "1d",           // 时间范围：1d/3d/7d
    "summaryStyle": "detailed"   // 摘要风格：brief/detailed/keywords
  }
}
```

| 配置项 | 可选值 | 默认值 | 说明 |
|-------|-------|-------|------|
| `keywords.news` | 逗号分隔的关键词 | 空串 | 留空则不过滤 |
| `keywords.x` | 逗号分隔的关键词 | `ai,llm,agent,coding` | Twitter 搜索关键词 |
| `maxItemsPerSource` | 1-100 | `20` | 每个来源最大抓取数 |
| `timeRange` | `1d` / `3d` / `7d` | `7d` | 抓取时间范围 |
| `summaryStyle` | `brief` / `detailed` / `keywords` | `detailed` | 摘要详细程度 |

### 四、推送配置

#### 4.1 Telegram 推送

**步骤 1：** 在 `.env` 中配置 Token 和 Chat ID
```env
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
TELEGRAM_CHAT_ID=123456789
```

**步骤 2：** 在 `config.json` 中启用
```json
{
  "push": {
    "telegram": { "enabled": true }
  }
}
```

#### 4.2 Email 推送

**步骤 1：** 在 `.env` 中配置 Resend API Key
```env
EMAIL_ENABLED=true
RESEND_API_KEY=re_xxxxxxxxxxxxx
```

**步骤 2：** 在 `config.json` 中配置发件人和收件人
```json
{
  "push": {
    "email": {
      "enabled": true,
      "from": "Self News <noreply@yourdomain.com>",
      "to": "your-email@example.com"
    }
  }
}
```

**注意：** Resend 需要先验证发送域名（DKIM 配置）。

### 五、输出路径配置（config.json）

```json
{
  "output": {
    "rssPath": "output/news-digest.xml",
    "dailyDir": "docs/daily",
    "topicStatsPath": "data/topic-stats-history.json",
    "readmePath": "README.md",
    "updateReadme": true
  }
}
```

| 配置项 | 默认值 | 说明 |
|-------|-------|------|
| `rssPath` | `output/news-digest.xml` | RSS 订阅输出路径 |
| `dailyDir` | `docs/daily` | 每日新闻存档目录 |
| `topicStatsPath` | `data/topic-stats-history.json` | 话题统计数据路径 |
| `readmePath` | `README.md` | README 文件路径 |
| `updateReadme` | `true` | 是否自动更新 README |

---

## GitHub Actions 配置

### 1. 仓库权限设置

进入 `Settings → Actions → General → Workflow permissions`，选择：
- ✅ `Read and write permissions`

### 2. 配置 Secrets

进入 `Settings → Secrets and variables → Actions → New repository secret`

**最小必配（运行必需）：**
```
OPENAI_API_KEY      # DeepSeek API Key
OPENAI_BASE_URL     # https://api.deepseek.com
```

**推送配置（推荐配置）：**
```
TELEGRAM_BOT_TOKEN  # Telegram Bot Token
TELEGRAM_CHAT_ID    # Telegram Chat ID
```

**可选配置：**
```
RESEND_API_KEY      # Resend API Key（启用邮件推送时）
X_BEARER_TOKEN      # X/Twitter API（启用 Twitter 时）
GITHUB_TOKEN        # GitHub Token（提高 API 速率限制）
```

### 3. 验证配置

1. 进入 `Actions` 标签页
2. 选择 `Self News Digest Schedule`
3. 点击 `Run workflow` → `Run workflow`
4. 查看运行日志，确保无报错
5. 检查仓库是否出现新的提交

### 4. 定时规则

工作流文件：`.github/workflows/digest-schedule.yml`

**默认：** 每天北京时间 `09:00` 和 `18:00`（UTC 01:00 和 10:00）

**修改定时：** 编辑 `digest-schedule.yml` 中的 cron 表达式：
```yaml
schedule:
  - cron: '0 1,10 * * *'  # UTC 时区，每天 01:00 和 10:00
```

---

## 故障排查

### 常见问题速查表

| 问题 | 可能原因 | 解决方案 |
|------|----------|----------|
| **API 调用失败 (401/403)** | API Key 错误或过期 | 检查 `.env` 或 GitHub Secrets 中的 `OPENAI_API_KEY` |
| **GitHub Actions 无法推送** | 仓库写权限未开启 | 进入 Settings → Actions → 启用 `Read and write permissions` |
| **某些数据源无数据** | 对应开关未启用 | 检查 `config.json` 中 `sources.*.enabled` |
| **Telegram 未收到消息** | Token 或 Chat ID 错误，或开关未启用 | 检查 `.env` 中的配置和 `config.json` 中 `push.telegram.enabled` |
| **邮件未发送** | Resend 配置不完整或域名未验证 | 确保 `RESEND_API_KEY` 已配置，且 `config.json` 中 `push.email.enabled: true` |
| **README 未更新** | 功能被禁用 | 检查 `config.json` 中 `output.updateReadme: true` |
| **GitHub Trending 失败** | 网络波动或 API 限制 | 已内置重试机制，偶发失败可忽略 |

### 调试技巧

```bash
# 查看详细运行日志
NODE_ENV=development npm start

# 测试 Telegram 连接
npm run telegram

# 验证配置文件语法
cat config.json | jq .
```

### 数据源特定问题

- **GitHub Trending**：使用爬虫方式，偶发性网络波动可能导致失败
- **X/Twitter**：需要有效的 Bearer Token，且有 API 速率限制
- **Reddit**：部分私密子版块可能无法访问
- **RSS 源**：确保 URL 可访问，部分源可能有反爬限制

---

## 配置最佳实践

### 1. 安全性

- ✅ **永远不要**将 `.env` 文件提交到代码仓库
- ✅ 使用 `.gitignore` 排除 `.env` 文件
- ✅ GitHub Secrets 用于生产环境敏感信息
- ✅ 定期轮换 API Keys

### 2. 可维护性

- ✅ 将稳定配置放在 `config.json`（可提交）
- ✅ 将敏感配置放在 `.env`（不提交）
- ✅ 使用 `config.schema.json` 验证配置语法
- ✅ 在 README 中记录自定义配置说明

### 3. 团队协作

- ✅ 提交 `config.json` 到代码仓库（去除敏感信息）
- ✅ 使用 `.env.example` 作为配置模板
- ✅ 在团队文档中记录获取 API Keys 的流程

---

## 配置文件清单

| 文件 | 用途 | 是否提交 |
|------|------|---------|
| `.env` | 本地开发环境变量 | ❌ 不提交 |
| `.env.example` | 环境变量模板 | ✅ 提交 |
| `config.json` | 功能配置文件 | ✅ 提交 |
| `config.schema.json` | 配置验证 Schema | ✅ 提交 |

---

## 附录

### 支持的 LLM 提供商

| 提供商 | API Key 环境变量 | Base URL | 推荐模型 |
|--------|----------------|----------|----------|
| **DeepSeek** ⭐ 推荐 | `OPENAI_API_KEY` | `https://api.deepseek.com` | `deepseek-chat` |
| OpenAI | `OPENAI_API_KEY` | `https://api.openai.com/v1` | `gpt-4o` |
| Anthropic | `ANTHROPIC_API_KEY` | - | `claude-sonnet-4-20250514` |
| Google | `GOOGLE_GENERATIVE_AI_API_KEY` | - | `gemini-2.5-flash` |
| ZAI | `ZAI_API_KEY` | - | `glm-4.7` |

**注意：** 本项目通过 `pi-ai` 库的 `createOpenAI` 接口调用，因此使用 OpenAI 兼容的 API（如 DeepSeek）需要配置 `OPENAI_API_KEY` 和 `OPENAI_BASE_URL`。

### 项目结构

```
self-news-agent/
├── .github/workflows/     # GitHub Actions 工作流
├── docs/daily/            # 每日新闻存档
├── output/                # RSS 输出文件
├── data/                  # 统计数据
├── src/                   # 源代码
│   └── config.ts          # 配置加载逻辑
├── config.json            # 功能配置 ⭐
├── config.schema.json     # 配置验证
├── .env.example           # 环境变量模板 ⭐
├── .env                   # 本地环境变量（不提交）
└── README.md              # 项目说明和最新摘要
```

### 相关链接

- [DeepSeek API 文档](https://platform.deepseek.com/api-docs/)
- [Telegram Bot 创建指南](https://core.telegram.org/bots#how-do-i-create-a-bot)
- [Resend 邮件服务](https://resend.com/)
- [GitHub Actions 文档](https://docs.github.com/en/actions)

---

## 推荐上线流程

1. ✅ 本地配置 `.env` 和 `config.json`
2. ✅ 运行 `npm start` 验证配置正确
3. ✅ 提交 `config.json` 到代码仓库
4. ✅ 配置 GitHub Secrets
5. ✅ 手动触发一次 Actions 验证
6. ✅ 观察 1-2 天定时运行结果
7. ✅ 按需启用邮件推送
