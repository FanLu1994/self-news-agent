import 'dotenv/config';

export interface AppConfig {
  keywords: string[];
  rssFeeds: string[];
  xBearerToken?: string;
  xQueryKeywords: string[];
  githubTrendingLanguages: string[];
  includeGithubTrending: boolean;
  maxItemsPerSource: number;
  timeRange: '1d' | '3d' | '7d';
  summaryStyle: 'brief' | 'detailed' | 'keywords';
  telegramBotToken?: string;
  telegramChatId?: string;
  outputRssPath: string;
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

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

const DEFAULT_RSS_FEEDS = [
  'https://www.jiqizhixin.com/rss',
  'https://www.technologyreview.com/feed/',
  'https://hnrss.org/frontpage'
];

const DEFAULT_KEYWORDS = [
  'ai',
  'artificial intelligence',
  'llm',
  'machine learning',
  'openai',
  'anthropic',
  'gemini',
  'agent'
];

export function loadConfig(): AppConfig {
  const rssFeeds = splitCsv(process.env.RSS_FEEDS);
  const keywords = splitCsv(process.env.NEWS_KEYWORDS);
  const xKeywords = splitCsv(process.env.X_KEYWORDS);
  const ghLanguages = splitCsv(process.env.GITHUB_TRENDING_LANGUAGES);

  return {
    keywords: keywords.length > 0 ? keywords : DEFAULT_KEYWORDS,
    rssFeeds: rssFeeds.length > 0 ? rssFeeds : DEFAULT_RSS_FEEDS,
    xBearerToken: process.env.X_BEARER_TOKEN,
    xQueryKeywords: xKeywords.length > 0 ? xKeywords : (keywords.length > 0 ? keywords : DEFAULT_KEYWORDS),
    githubTrendingLanguages: ghLanguages.length > 0 ? ghLanguages : ['typescript', 'python', 'rust'],
    includeGithubTrending: parseBoolean(process.env.INCLUDE_GITHUB_TRENDING, true),
    maxItemsPerSource: parsePositiveInt(process.env.MAX_ITEMS_PER_SOURCE, 20),
    timeRange: parseTimeRange(process.env.NEWS_TIME_RANGE),
    summaryStyle: parseSummaryStyle(process.env.SUMMARY_STYLE),
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,
    outputRssPath: process.env.OUTPUT_RSS_PATH || 'output/news-digest.xml'
  };
}
