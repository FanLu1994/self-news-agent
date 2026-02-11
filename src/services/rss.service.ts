/**
 * RSS Feed 服务
 * 
 * 教学要点：
 * 1. RSS 解析库的使用
 * 2. 多个 feed 源的并行处理
 * 3. 数据标准化和转换
 * 4. 错误处理和降级
 * 5. 中文编码处理
 */

import Parser from 'rss-parser';
import type { NewsArticle, RSSFeedItem, TimeRange } from '../types/news.types.js';

/**
 * RSS Feed 配置
 */
interface RSSFeedConfig {
  name: string;
  url: string;
  language: 'zh' | 'en';
  category: string;
}

/**
 * 中文 AI/科技 RSS Feeds
 */
const RSS_FEEDS: RSSFeedConfig[] = [
  {
    name: '机器之心',
    url: 'https://www.jiqizhixin.com/rss',
    language: 'zh',
    category: 'ai'
  },
  {
    name: '新智元',
    url: 'https://rsshub.app/cls/depth/1024',
    language: 'zh',
    category: 'ai'
  },
  {
    name: 'AI科技大本营',
    url: 'https://blog.csdn.net/dQCFKyQa/rss/list',
    language: 'zh',
    category: 'ai'
  },
  // 备用英文源
  {
    name: 'MIT Technology Review AI',
    url: 'https://www.technologyreview.com/feed/',
    language: 'en',
    category: 'ai'
  }
];

/**
 * RSS 服务类
 */
export class RSSService {
  private parser: Parser;

  constructor() {
    this.parser = new Parser({
      timeout: 10000, // 10 秒超时
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AI News Agent/1.0)'
      }
    });
  }

  /**
   * 获取单个 RSS Feed
   */
  private async fetchFeed(config: RSSFeedConfig): Promise<NewsArticle[]> {
    try {
      console.log(`  Fetching ${config.name}...`);
      const feed = await this.parser.parseURL(config.url);

      if (!feed.items || feed.items.length === 0) {
        console.log(`  ⚠️  No items from ${config.name}`);
        return [];
      }

      const articles = feed.items.map((item, index) => 
        this.convertToArticle(item as RSSFeedItem, config, index)
      ).filter((article): article is NewsArticle => article !== null);

      console.log(`  ✓ ${config.name}: ${articles.length} articles`);
      return articles;

    } catch (error) {
      console.error(`  ❌ Error fetching ${config.name}:`, error instanceof Error ? error.message : error);
      return [];
    }
  }

  /**
   * 将 RSS Item 转换为 NewsArticle
   */
  private convertToArticle(
    item: RSSFeedItem,
    config: RSSFeedConfig,
    index: number
  ): NewsArticle | null {
    if (!item.title || !item.link) {
      return null;
    }

    // 生成摘要
    const summary = item.contentSnippet 
      ? item.contentSnippet.substring(0, 200).trim() + '...'
      : item.title;

    // 解析发布时间
    const publishedAt = item.pubDate 
      ? new Date(item.pubDate).toISOString()
      : new Date().toISOString();

    return {
      id: `rss-${config.name}-${index}-${Date.now()}`,
      title: item.title,
      summary,
      url: item.link,
      source: config.name,
      author: item.creator,
      publishedAt,
      category: 'ai',
      language: config.language,
      tags: item.categories || []
    };
  }

  /**
   * 检查时间范围
   */
  private isWithinTimeRange(article: NewsArticle, timeRange: TimeRange): boolean {
    const now = Date.now();
    const articleTime = new Date(article.publishedAt).getTime();

    const ranges: Record<TimeRange, number> = {
      '1d': 24 * 60 * 60 * 1000,
      '3d': 3 * 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
    };

    const rangeMs = ranges[timeRange];
    return (now - articleTime) <= rangeMs;
  }

  /**
   * 获取中文 AI 新闻
   * 
   * @param options 获取选项
   * @returns 中文新闻文章列表
   */
  async fetchChineseNews(options: {
    limit: number;
    timeRange: TimeRange;
  }): Promise<NewsArticle[]> {
    const { limit, timeRange } = options;

    // 并行获取所有中文 RSS feeds
    const chineseFeeds = RSS_FEEDS.filter(feed => feed.language === 'zh');
    
    const feedPromises = chineseFeeds.map(config => 
      this.fetchFeed(config)
    );

    const feedResults = await Promise.all(feedPromises);

    // 合并所有结果
    let allArticles = feedResults.flat();

    // 过滤时间范围
    allArticles = allArticles.filter(article => 
      this.isWithinTimeRange(article, timeRange)
    );

    // 按发布时间排序（最新的在前）
    allArticles.sort((a, b) => 
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );

    // 去重（基于标题相似度）
    allArticles = this.deduplicateArticles(allArticles);

    // 限制数量
    return allArticles.slice(0, limit);
  }

  /**
   * 获取所有新闻（包括英文）
   */
  async fetchAllNews(options: {
    limit: number;
    timeRange: TimeRange;
  }): Promise<NewsArticle[]> {
    const { limit, timeRange } = options;

    // 并行获取所有 RSS feeds
    const feedPromises = RSS_FEEDS.map(config => 
      this.fetchFeed(config)
    );

    const feedResults = await Promise.all(feedPromises);

    // 合并所有结果
    let allArticles = feedResults.flat();

    // 过滤时间范围
    allArticles = allArticles.filter(article => 
      this.isWithinTimeRange(article, timeRange)
    );

    // 按发布时间排序
    allArticles.sort((a, b) => 
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );

    // 去重
    allArticles = this.deduplicateArticles(allArticles);

    // 限制数量
    return allArticles.slice(0, limit);
  }

  /**
   * 去重文章（基于标题相似度）
   */
  private deduplicateArticles(articles: NewsArticle[]): NewsArticle[] {
    const seen = new Set<string>();
    const result: NewsArticle[] = [];

    for (const article of articles) {
      // 简单的去重：标准化标题
      const normalizedTitle = article.title
        .toLowerCase()
        .replace(/[^\w\s\u4e00-\u9fa5]/g, '')
        .trim();

      if (!seen.has(normalizedTitle)) {
        seen.add(normalizedTitle);
        result.push(article);
      }
    }

    return result;
  }

  /**
   * 按关键词搜索（简单的标题匹配）
   */
  async searchNews(keywords: string[], limit: number = 20): Promise<NewsArticle[]> {
    // 获取最近 7 天的所有新闻
    const allArticles = await this.fetchAllNews({
      limit: 100,
      timeRange: '7d'
    });

    // 关键词匹配
    const keywordsLower = keywords.map(k => k.toLowerCase());
    
    const matchedArticles = allArticles.filter(article => {
      const searchText = `${article.title} ${article.summary}`.toLowerCase();
      return keywordsLower.some(keyword => searchText.includes(keyword));
    });

    return matchedArticles.slice(0, limit);
  }
}

/**
 * 导出单例实例
 */
export const rssService = new RSSService();
