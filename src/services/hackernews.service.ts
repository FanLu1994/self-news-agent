/**
 * HackerNews API 服务
 *
 * 教学要点：
 * 1. HTTP API 调用封装
 * 2. 异步数据获取
 * 3. 错误处理和重试机制
 * 4. 数据过滤和转换
 * 5. AI 相关内容识别
 */

import type { HNItem, NewsArticle, TimeRange } from '../types/news.types.js';
import { translationService } from './translation.service.js';

/**
 * HackerNews API 基础 URL
 */
const HN_API_BASE = 'https://hacker-news.firebaseio.com/v0';

/**
 * AI 相关关键词（用于过滤）
 */
const AI_KEYWORDS = [
  // 通用 AI
  'ai', 'artificial intelligence', 'machine learning', 'ml', 'deep learning',
  'neural network', 'transformer', 'llm', 'large language model',

  // 模型和技术
  'gpt', 'chatgpt', 'claude', 'gemini', 'llama', 'mistral', 'palm',
  'bert', 'dalle', 'midjourney', 'stable diffusion', 'diffusion model',

  // NLP
  'nlp', 'natural language processing', 'text generation', 'sentiment analysis',
  'translation', 'embedding', 'tokenization',

  // CV
  'computer vision', 'cv', 'image recognition', 'object detection',
  'face recognition', 'ocr', 'image generation',

  // ML 技术
  'reinforcement learning', 'supervised learning', 'unsupervised learning',
  'transfer learning', 'fine-tuning', 'rag', 'retrieval augmented',

  // 框架和工具
  'pytorch', 'tensorflow', 'huggingface', 'langchain', 'openai',
  'anthropic', 'google ai', 'deepmind', 'openrouter',

  // 机器人和自动化
  'robotics', 'autonomous', 'self-driving', 'automation',

  // 中文关键词
  '人工智能', '机器学习', '深度学习', '神经网络', '大模型',
  '自然语言处理', '计算机视觉', '智能体', 'agent'
];

/**
 * 带重试的 fetch
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries: number = 3
): Promise<Response> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时

      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response;
    } catch (error) {
      lastError = error as Error;
      // 如果是最后一次尝试，或者错误不是网络相关，直接抛出
      if (attempt === maxRetries - 1) {
        throw lastError;
      }
      // 等待一段时间后重试（指数退避）
      await sleep(Math.pow(2, attempt) * 1000);
    }
  }

  throw lastError || new Error('Fetch failed after retries');
}

/**
 * 延迟函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * HackerNews 服务类
 */
export class HackerNewsService {
  /**
   * 获取 Top Stories IDs
   */
  async fetchTopStories(limit: number = 50): Promise<number[]> {
    try {
      const response = await fetchWithRetry(`${HN_API_BASE}/topstories.json`);
      const ids: number[] = await response.json();
      return ids.slice(0, limit);
    } catch (error) {
      console.error('Error fetching HN top stories:', error);
      return [];
    }
  }

  /**
   * 获取 Best Stories IDs
   */
  async fetchBestStories(limit: number = 50): Promise<number[]> {
    try {
      const response = await fetchWithRetry(`${HN_API_BASE}/beststories.json`);
      const ids: number[] = await response.json();
      return ids.slice(0, limit);
    } catch (error) {
      console.error('Error fetching HN best stories:', error);
      return [];
    }
  }

  /**
   * 获取单个 Item 详情
   */
  async fetchItem(id: number): Promise<HNItem | null> {
    try {
      const response = await fetchWithRetry(`${HN_API_BASE}/item/${id}.json`);
      const item: HNItem = await response.json();
      return item;
    } catch (error) {
      // 静默失败，不影响其他 items
      return null;
    }
  }

  /**
   * 批量获取 Items 详情（使用 allSettled 避免单个失败影响整体）
   */
  async fetchItems(ids: number[]): Promise<HNItem[]> {
    // 分批处理，避免过多并发请求
    const batchSize = 20;
    const results: HNItem[] = [];

    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      const promises = batch.map(id => this.fetchItem(id));
      const settled = await Promise.allSettled(promises);

      for (const result of settled) {
        if (result.status === 'fulfilled' && result.value !== null) {
          results.push(result.value);
        }
      }

      // 批次之间稍作延迟，避免请求过快
      if (i + batchSize < ids.length) {
        await sleep(100);
      }
    }

