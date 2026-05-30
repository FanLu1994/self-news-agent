/**
 * 新闻文章通用工具函数
 */

import type { NewsArticle } from '../types/news.types.js';

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'fbclid',
  'gclid',
  'ref',
  'ref_src'
]);

/**
 * 判断文章是否匹配关键词
 */
export function matchesKeywords(article: NewsArticle, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const safeTags = (article.tags || []).map(tag =>
    typeof tag === 'string' ? tag : String(tag)
  );
  const text = `${article.title} ${article.summary} ${safeTags.join(' ')}`.toLowerCase();
  return keywords.some(keyword => text.includes(keyword.toLowerCase()));
}

export function canonicalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';

    for (const key of Array.from(parsed.searchParams.keys())) {
      const lower = key.toLowerCase();
      if (TRACKING_PARAMS.has(lower) || lower.startsWith('utm_')) {
        parsed.searchParams.delete(key);
      }
    }

    return parsed.toString().replace(/\?$/, '').toLowerCase();
  } catch {
    return url.split('#')[0].split('?')[0].trim().replace(/\/+$/, '').toLowerCase();
  }
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/show hn:\s*/g, '')
    .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleTokens(title: string): Set<string> {
  return new Set(normalizeTitle(title).split(/\s+/).filter(token => token.length > 1));
}

export function titleSimilarity(left: string, right: string): number {
  const leftTokens = titleTokens(left);
  const rightTokens = titleTokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }

  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

function articleQualityScore(article: NewsArticle): number {
  return (
    (article.score || 0) +
    (article.commentCount || 0) * 2 +
    (article.summary ? Math.min(article.summary.length / 20, 20) : 0)
  );
}

function shouldReplaceArticle(existing: NewsArticle, incoming: NewsArticle): boolean {
  if (incoming.sourceType === 'aihot' && existing.sourceType !== 'aihot') return true;
  if (incoming.sourceType === 'hex2077' && !['aihot', 'hex2077'].includes(existing.sourceType)) return true;
  return articleQualityScore(incoming) > articleQualityScore(existing);
}

/**
 * 基于 canonical URL 和标题相似度去重文章。
 */
export function dedupArticles(articles: NewsArticle[]): NewsArticle[] {
  const byUrl = new Map<string, NewsArticle>();
  const result: NewsArticle[] = [];

  for (const article of articles) {
    const normalizedUrl = canonicalizeUrl(article.url);
    const existingByUrl = byUrl.get(normalizedUrl);
    if (existingByUrl) {
      if (shouldReplaceArticle(existingByUrl, article)) {
        const index = result.indexOf(existingByUrl);
        if (index >= 0) result[index] = article;
        byUrl.set(normalizedUrl, article);
      }
      continue;
    }

    const similar = result.find(item =>
      item.source === article.source &&
      titleSimilarity(item.title, article.title) >= 0.82
    );
    if (similar) {
      if (shouldReplaceArticle(similar, article)) {
        const index = result.indexOf(similar);
        if (index >= 0) result[index] = article;
        byUrl.set(normalizedUrl, article);
      } else {
        byUrl.set(normalizedUrl, similar);
      }
      continue;
    }

    byUrl.set(normalizedUrl, article);
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
  const historicalUrls = new Set<string>();
  const historicalTitles = new Set<string>();

  for (const hist of historicalArticles) {
    historicalUrls.add(canonicalizeUrl(hist.url));
    historicalTitles.add(normalizeTitle(hist.title));
  }

  const result: NewsArticle[] = [];
  const seen = new Set<string>();
  let filteredCount = 0;

  for (const article of articles) {
    const normalizedUrl = canonicalizeUrl(article.url);
    const normalizedTitle = normalizeTitle(article.title);
    const key = `${normalizedTitle}|${normalizedUrl}`;

    const isUrlDuplicate = historicalUrls.has(normalizedUrl);
    const isTitleSimilar = historicalTitles.has(normalizedTitle) ||
      Array.from(historicalTitles).some(title => titleSimilarity(title, normalizedTitle) >= 0.9);

    if (isUrlDuplicate || isTitleSimilar) {
      filteredCount += 1;
      continue;
    }

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
