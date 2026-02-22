/**
 * 新闻文章通用工具函数
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
