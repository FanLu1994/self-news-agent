import { rssService } from './rss.service.js';
import type { NewsArticle, TimeRange } from '../types/news.types.js';

interface AiHotItem {
  id: string;
  title: string;
  title_en?: string | null;
  url: string;
  source: string;
  publishedAt?: string | null;
  summary?: string | null;
  category?: string | null;
}

interface AiHotResponse {
  items?: AiHotItem[];
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function mapAiHotCategory(category: string | null | undefined): string[] {
  const labels: Record<string, string> = {
    'ai-models': '模型发布',
    'ai-products': 'AI 产品',
    industry: '行业动态',
    paper: '论文研究',
    tip: '技巧与观点'
  };
  if (!category) return ['AI HOT'];
  return ['AI HOT', labels[category] || category];
}

function compactAiHotSummary(item: AiHotItem): string {
  const raw = (item.summary || item.title_en || item.title)
    .replace(/【引用[\s\S]*?】[:：]?/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!raw) return item.title;

  const firstSentence = raw.split(/[。！？!?]\s*/).find(segment => segment.trim().length > 0) || raw;
  const compact = firstSentence.length > 120 ? `${firstSentence.slice(0, 120).trim()}...` : firstSentence.trim();
  return compact || item.title;
}

export class ExternalCuratedSourceService {
  async fetchAiHot(options: {
    enabled: boolean;
    baseUrl: string;
    take: number;
    timeRange: TimeRange;
  }): Promise<NewsArticle[]> {
    if (!options.enabled) return [];

    const baseUrl = normalizeBaseUrl(options.baseUrl);
    const rangeDays: Record<TimeRange, number> = { '1d': 1, '3d': 3, '7d': 7 };
    const since = new Date(Date.now() - rangeDays[options.timeRange] * 24 * 60 * 60 * 1000).toISOString();
    const url = `${baseUrl}/api/public/items?mode=selected&take=${options.take}&since=${encodeURIComponent(since)}`;
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; self-news-agent/1.0; aihot-skill/0.2.0)'
        }
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as AiHotResponse;
      const items = data.items || [];
      return items
        .filter(item => item.title && item.url)
        .map(item => ({
          id: `aihot-${item.id}`,
          title: item.title,
          summary: compactAiHotSummary(item),
          url: item.url,
          source: item.source ? `AI HOT / ${item.source}` : 'AI HOT',
          sourceType: 'aihot',
          publishedAt: item.publishedAt ? new Date(item.publishedAt).toISOString() : new Date().toISOString(),
          category: 'ai',
          language: 'zh',
          tags: mapAiHotCategory(item.category)
        } satisfies NewsArticle));
    } catch (error) {
      console.warn('AI HOT fetch skipped:', error instanceof Error ? error.message : error);
      return [];
    }
  }

  async fetchHex2077(options: {
    enabled: boolean;
    feeds: string[];
    limit: number;
    timeRange: TimeRange;
  }): Promise<NewsArticle[]> {
    if (!options.enabled || options.feeds.length === 0) return [];

    try {
      const articles = await rssService.fetchNewsFromConfigs({
        feeds: options.feeds.map(url => ({
          name: 'HEX2077',
          source: 'HEX2077',
          sourceType: 'hex2077',
          url,
          language: 'zh',
          category: 'ai'
        })),
        limit: options.limit,
        timeRange: options.timeRange,
        keywords: []
      });

      return articles.map(article => ({
        ...article,
        tags: ['HEX2077', ...(article.tags || [])]
      }));
    } catch (error) {
      console.warn('HEX2077 fetch skipped:', error instanceof Error ? error.message : error);
      return [];
    }
  }
}

export const externalCuratedSourceService = new ExternalCuratedSourceService();
