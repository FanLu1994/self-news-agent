import 'dotenv/config';

export interface AppConfig {
  keywords: string[];
  rssFeeds: string[];
  ve2xFeeds: string[];
  linuxDoFeeds: string[];
  redditFeeds: string[];
  productHuntFeeds: string[];
  xBearerToken?: string;
  xQueryKeywords: string[];
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

const DEFAULT_VE2X_FEEDS = [
  'https://www.v2ex.com/index.xml'
];

const DEFAULT_LINUX_DO_FEEDS = [
  'https://linux.do/latest.rss'
];

const DEFAULT_REDDIT_FEEDS = [
  'https://www.reddit.com/r/artificial/.rss',
  'https://www.reddit.com/r/MachineLearning/.rss',
  'https://www.reddit.com/r/deeplearning/.rss',
  'https://www.reddit.com/r/LocalLLaMA/.rss',
  'https://www.reddit.com/r/OpenAI/.rss',
  'https://www.reddit.com/r/CharacterAI/.rss',
  'https://www.reddit.com/r/compsci/.rss'
];

const DEFAULT_PRODUCT_HUNT_FEEDS = [
  'https://www.producthunt.com/feed'
];

const DEFAULT_KEYWORDS: string[] = [];

export function loadConfig(): AppConfig {
  const rssFeeds = splitCsv(process.env.RSS_FEEDS);
  const ve2xFeeds = splitCsv(process.env.VE2X_FEEDS);
  const linuxDoFeeds = splitCsv(process.env.LINUX_DO_FEEDS);
  const redditFeeds = splitCsv(process.env.REDDIT_FEEDS);
  const productHuntFeeds = splitCsv(process.env.PRODUCT_HUNT_FEEDS);
  const keywords = splitCsv(process.env.NEWS_KEYWORDS);
  const xKeywords = splitCsv(process.env.X_KEYWORDS);
  const ghLanguages = splitCsv(process.env.GITHUB_TRENDING_LANGUAGES);

  return {
    keywords: keywords.length > 0 ? keywords : DEFAULT_KEYWORDS,
    rssFeeds: rssFeeds.length > 0 ? rssFeeds : DEFAULT_RSS_FEEDS,
    ve2xFeeds: ve2xFeeds.length > 0 ? ve2xFeeds : DEFAULT_VE2X_FEEDS,
    linuxDoFeeds: linuxDoFeeds.length > 0 ? linuxDoFeeds : DEFAULT_LINUX_DO_FEEDS,
    redditFeeds: redditFeeds.length > 0 ? redditFeeds : DEFAULT_REDDIT_FEEDS,
    productHuntFeeds: productHuntFeeds.length > 0 ? productHuntFeeds : DEFAULT_PRODUCT_HUNT_FEEDS,
    xBearerToken: process.env.X_BEARER_TOKEN,
    xQueryKeywords: xKeywords.length > 0 ? xKeywords : (keywords.length > 0 ? keywords : DEFAULT_KEYWORDS),
    githubTrendingLanguages: ghLanguages.length > 0 ? ghLanguages : ['typescript', 'python', 'rust'],
    includeGithubTrending: parseBoolean(process.env.INCLUDE_GITHUB_TRENDING, true),
    includeVe2x: parseBoolean(process.env.INCLUDE_VE2X, true),
    includeLinuxDo: parseBoolean(process.env.INCLUDE_LINUX_DO, true),
    includeReddit: parseBoolean(process.env.INCLUDE_REDDIT, true),
    includeProductHunt: parseBoolean(process.env.INCLUDE_PRODUCT_HUNT, true),
    includeTwitter: parseBoolean(process.env.INCLUDE_TWITTER, false),
    maxItemsPerSource: parsePositiveInt(process.env.MAX_ITEMS_PER_SOURCE, 20),
    timeRange: parseTimeRange(process.env.NEWS_TIME_RANGE),
    summaryStyle: parseSummaryStyle(process.env.SUMMARY_STYLE),
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: process.env.TELEGRAM_CHAT_ID,
    outputRssPath: process.env.OUTPUT_RSS_PATH || 'output/news-digest.xml',
    outputDailyDir: process.env.OUTPUT_DAILY_DIR || 'docs/daily',
    topicStatsPath: process.env.TOPIC_STATS_PATH || 'data/topic-stats-history.json',
    readmePath: process.env.README_PATH || 'README.md',
    updateReadme: parseBoolean(process.env.UPDATE_README, true),
    emailEnabled: parseBoolean(process.env.EMAIL_ENABLED, false),
    emailProvider: 'resend',
    resendApiKey: process.env.RESEND_API_KEY,
    emailFrom: process.env.EMAIL_FROM,
    emailTo: process.env.EMAIL_TO
  };
}
