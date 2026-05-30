import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CurationProfile } from './types/news.types.js';

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
    aiHot?: { enabled: boolean; baseUrl?: string; take?: number };
    hex2077?: { enabled: boolean; feeds?: string[] };
    twitter: { enabled: boolean };
    githubTrending: { enabled: boolean; languages?: string[] };
    hackerNews: { enabled: boolean };
  };
  curation?: {
    profile?: CurationProfile;
    maxHighlights?: number;
    minScore?: number;
  };
  dedup?: {
    historyDays?: number;
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
  includeRss: boolean;
  ve2xFeeds: string[];
  linuxDoFeeds: string[];
  redditFeeds: string[];
  productHuntFeeds: string[];
  includeAiHot: boolean;
  aiHotBaseUrl: string;
  aiHotTake: number;
  includeHex2077: boolean;
  hex2077Feeds: string[];
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
  curationProfile: CurationProfile;
  maxHighlights: number;
  minScore: number;
  historyDays: number;
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

function parseCurationProfile(value: string | undefined): CurationProfile {
  return value === 'ai-developer' ? value : 'ai-developer';
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
        aiHot: { enabled: true, baseUrl: 'https://aihot.virxact.com', take: 50 },
        hex2077: { enabled: true, feeds: ['https://hex2077.dev/rss-zh-CN.xml'] },
        twitter: { enabled: false },
        githubTrending: { enabled: true },
        hackerNews: { enabled: true }
      },
      curation: {
        profile: 'ai-developer',
        maxHighlights: 8,
        minScore: 45
      },
      dedup: {
        historyDays: 7
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
    includeRss: parseBoolean(json.sources.rss.enabled, false),
    ve2xFeeds: json.sources.ve2x.feeds,
    linuxDoFeeds: json.sources.linuxDo.feeds,
    redditFeeds: json.sources.reddit.feeds,
    productHuntFeeds: json.sources.productHunt.feeds,
    includeAiHot: parseBoolean(json.sources.aiHot?.enabled, true),
    aiHotBaseUrl: process.env.AIHOT_BASE_URL || json.sources.aiHot?.baseUrl || 'https://aihot.virxact.com',
    aiHotTake: Math.min(parsePositiveInt(json.sources.aiHot?.take, 50), 100),
    includeHex2077: parseBoolean(json.sources.hex2077?.enabled, true),
    hex2077Feeds: json.sources.hex2077?.feeds && Array.isArray(json.sources.hex2077.feeds)
      ? json.sources.hex2077.feeds
      : ['https://hex2077.dev/rss-zh-CN.xml'],

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
    curationProfile: parseCurationProfile(process.env.CURATION_PROFILE || json.curation?.profile),
    maxHighlights: Math.min(parsePositiveInt(json.curation?.maxHighlights, 8), 12),
    minScore: parsePositiveInt(json.curation?.minScore, 45),
    historyDays: Math.min(parsePositiveInt(json.dedup?.historyDays, 7), 30),

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
