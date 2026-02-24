/**
 * 新闻文章通用工具函数
 *
 * 教学要点：
 * - 去重算法实现
 * - 字符串标准化处理
 * - Set 数据结构的高效查找
 */

import type { NewsArticle } from '../types/news.types.js';

/**
 * 判断文章是否匹配关键词
 */
export function matchesKeywords(article: NewsArticle, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const text = `${article.title} ${article.summary} ${(article.tags || []).join(' ')}`.toLowerCase();
  return keywords.some(keyword => text.includes(keyword.toLowerCase()));
}

/**
 * 基于标题和 URL 去重文章
 */
export function dedupArticles(articles: NewsArticle[]): NewsArticle[] {
  const seen = new Set<string>();
  const result: NewsArticle[] = [];

  for (const article of articles) {
    const normalizedTitle = article.title.toLowerCase().replace(/[^\w\s\u4e00-\u9fa5]/g, '').trim();
    const normalizedUrl = article.url.split('?')[0].trim().toLowerCase();
    const key = `${normalizedTitle}|${normalizedUrl}`;

    if (seen.has(key)) continue;
    seen.add(key);
    result.push(article);
  }

  return result;
}

/**
 * 历史文章接口
 */
export interface HistoricalArticle {
  title: string;
  url: string;
  source: string;
  date: string;
}

/**
 * 与历史记录去重
 * @param articles 当前抓取的文章
 * @param historicalArticles 历史文章列表
 * @param days 历史记录天数（默认 7 天）
 * @returns 去重后的文章列表和被过滤的数量
 */
export interface DedupWithHistoryResult {
  articles: NewsArticle[];
  filteredCount: number;
  historicalCount: number;
}

export function dedupWithHistory(
  articles: NewsArticle[],
  historicalArticles: HistoricalArticle[]
): DedupWithHistoryResult {
  // 构建历史记录的 URL 和标题集合
  const historicalUrls = new Set<string>();
  const historicalTitles = new Set<string>();

  for (const hist of historicalArticles) {
    // 标准化 URL
    const normalizedUrl = hist.url.split('?')[0].trim().toLowerCase();
    historicalUrls.add(normalizedUrl);

    // 标准化标题
    const normalizedTitle = hist.title.toLowerCase().replace(/[^\w\s\u4e00-\u9fa5]/g, '').trim();
    historicalTitles.add(normalizedTitle);
  }

  const result: NewsArticle[] = [];
  const seen = new Set<string>();
  let filteredCount = 0;

  for (const article of articles) {
    // 标准化当前文章的 URL 和标题
    const normalizedUrl = article.url.split('?')[0].trim().toLowerCase();
    const normalizedTitle = article.title.toLowerCase().replace(/[^\w\s\u4e00-\u9fa5]/g, '').trim();
    const key = `${normalizedTitle}|${normalizedUrl}`;

    // 检查是否与历史记录重复
    const isUrlDuplicate = historicalUrls.has(normalizedUrl);
    const isTitleSimilar = historicalTitles.has(normalizedTitle);

    if (isUrlDuplicate || isTitleSimilar) {
      // 与历史记录重复，跳过
      filteredCount++;
      continue;
    }

    // 检查当前批次内是否重复
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(article);
  }

  return {
    articles: result,
    filteredCount,
    historicalCount: historicalArticles.length
  };
}