    return results;
  }

  /**
   * 检查是否为 AI 相关内容
   */
  private isAIRelated(item: HNItem): boolean {
    const searchText = [
      item.title?.toLowerCase() || '',
      item.text?.toLowerCase() || ''
    ].join(' ');

    // 检查是否包含任何 AI 关键词
    return AI_KEYWORDS.some(keyword =>
      searchText.includes(keyword.toLowerCase())
    );
  }

  /**
   * 检查时间范围
   */
  private isWithinTimeRange(item: HNItem, timeRange: TimeRange): boolean {
    const now = Date.now() / 1000; // Unix timestamp in seconds
    const itemTime = item.time;

    const ranges: Record<TimeRange, number> = {
      '1d': 24 * 60 * 60,
      '3d': 3 * 24 * 60 * 60,
      '7d': 7 * 24 * 60 * 60,
    };

    const rangeSeconds = ranges[timeRange];
    return (now - itemTime) <= rangeSeconds;
  }

  /**
   * 将 HN Item 转换为 NewsArticle
   */
  private convertToArticle(item: HNItem): NewsArticle | null {
    if (!item.title || item.type !== 'story') {
      return null;
    }

    // 生成摘要（从标题或文本）
    const summary = item.text
      ? item.text.substring(0, 200).replace(/<[^>]*>/g, '') + '...'
      : item.title;

    return {
      id: `hn-${item.id}`,
      title: item.title,
      summary,
      url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
      source: 'HackerNews',
      sourceType: 'hn',
      author: item.by,
      publishedAt: new Date(item.time * 1000).toISOString(),
      category: 'ai', // 默认分类，后续可以细化
      language: 'en',
      score: item.score,
      commentCount: item.descendants,
      tags: []
    };
  }

  /**
   * 获取 AI 相关新闻
   *
   * @param options 获取选项
   * @returns AI 相关的新闻文章列表
   */
  async fetchAINews(options: {
    limit: number;
    timeRange: TimeRange;
    translate?: boolean;  // 是否自动翻译
  }): Promise<NewsArticle[]> {
    const { limit, timeRange, translate = true } = options;

    // 获取更多 IDs 以便过滤后仍有足够的文章
    const fetchLimit = Math.min(limit * 5, 200);

    // 并行获取 top 和 best stories
    const [topIds, bestIds] = await Promise.all([
      this.fetchTopStories(fetchLimit),
      this.fetchBestStories(fetchLimit)
    ]);

    // 合并并去重
    const allIds = Array.from(new Set([...topIds, ...bestIds]));

    // 获取详情
    const items = await this.fetchItems(allIds);

    // 过滤：AI 相关 + 时间范围 + 是 story 类型
    const filteredItems = items.filter(item =>
      item.type === 'story' &&
      this.isAIRelated(item) &&
      this.isWithinTimeRange(item, timeRange)
    );

    // 按分数排序
    filteredItems.sort((a, b) => (b.score || 0) - (a.score || 0));

    // 转换为 NewsArticle 并限制数量
    let articles = filteredItems
      .slice(0, limit)
      .map(item => this.convertToArticle(item))
      .filter((article): article is NewsArticle => article !== null);

    // 自动翻译
    if (translate && articles.length > 0) {
      console.log(`  🌐 正在翻译 ${articles.length} 篇 HN 文章...`);
      articles = await translationService.translateArticles(articles, 'zh');
      console.log(`  ✅ 翻译完成`);
    }

    return articles;
  }

  /**
   * 搜索 AI 新闻（按关键词）
   */
  async searchAINews(keywords: string[], limit: number = 20): Promise<NewsArticle[]> {
    // HackerNews 官方 API 不支持搜索，这里使用 Algolia HN Search API
    try {
      const query = keywords.join(' ');
      const response = await fetch(
        `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${limit}`
      );

      if (!response.ok) {
        throw new Error(`Algolia API error: ${response.status}`);
      }

      const data = await response.json();
      const hits = data.hits || [];

      return hits.map((hit: any) => ({
        id: `hn-${hit.objectID}`,
        title: hit.title || hit.story_title,
        summary: hit.story_text?.substring(0, 200) || hit.title,
        url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
        source: 'HackerNews',
        sourceType: 'hn' as const,
        author: hit.author,
        publishedAt: new Date(hit.created_at).toISOString(),
        category: 'ai' as const,
        language: 'en' as const,
        score: hit.points,
        commentCount: hit.num_comments,
        tags: []
      }));
    } catch (error) {
      console.error('Error searching HN:', error);
      return [];
    }
  }
}

/**
 * 导出单例实例
 */
export const hackerNewsService = new HackerNewsService();
