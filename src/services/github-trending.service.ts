import type { NewsArticle, TimeRange } from '../types/news.types.js';

interface FetchTrendingOptions {
  languages: string[];
  timeRange: TimeRange;
  limit: number;
}

interface TrendingRepo {
  owner: string;
  repo: string;
  description: string;
  language?: string;
  starsToday?: number;
  starsTotal?: number;
  url: string;
}

interface GitHubSearchItem {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  owner?: {
    login?: string;
  };
}

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(html: string): string {
  return decodeHtml(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function normalizeSince(timeRange: TimeRange): 'daily' | 'weekly' {
  return timeRange === '7d' ? 'weekly' : 'daily';
}

function extractNumber(text: string): number | undefined {
  const cleaned = text.replace(/,/g, '');
  const match = cleaned.match(/(\d+)/);
  if (!match) return undefined;
  return Number.parseInt(match[1], 10);
}

function parseTrendingRepos(html: string): TrendingRepo[] {
  const articleRegex = /<article[^>]*class="[^"]*Box-row[^"]*"[\s\S]*?<\/article>/g;
  const blocks = html.match(articleRegex) || [];

  return blocks.map(block => {
    const repoLinkMatch =
      block.match(/<h2[^>]*>[\s\S]*?<a[^>]*href="\/([^/"\s]+)\/([^/"\s]+)"/i) ||
      block.match(/href="\/([^/"\s]+)\/([^/"\s]+)"/);
    const owner = repoLinkMatch?.[1] || '';
    const repo = repoLinkMatch?.[2] || '';
    const url = owner && repo ? `https://github.com/${owner}/${repo}` : 'https://github.com/trending';

    const descMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const description = descMatch ? stripTags(descMatch[1]) : `${owner}/${repo}`;

    const langMatch =
      block.match(/itemprop="programmingLanguage">\s*([^<]+)\s*</i) ||
      block.match(/<span[^>]*>\s*([A-Za-z+#.\-]+)\s*<\/span>/i);
    const language = langMatch ? stripTags(langMatch[1]) : undefined;

    const starsTotalMatch = block.match(/href="\/[^/"\s]+\/[^/"\s]+\/stargazers"[^>]*>\s*([\d,]+)\s*<\/a>/);
    const starsTodayMatch = block.match(/(\d[\d,]*)\s+stars?\s+today/i);

    return {
      owner,
      repo,
      description,
      language,
      starsToday: starsTodayMatch ? extractNumber(starsTodayMatch[1]) : undefined,
      starsTotal: starsTotalMatch ? extractNumber(starsTotalMatch[1]) : undefined,
      url
    };
  }).filter(item => item.owner && item.repo);
}

export class GitHubTrendingService {
  private buildHeaders(includeApiVersion = false): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (compatible; self-news-agent/1.0)',
      'Accept-Language': 'en-US,en;q=0.9'
    };
    if (includeApiVersion) {
      headers.Accept = 'application/vnd.github+json';
      headers['X-GitHub-Api-Version'] = '2022-11-28';
    }
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    return headers;
  }

  private async fetchTrendingPage(language: string, since: 'daily' | 'weekly'): Promise<string> {
    const normalizedLanguage = language.trim().toLowerCase();
    const base = normalizedLanguage ? `https://github.com/trending/${encodeURIComponent(normalizedLanguage)}` : 'https://github.com/trending';
    const url = `${base}?since=${since}`;
    const response = await fetch(url, {
      headers: this.buildHeaders()
    });
    if (!response.ok) {
      throw new Error(`GitHub trending request failed: ${response.status}`);
    }
    return response.text();
  }

  private async fetchTrendingBySearchApi(language: string, limit: number, timeRange: TimeRange): Promise<TrendingRepo[]> {
    const normalizedLanguage = language.trim().toLowerCase();
    const lookbackDays = timeRange === '1d' ? 1 : timeRange === '3d' ? 3 : 7;
    const from = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const langQualifier = normalizedLanguage ? `+language:${encodeURIComponent(normalizedLanguage)}` : '';
    const perPage = Math.max(1, Math.min(50, limit));
    const query = `created:>=${from}${langQualifier}`;
    const url = `https://api.github.com/search/repositories?q=${query}&sort=stars&order=desc&per_page=${perPage}`;
    const response = await fetch(url, {
      headers: this.buildHeaders(true)
    });
    if (!response.ok) {
      throw new Error(`GitHub search fallback request failed: ${response.status}`);
    }

    const payload = await response.json() as { items?: GitHubSearchItem[] };
    const items = Array.isArray(payload.items) ? payload.items : [];
    return items.map(item => {
      const [owner = '', repo = ''] = (item.full_name || '').split('/');
      return {
        owner: owner || item.owner?.login || '',
        repo,
        description: (item.description || `${item.full_name} trending repository`).trim(),
        language: item.language || undefined,
        starsTotal: item.stargazers_count,
        url: item.html_url || `https://github.com/${item.full_name}`
      };
    }).filter(repo => repo.owner && repo.repo);
  }

  async fetchTrending(options: FetchTrendingOptions): Promise<NewsArticle[]> {
    const since = normalizeSince(options.timeRange);
    const languages = options.languages.length > 0 ? options.languages : [''];

    const pageResults = await Promise.all(
      languages.map(async language => {
        try {
          const html = await this.fetchTrendingPage(language, since);
          const parsed = parseTrendingRepos(html);
          if (parsed.length > 0) return parsed;
          console.warn(`GitHub trending parsed 0 repos for "${language || 'all'}", fallback to search API.`);
          return this.fetchTrendingBySearchApi(language, options.limit, options.timeRange);
        } catch (error) {
          console.error(`Failed to fetch GitHub trending page for "${language || 'all'}":`, error);
          try {
            return await this.fetchTrendingBySearchApi(language, options.limit, options.timeRange);
          } catch (fallbackError) {
            console.error(`Failed to fetch GitHub search fallback for "${language || 'all'}":`, fallbackError);
            return [];
          }
        }
      })
    );

    const repos = pageResults.flat();
    const now = new Date().toISOString();

    const mapped = repos.map(repo => {
      const topic = repo.language ? `${repo.language} 热门项目` : 'GitHub 热门项目';
      const starsText = repo.starsToday ? `今日 +${repo.starsToday} stars` : '近期热门';
      const totalText = repo.starsTotal ? `总 stars ${repo.starsTotal}` : '';
      const summary = `${repo.description} | ${starsText}${totalText ? ` | ${totalText}` : ''}`;

      return {
        id: `gh-trending-${repo.owner}-${repo.repo}`.toLowerCase(),
        title: `${repo.owner}/${repo.repo}`,
        summary,
        url: repo.url,
        source: 'GitHub Trending',
        sourceType: 'github' as const,
        author: repo.owner,
        publishedAt: now,
        category: 'all' as const,
        language: 'en' as const,
        score: repo.starsToday || repo.starsTotal || 0,
        tags: [topic, repo.language || 'unknown'].filter(Boolean)
      } as NewsArticle;
    });

    mapped.sort((a, b) => (b.score || 0) - (a.score || 0));

    const deduped: NewsArticle[] = [];
    const seen = new Set<string>();
    for (const item of mapped) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      deduped.push(item);
    }

    return deduped.slice(0, options.limit);
  }
}

export const githubTrendingService = new GitHubTrendingService();
