# Self News Agent 配置流程文档

本文档用于从 0 到 1 完成项目配置，并通过外部调度（如 GitHub Actions）定时执行。

## 1. 前置条件

- GitHub 仓库已创建并可推送
- Node.js 20+
- 可用的大模型 API Key（推荐 DeepSeek，免费或低成本）

## 2. 本地初始化

1. 安装依赖

```bash
npm install
```

2. 创建环境变量文件

```bash
cp .env.example .env
```

3. 至少配置以下字段（本地运行必需）

```env
# DeepSeek API（默认，推荐）
OPENAI_API_KEY=sk-your-deepseek-api-key
OPENAI_BASE_URL=https://api.deepseek.com
LLM_PROVIDER=openai
LLM_MODEL=deepseek-chat

# 或使用其他模型（可选）
# ZAI_API_KEY=你的key
# LLM_PROVIDER=zai
# LLM_MODEL=glm-4.7
```

4. 首次手动执行

**工作流模式：**
```bash
npm start
```

执行成功后，会生成或更新：

- `docs/daily/YYYY-MM-DD.md`
- `data/topic-stats-history.json`
- `output/news-digest.xml`
- `README.md`（自动更新为最新新闻内容）

**Telegram 对话模式（可选）：**
```bash
npm run telegram
```

启动后可通过 Bot 随时询问新闻问题，需配置 `TELEGRAM_BOT_TOKEN` 和 `TELEGRAM_CHAT_ID`。

## 3. 功能开关配置

在 `.env` 中按需启用：

- 数据源开关
  - `INCLUDE_VE2X=true`
  - `INCLUDE_LINUX_DO=true`
  - `INCLUDE_REDDIT=true`
  - `INCLUDE_PRODUCT_HUNT=true`
  - `INCLUDE_GITHUB_TRENDING=true`
  - `GITHUB_TOKEN`（可选，用于提高其他 GitHub API 调用的速率限制）
  - `INCLUDE_TWITTER=false`（启用时需配置 `X_BEARER_TOKEN`）
- 内容过滤
  - `NEWS_KEYWORDS=` 留空表示不过滤
  - `NEWS_TIME_RANGE=7d`
  - `MAX_ITEMS_PER_SOURCE=20`
- 输出路径
  - `OUTPUT_DAILY_DIR=docs/daily`
  - `TOPIC_STATS_PATH=data/topic-stats-history.json`
  - `OUTPUT_RSS_PATH=output/news-digest.xml`
- 推送（默认启用 Telegram）
  - Telegram：`TELEGRAM_BOT_TOKEN`、`TELEGRAM_CHAT_ID`
  - 邮件（Resend）：`EMAIL_ENABLED=true`、`RESEND_API_KEY`、`EMAIL_FROM`、`EMAIL_TO`

## 4. GitHub Actions 定时配置

工作流文件：`.github/workflows/digest-schedule.yml`

当前定时：

- 每天北京时间 `09:00` 和 `18:00`
- 对应 UTC cron：`0 1,10 * * *`

### 4.1 启用仓库写权限

进入：

- `Settings -> Actions -> General -> Workflow permissions`

选择：

- `Read and write permissions`

### 4.2 配置 Secrets

进入：

- `Settings -> Secrets and variables -> Actions -> New repository secret`

建议最小必配：

- `ZAI_API_KEY`
- `LLM_PROVIDER`
- `LLM_MODEL`

按需配置（可选）：

- 模型扩展：`OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`GOOGLE_GENERATIVE_AI_API_KEY`、`LLM_CANDIDATES`
- 数据源参数：`NEWS_KEYWORDS`、`RSS_FEEDS`、`VE2X_FEEDS`、`LINUX_DO_FEEDS`、`REDDIT_FEEDS`、`PRODUCT_HUNT_FEEDS`
- 开关：`INCLUDE_GITHUB_TRENDING`、`INCLUDE_VE2X`、`INCLUDE_LINUX_DO`、`INCLUDE_REDDIT`、`INCLUDE_PRODUCT_HUNT`、`INCLUDE_TWITTER`
- GitHub Trending：`GITHUB_TOKEN`（可选）
- X：`X_BEARER_TOKEN`、`X_KEYWORDS`
- 推送（Telegram 已默认支持）：
  - `TELEGRAM_BOT_TOKEN`、`TELEGRAM_CHAT_ID`
  - Email（可选）：`EMAIL_ENABLED`、`RESEND_API_KEY`、`EMAIL_FROM`、`EMAIL_TO`

## 5. 手动验证流程

1. 推送代码后，打开 `Actions` 页面  
2. 选择 `Self News Digest Schedule`  
3. 点击 `Run workflow`  
4. 检查运行日志是否成功  
5. 查看仓库是否自动提交更新文件

成功标准：

- Workflow 绿色通过
- 仓库出现自动提交（`chore(digest): update daily digest [skip ci]`）
- `README.md`、`docs/daily`、`data`、`output` 有更新

## 6. 常见问题排查

- 报错 `401/403`
  - 检查对应 API Key Secret 是否正确
- 工作流无法 push
  - 检查 Actions 写权限是否为 `Read and write`
- 没有抓到某些来源
  - 检查对应 `INCLUDE_*` 开关及 feed 地址
- GitHub Trending 数量偏少或偶发失败
  - 检查 `INCLUDE_GITHUB_TRENDING=true`
  - 爬虫方式偶尔可能因网络波动失败，已内置重试机制
- 邮件未发送
  - 检查 `EMAIL_ENABLED=true` 且 Resend 三项参数齐全
- README 未更新
  - 确认 `UPDATE_README=true`

## 7. 推荐上线顺序

1. 本地跑通 `npm start`
2. 配置 Secrets（包含 Telegram 推送配置）并手动触发一次 Actions
3. 观察 1-2 天定时结果后，按需开启邮件推送
