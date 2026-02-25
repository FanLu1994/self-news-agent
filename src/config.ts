import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface AppConfig {
  keywords: {
    news: string;
    x: string;
  };
  fetch: {
    maxItemsPerSource: number;
    timeRange: '1d' | '3d' | '7d';
    summaryStyle: 'brief' | 'detailed' | 'keywords';
  };
  sources: {
    rss: { enabled: boolean; feeds: string[] };
    ve2x: { enabled: boolean; feeds: string[] };
    linuxDo: { enabled: boolean; feeds: string[] };
    reddit: { enabled: boolean; feeds: string[] };
    productHunt: { enabled: boolean; feeds: string[] };
    twitter: { enabled: boolean };
    githubTrending: { enabled: boolean; languages?: string[] };
    hackerNews: { enabled: boolean };
  };
  output: {
    rssPath: string;
    dailyDir: string;
    topicStatsPath: string;
    readmePath: string;
    updateReadme: boolean;
  };
  push: {
    telegram: { enabled: boolean };
    email: { enabled: boolean; from: string; to: string };
  };
}

export interface ParsedConfig {
  keywords: string[];
  rssFeeds: string[];
  ve2xFeeds: string[];
  linuxDoFeeds: string[];
  redditFeeds: string[];
  productHuntFeeds: string[];
  xBearerToken?: string;
  xQueryKeywords: string[];
  githubToken?: string;
  githubTrendingLanguages: string[];
  includeGithubTrending: boolean;
  includeVe2x: boolean;
  includeLinuxDo: boolean;
  includeReddit: boolean;
  includeProductHunt: boolean;
  includeTwitter: boolean;
  maxItemsPerSource: number;
  timeRange: '1d' | '3d' | '7d';
  summaryStyle: 'brief' | 'detailed' | 'keywords';
  telegramBotToken?: string;
  telegramChatId?: string;
  outputRssPath: string;
  outputDailyDir: string;
  topicStatsPath: string;
  readmePath: string;
  updateReadme: boolean;
  emailEnabled: boolean;
  emailProvider: 'resend';
  resendApiKey?: string;
  emailFrom?: string;
  emailTo?: string;
}

function splitCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function parseTimeRange(value: string | undefined): '1d' | '3d' | '7d' {
  if (value === '1d' || value === '3d' || value === '7d') return value;
  return '7d';
}

function parseSummaryStyle(value: string | undefined): 'brief' | 'detailed' | 'keywords' {
  if (value === 'brief' || value === 'detailed' || value === 'keywords') return value;
  return 'detailed';
}

function parsePositiveInt(value: number | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  return fallback;
}

function parseBoolean(value: boolean | undefined, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * 加载 config.json 配置文件
 */
function loadJsonConfig(): AppConfig {
  const configPath = resolve(process.cwd(), 'config.json');
  try {
    const content = readFileSync(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn(`Failed to load config.json, using defaults: ${error}`);
    return {
      keywords: { news: '', x: 'ai,llm,agent' },
      fetch: {
        maxItemsPerSource: 20,
        timeRange: '7d',
        summaryStyle: 'detailed'
      },
      sources: {
        rss: { enabled: false, feeds: [] },
        ve2x: { enabled: true, feeds: ['https://www.v2ex.com/index.xml'] },
        linuxDo: { enabled: true, feeds: ['https://linux.do/latest.rss'] },
        reddit: {
          enabled: true,
          feeds: [
            'https://www.reddit.com/r/artificial/.rss',
            'https://www.reddit.com/r/MachineLearning/.rss',
            'https://www.reddit.com/r/deeplearning/.rss',
            'https://www.reddit.com/r/LocalLLaMA/.rss',
            'https://www.reddit.com/r/OpenAI/.rss',
            'https://www.reddit.com/r/compsci/.rss'
          ]
        },
        productHunt: { enabled: true, feeds: ['https://www.producthunt.com/feed'] },
        twitter: { enabled: false },
        githubTrending: { enabled: true },
        hackerNews: { enabled: true }
      },
      output: {
        rssPath: 'output/news-digest.xml',
        dailyDir: 'docs/daily',
        topicStatsPath: 'data/topic-stats-history.json',
        readmePath: 'README.md',
        updateReadme: true
      },
      push: {
        telegram: { enabled: false },
        email: { enabled: false, from: 'Self News <digest@yourdomain.com>', to: 'you@example.com' }
      }
    };
  }
}

export function loadConfig(): ParsedConfig {
  const json = loadJsonConfig();

  // 环境变量覆盖（优先级更高）
  const keywords = splitCsv(process.env.NEWS_KEYWORDS || json.keywords.news);
  const xKeywords = splitCsv(process.env.X_KEYWORDS || json.keywords.x);

  return {
    // 关键字
    keywords: keywords.length > 0 ? keywords : splitCsv(json.keywords.news),
    xQueryKeywords: xKeywords.length > 0 ? xKeywords : splitCsv(json.keywords.x),

    // 数据源
    rssFeeds: json.sources.rss.feeds,
    ve2xFeeds: json.sources.ve2x.feeds,
    linuxDoFeeds: json.sources.linuxDo.feeds,
    redditFeeds: json.sources.reddit.feeds,
    productHuntFeeds: json.sources.productHunt.feeds,

    // Twitter
    xBearerToken: process.env.X_BEARER_TOKEN,

    // GitHub Trending（token 仅从 env GH_TOKEN 读取，语言从 config 配置）
    githubToken: process.env.GH_TOKEN,
    githubTrendingLanguages:
      json.sources.githubTrending?.languages && Array.isArray(json.sources.githubTrending.languages)
        ? json.sources.githubTrending.languages
        : ['python', 'javascript', 'typescript', 'go', 'csharp', 'rust', 'vue', 'react'],

    // 开关
    includeGithubTrending: json.sources.githubTrending.enabled,
    includeVe2x: json.sources.ve2x.enabled,
    includeLinuxDo: json.sources.linuxDo.enabled,
    includeReddit: json.sources.reddit.enabled,
    includeProductHunt: json.sources.productHunt.enabled,
    includeTwitter: json.sources.twitter.enabled,

    // 抓取配置
    maxItemsPerSource: Math.min(parsePositiveInt(json.fetch.maxItemsPerSource, 20), 20),
    timeRange: parseTimeRange(json.fetch.timeRange),
    summaryStyle: parseSummaryStyle(json.fetch.summaryStyle),

    // Telegram
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,

    // 输出路径
    outputRssPath: process.env.OUTPUT_RSS_PATH || json.output.rssPath,
    outputDailyDir: process.env.OUTPUT_DAILY_DIR || json.output.dailyDir,
    topicStatsPath: process.env.TOPIC_STATS_PATH || json.output.topicStatsPath,
    readmePath: process.env.README_PATH || json.output.readmePath,
    updateReadme: parseBoolean(process.env.UPDATE_README !== undefined ? process.env.UPDATE_README === 'true' : undefined, json.output.updateReadme),

    // Email
    emailEnabled: process.env.EMAIL_ENABLED === 'true' || json.push.email.enabled,
    emailProvider: 'resend' as const,
    resendApiKey: process.env.RESEND_API_KEY,
    emailFrom: process.env.EMAIL_FROM || json.push.email.from,
    emailTo: process.env.EMAIL_TO || json.push.email.to
  };
}
