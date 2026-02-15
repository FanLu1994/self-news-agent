import type { NewsArticle, TimeRange } from '../types/news.types.js';

interface TwitterFetchOptions {
  bearerToken?: string;
  keywords: string[];
  limit: number;
  timeRange: TimeRange;
}

interface XRecentSearchResponse {
  data?: Array<{
    id: string;
    text: string;
    author_id?: string;
    created_at?: string;
    lang?: string;
    public_metrics?: {
      retweet_count?: number;
      reply_count?: number;
      like_count?: number;
      quote_count?: number;
    };
  }>;
}

const X_SEARCH_API = 'https://api.x.com/2/tweets/search/recent';

export class TwitterService {
  private resolveStartTime(timeRange: TimeRange): string {
    const now = Date.now();
    const offset = timeRange === '1d'
      ? 1
      : (timeRange === '3d' ? 3 : 7);
    return new Date(now - offset * 24 * 60 * 60 * 1000).toISOString();
  }

  private buildQuery(keywords: string[]): string {
    const normalizedKeywords = keywords
      .map(k => k.trim())
      .filter(Boolean)
      .map(k => `"${k}"`);

    const keywordsQuery = normalizedKeywords.length > 0 ? `(${normalizedKeywords.join(' OR ')})` : '(AI OR LLM)';
    const filters = [
      '-is:retweet',
      '-is:reply',
      'lang:en OR lang:zh'
    ];

    return `${keywordsQuery} ${filters.join(' ')}`.trim();
  }

  async fetchHotTweets(options: TwitterFetchOptions): Promise<NewsArticle[]> {
    if (!options.bearerToken) {
      console.warn('X_BEARER_TOKEN not configured, skip twitter fetching.');
      return [];
    }

    const query = this.buildQuery(options.keywords);
    const maxResults = Math.min(Math.max(options.limit, 10), 100);
    const url = new URL(X_SEARCH_API);
    url.searchParams.set('query', query);
    url.searchParams.set('max_results', String(maxResults));
    url.searchParams.set('tweet.fields', 'created_at,lang,author_id,public_metrics');
    url.searchParams.set('start_time', this.resolveStartTime(options.timeRange));

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${options.bearerToken}`
        }
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`X API ${response.status}: ${body}`);
      }

      const result: XRecentSearchResponse = await response.json();
      const tweets = result.data || [];

      const items = tweets.map(tweet => {
        const text = (tweet.text || '').replace(/\s+/g, ' ').trim();
        const title = text.length > 90 ? `${text.slice(0, 90)}...` : text;
        const likes = tweet.public_metrics?.like_count || 0;
        const reposts = tweet.public_metrics?.retweet_count || 0;
        const score = likes + reposts * 2;

        return {
          id: `x-${tweet.id}`,
          title,
          summary: text,
          url: `https://x.com/i/web/status/${tweet.id}`,
          source: 'X',
          sourceType: 'twitter' as const,
          author: tweet.author_id,
          publishedAt: tweet.created_at || new Date().toISOString(),
          category: 'ai' as const,
          language: tweet.lang === 'zh' ? 'zh' as const : 'en' as const,
          score,
          commentCount: tweet.public_metrics?.reply_count,
          tags: options.keywords
        };
      });

      return items.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, options.limit);
    } catch (error) {
      console.error('Failed to fetch X trends:', error);
      return [];
    }
  }
}

export const twitterService = new TwitterService();
