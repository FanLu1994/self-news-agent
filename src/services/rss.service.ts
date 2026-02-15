import Parser from 'rss-parser';
import type { NewsArticle, RSSFeedItem, TimeRange } from '../types/news.types.js';

interface FetchRssOptions {
  feeds: string[];
  limit: number;
  timeRange: TimeRange;
  keywords: string[];
}

interface RSSFeedConfig {
  name: string;
  url: string;
  language: 'zh' | 'en';
}

const DEFAULT_FEED_CONFIGS: RSSFeedConfig[] = [
  { name: '机器之心', url: 'https://www.jiqizhixin.com/rss', language: 'zh' },
  { name: 'MIT Technology Review', url: 'https://www.technologyreview.com/feed/', language: 'en' },
  { name: 'HN Frontpage RSS', url: 'https://hnrss.org/frontpage', language: 'en' }
];

function inferFeedLanguage(url: string): 'zh' | 'en' {
  const zhHints = ['jiqizhixin', 'csdn', 'rsshub', '.cn', 'zhihu'];
  const lower = url.toLowerCase();
  return zhHints.some(h => lower.includes(h)) ? 'zh' : 'en';
}

export class RSSService {
  private parser: Parser;

  constructor() {
    this.parser = new Parser({
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AI News Agent/1.1)'
      }
    });
  }

  private buildFeedConfigs(feeds: string[]): RSSFeedConfig[] {
    if (feeds.length === 0) return DEFAULT_FEED_CONFIGS;

    return feeds.map((feedUrl, index) => {
      const matchedDefault = DEFAULT_FEED_CONFIGS.find(item => item.url === feedUrl);
      if (matchedDefault) return matchedDefault;
      return {
        name: `RSS-${index + 1}`,
        url: feedUrl,
        language: inferFeedLanguage(feedUrl)
      };
    });
  }

  private async fetchFeed(config: RSSFeedConfig): Promise<NewsArticle[]> {
    try {
      const feed = await this.parser.parseURL(config.url);
      if (!feed.items || feed.items.length === 0) return [];

      return feed.items
        .map((item, index) => this.convertToArticle(item as RSSFeedItem, config, index))
        .filter((article): article is NewsArticle => article !== null);
    } catch (error) {
      console.error(`RSS fetch failed: ${config.url}`, error instanceof Error ? error.message : error);
      return [];
    }
  }

  private convertToArticle(item: RSSFeedItem, config: RSSFeedConfig, index: number): NewsArticle | null {
    if (!item.title || !item.link) return null;

    const summary = item.contentSnippet
      ? `${item.contentSnippet.substring(0, 240).trim()}...`
      : item.title;

    const publishDate = item.pubDate ? new Date(item.pubDate) : new Date();

    return {
      id: `rss-${index}-${Math.abs(hashCode(item.link))}`,
      title: item.title,
      summary,
      url: item.link,
      source: config.name,
      sourceType: 'rss',
      author: item.creator,
      publishedAt: Number.isNaN(publishDate.getTime()) ? new Date().toISOString() : publishDate.toISOString(),
      category: 'ai',
      language: config.language,
      tags: item.categories || []
    };
  }

  private isWithinTimeRange(article: NewsArticle, timeRange: TimeRange): boolean {
    const now = Date.now();
    const articleTime = new Date(article.publishedAt).getTime();

    const ranges: Record<TimeRange, number> = {
      '1d': 24 * 60 * 60 * 1000,
      '3d': 3 * 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000
    };

    return now - articleTime <= ranges[timeRange];
  }

  private matchKeywords(article: NewsArticle, keywords: string[]): boolean {
    if (keywords.length === 0) return true;
    const searchText = `${article.title} ${article.summary} ${(article.tags || []).join(' ')}`.toLowerCase();
    return keywords.some(keyword => searchText.includes(keyword.toLowerCase()));
  }

  private deduplicateArticles(articles: NewsArticle[]): NewsArticle[] {
    const seen = new Set<string>();
    const result: NewsArticle[] = [];

    for (const article of articles) {
      const normalizedTitle = article.title.toLowerCase().replace(/[^\w\s\u4e00-\u9fa5]/g, '').trim();
      if (!normalizedTitle || seen.has(normalizedTitle)) continue;
      seen.add(normalizedTitle);
      result.push(article);
    }

    return result;
  }

  async fetchNews(options: FetchRssOptions): Promise<NewsArticle[]> {
    const configs = this.buildFeedConfigs(options.feeds);
    const chunks = await Promise.all(configs.map(config => this.fetchFeed(config)));

    let allArticles = chunks.flat();
    allArticles = allArticles.filter(article => this.isWithinTimeRange(article, options.timeRange));
    allArticles = allArticles.filter(article => this.matchKeywords(article, options.keywords));

    allArticles.sort((a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );

    allArticles = this.deduplicateArticles(allArticles);
    return allArticles.slice(0, options.limit);
  }

  async fetchChineseNews(options: { limit: number; timeRange: TimeRange }): Promise<NewsArticle[]> {
    const defaultZhFeeds = DEFAULT_FEED_CONFIGS.filter(feed => feed.language === 'zh').map(feed => feed.url);
    return this.fetchNews({
      feeds: defaultZhFeeds,
      limit: options.limit,
      timeRange: options.timeRange,
      keywords: []
    });
  }

  async fetchAllNews(options: { limit: number; timeRange: TimeRange }): Promise<NewsArticle[]> {
    return this.fetchNews({
      feeds: DEFAULT_FEED_CONFIGS.map(feed => feed.url),
      limit: options.limit,
      timeRange: options.timeRange,
      keywords: []
    });
  }
}

function hashCode(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export const rssService = new RSSService();
