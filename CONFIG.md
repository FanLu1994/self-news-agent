# Self News Agent 配置说明

配置文件分为两个部分：
- **`.env`** - 敏感信息（API Keys），不提交到代码仓库
- **`config.json`** - 业务配置（数据源、关键字等），可提交到代码仓库

## 快速开始

1. 复制配置文件：
```bash
cp .env.example .env
```

2. 编辑 `.env`，填入你的 API Keys（至少需要 LLM 的 API Key）：
```env
OPENAI_API_KEY=sk-your-deepseek-api-key
OPENAI_BASE_URL=https://api.deepseek.com
```

3. 编辑 `config.json` 自定义数据源和抓取配置（可选）

4. 运行：
```bash
npm install
npm start
```

## 配置文件说明

### `.env` - 敏感配置

| 配置项 | 说明 | 必需 |
|--------|------|------|
| `OPENAI_API_KEY` | DeepSeek API Key | ✅ |
| `OPENAI_BASE_URL` | DeepSeek API 地址 | ✅ |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token | - |
| `TELEGRAM_CHAT_ID` | Telegram 聊天 ID | - |
| `RESEND_API_KEY` | Resend API Key（邮件） | - |
| `GITHUB_TOKEN` | GitHub Token（可选） | - |
| `X_BEARER_TOKEN` | X/Twitter API Token | - |

### `config.json` - 业务配置

```json
{
  "keywords": {
    "news": "",           // 新闻关键字过滤（留空=全量）
    "x": "ai,llm,agent"   // X 搜索关键字
  },
  "fetch": {
    "maxItemsPerSource": 20,  // 每个来源最大文章数
    "timeRange": "7d",        // 时间范围: 1d/3d/7d
    "summaryStyle": "detailed" // 摘要风格: brief/detailed/keywords
  },
  "sources": {
    "rss": { "enabled": false, "feeds": [...] },
    "ve2x": { "enabled": true, "feeds": [...] },
    "linuxDo": { "enabled": true, "feeds": [...] },
    "reddit": { "enabled": true, "feeds": [...] },
    "productHunt": { "enabled": true, "feeds": [...] },
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
    "email": { "enabled": false, "from": "...", "to": "..." }
  }
}
```

## 常见配置场景

### 只获取 AI 相关内容

编辑 `config.json`：
```json
{
  "keywords": {
    "news": "ai,llm,agent,gpt,claude",
    "x": "ai,llm,agent,coding"
  }
}
```

### 更换 Reddit 论坛

编辑 `config.json`：
```json
{
  "sources": {
    "reddit": {
      "enabled": true,
      "feeds": [
        "https://www.reddit.com/r/LocalLLaMA/.rss",
        "https://www.reddit.com/r/OpenAI/.rss",
        "https://www.reddit.com/r/CharacterAI/.rss"
      ]
    }
  }
}
```

### 启用 Telegram 推送

1. 编辑 `.env`：
```env
TELEGRAM_BOT_TOKEN=你的bot_token
TELEGRAM_CHAT_ID=你的chat_id
```

2. 编辑 `config.json`：
```json
{
  "push": {
    "telegram": { "enabled": true }
  }
}
```

### 调整抓取频率和数量

编辑 `config.json`：
```json
{
  "fetch": {
    "maxItemsPerSource": 20,  // 每个来源最多 20 篇（超过会被限制为 20）
    "timeRange": "3d"         // 改为 3 天内的内容
  }
}
```

## GitHub Actions 配置

在仓库的 `Settings -> Secrets and variables -> Actions` 中添加：

**必需：**
- `OPENAI_API_KEY` - DeepSeek API Key
- `OPENAI_BASE_URL` - `https://api.deepseek.com`

**可选：**
- `TELEGRAM_BOT_TOKEN`、`TELEGRAM_CHAT_ID`
- `RESEND_API_KEY`、`EMAIL_FROM`、`EMAIL_TO`
- `GITHUB_TOKEN`
- `X_BEARER_TOKEN`

`config.json` 会在 Actions 运行时自动读取，不需要在 Secrets 中配置。
