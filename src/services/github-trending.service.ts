import type { NewsArticle, TimeRange } from '../types/news.types.js';

interface FetchTrendingOptions {
  languages: string[];
  timeRange: TimeRange;
  limit: number;
}

interface GitHubSearchItem {
  id: number;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  created_at: string;
  updated_at: string;
  owner?: {
    login?: string;
  };
  topics?: string[];
}

interface GitHubSearchResponse {
  items?: GitHubSearchItem[];
  total_count?: number;
}

/**
 * GitHub Trending 服务（使用 Search API）
 *
 * GitHub 没有官方 Trending API，使用 search API 按创建时间和 stars 排序模拟
 * 强烈建议配置 GITHUB_TOKEN 以获得更高的速率限制（5000次/小时 vs 60次/小时）
 */
export class GitHubTrendingService {
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'self-news-agent/1.0'
    };

    const token = process.env.GITHUB_TOKEN;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    } else {
      console.warn('⚠️  GITHUB_TOKEN not configured, using unauthenticated requests (60 req/hour limit)');
    }

    return headers;
  }

  /**
   * 使用 Search API 获取热门仓库
   */
  private async searchTrendingRepositories(options: {
    language?: string;
    timeRange: TimeRange;
    limit: number;
  }): Promise<GitHubSearchItem[]> {
    const { language, timeRange, limit } = options;

    // 计算时间范围
    const lookbackDays = timeRange === '1d' ? 1 : timeRange === '3d' ? 3 : 7;
    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // 构建查询
    const queryParts = [`created:>=${since}`];

    if (language) {
      queryParts.push(`language:${encodeURIComponent(language)}`);
    }

    // 排除 fork，只看原创项目
    queryParts.push('fork:false');

    // 限制 stars 数量，过滤掉测试项目
    queryParts.push('stars:>=10');

    const query = queryParts.join('+');
    const perPage = Math.min(limit, 100); // GitHub API max is 100

    const url = `https://api.github.com/search/repositories?q=${query}&sort=stars&order=desc&per_page=${perPage}`;

    try {
      const response = await fetch(url, {
        headers: this.buildHeaders()
      });

      // 处理速率限制警告
      const remaining = response.headers.get('x-ratelimit-remaining');
      const reset = response.headers.get('x-ratelimit-reset');
      if (remaining && Number.parseInt(remaining) < 10) {
        const resetTime = reset ? new Date(Number.parseInt(reset) * 1000).toLocaleTimeString() : 'unknown';
        console.warn(`⚠️  GitHub API rate limit low (${remaining} remaining), resets at ${resetTime}`);
      }

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('GitHub API rate limit exceeded. Please configure GITHUB_TOKEN.');
        }
        if (response.status === 401) {
          throw new Error('GitHub API token invalid. Please check GITHUB_TOKEN.');
        }
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as GitHubSearchResponse;
      return data.items || [];
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`GitHub search API failed for language "${language || 'all'}": ${errorMsg}`);
      return [];
    }
  }

  async fetchTrending(options: FetchTrendingOptions): Promise<NewsArticle[]> {
    const languages = options.languages.length > 0 ? options.languages : [''];
    const itemsPerLanguage = options.languages.length > 0
      ? Math.ceil(options.limit / languages.length)
      : options.limit;

    // 并发查询所有语言
    const allResults = await Promise.all(
      languages.map(language =>
        this.searchTrendingRepositories({
          language: language || undefined,
          timeRange: options.timeRange,
          limit: itemsPerLanguage
        })
      )
    );

    // 合并结果
    const allItems = allResults.flat();

    // 去重（按 full_name）
    const seen = new Set<string>();
    const uniqueItems: GitHubSearchItem[] = [];
    for (const item of allItems) {
      const key = item.full_name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        uniqueItems.push(item);
      }
    }

    // 按 stars 数量排序
    uniqueItems.sort((a, b) => b.stargazers_count - a.stargazers_count);

    // 取前 limit 个
    const items = uniqueItems.slice(0, options.limit);

    const now = new Date().toISOString();

    // 转换为 NewsArticle
    const articles: NewsArticle[] = items.map(item => {
      const [owner = '', repo = ''] = (item.full_name || '').split('/');
      const language = item.language || undefined;
      const topic = language ? `${language} 热门项目` : 'GitHub 热门项目';
      const daysSinceCreated = Math.floor((Date.now() - new Date(item.created_at).getTime()) / (24 * 60 * 60 * 1000));
      const daysText = daysSinceCreated === 0 ? '今天' : daysSinceCreated === 1 ? '昨天' : `${daysSinceCreated}天前`;

      return {
        id: `gh-trending-${item.id}`,
        title: `${owner}/${repo}`,
        summary: `${item.description || 'No description'} | ⭐ ${item.stargazers_count} stars | 📅 ${daysText}创建`,
        url: item.html_url,
        source: 'GitHub Trending',
        sourceType: 'github' as const,
        author: owner,
        publishedAt: now,
        category: 'all' as const,
        language: 'en' as const,
        score: item.stargazers_count,
        tags: [topic, language || 'unknown', ...(item.topics || [])].filter(Boolean)
      } as NewsArticle;
    });

    // 调试输出
    if (process.env.DEBUG === 'true') {
      console.log('\n📊 GitHub Trending API 抓取结果:');
      console.log(`获取到 ${articles.length} 个仓库`);
      articles.forEach((article, i) => {
        console.log(`  ${i + 1}. ${article.title} | ${article.tags[0]} | ⭐ ${article.score}`);
      });
      console.log('');
    }

    return articles;
  }
}

export const githubTrendingService = new GitHubTrendingService();
