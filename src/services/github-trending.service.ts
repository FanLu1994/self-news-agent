import type { NewsArticle, TimeRange } from '../types/news.types.js';

interface FetchTrendingOptions {
  token?: string;
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
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超时

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
      if (attempt === maxRetries - 1) {
        throw lastError;
      }
      // 指数退避
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
 * HTML 解码
 */
function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * 移除 HTML 标签
 */
function stripTags(html: string): string {
  return decodeHtml(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * 从文本中提取数字
 */
function extractNumber(text: string): number | undefined {
  const cleaned = text.replace(/,/g, '');
  const match = cleaned.match(/(\d+)/);
  if (!match) return undefined;
  return Number.parseInt(match[1], 10);
}

/**
 * 解析 GitHub Trending HTML 页面
 */
function parseTrendingRepos(html: string): TrendingRepo[] {
  // 匹配每个仓库的文章块
  const articleRegex = /<article[^>]*class="[^"]*Box-row[^"]*"[\s\S]*?<\/article>/g;
  const blocks = html.match(articleRegex) || [];

  // 调试：输出匹配结果
  if (process.env.DEBUG === 'true') {
    console.log(`\n🔍 GitHub Trending 解析调试:`);
    console.log(`  HTML 中匹配到 ${blocks.length} 个 article 块`);
  }

  const repos = blocks.map(block => {
    // 提取 owner/repo
    const repoLinkMatch =
      block.match(/<h2[^>]*>[\s\S]*?<a[^>]*href="\/([^/"\s]+)\/([^/"\s]+)"/i) ||
      block.match(/href="\/([^/"\s]+)\/([^/"\s]+)"/);
    const owner = repoLinkMatch?.[1] || '';
    const repo = repoLinkMatch?.[2] || '';
    const url = owner && repo ? `https://github.com/${owner}/${repo}` : 'https://github.com/trending';

    // 提取描述
    const descMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const description = descMatch ? stripTags(descMatch[1]) : `${owner}/${repo}`;

    // 提取编程语言
    const langMatch =
      block.match(/itemprop="programmingLanguage">\s*([^<]+)\s*</i) ||
      block.match(/<span[^>]*>\s*([A-Za-z+#.\-]+)\s*<\/span>/i);
    const language = langMatch ? stripTags(langMatch[1]) : undefined;

    // 提取 stars 总数
    const starsTotalMatch = block.match(/href="\/[^/"\s]+\/[^/"\s]+\/stargazers"[^>]*>\s*([\d,]+)\s*<\/a>/);
    const starsTotal = starsTotalMatch ? extractNumber(starsTotalMatch[1]) : undefined;

    // 提取今日 stars 数
    const starsTodayMatch = block.match(/(\d[\d,]*)\s+stars?\s+today/i);
    const starsToday = starsTodayMatch ? extractNumber(starsTodayMatch[1]) : undefined;

    return {
      owner,
      repo,
      description,
      language,
      starsToday,
      starsTotal,
      url
    };
  });

  // 过滤有效的仓库
  const validRepos = repos.filter(item => item.owner && item.repo);

  // 调试：输出解析结果
  if (process.env.DEBUG === 'true') {
    console.log(`  成功解析 ${validRepos.length} 个仓库`);
    const failed = blocks.length - validRepos.length;
    if (failed > 0) {
      console.log(`  解析失败 ${failed} 个块`);
    }
  }

  return validRepos;
}

/** 配置语言/话题映射到 GitHub API 查询 */
const LANG_TO_QUERY: Record<string, string> = {
  python: 'language:Python',
  javascript: 'language:JavaScript',
  js: 'language:JavaScript',
  typescript: 'language:TypeScript',
  ts: 'language:TypeScript',
  go: 'language:Go',
  csharp: 'language:C#',
  'c#': 'language:C#',
  rust: 'language:Rust',
  vue: 'topic:vue',
  react: 'topic:react'
};

function toApiQuery(lang: string): string {
  return LANG_TO_QUERY[lang.toLowerCase()] || `language:${lang}`;
}

interface GhApiRepo {
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  language: string | null;
  owner: { login: string };
}

/**
 * 通过 GitHub API 按语言/话题获取热门仓库
 */
async function fetchByApi(
  token: string,
  languages: string[],
  limit: number,
  fetchWithRetryFn: typeof fetchWithRetry
): Promise<TrendingRepo[]> {
  const allRepos: TrendingRepo[] = [];
  const perLang = Math.max(2, Math.ceil(limit / languages.length));

  for (const lang of languages) {
    const query = toApiQuery(lang);
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const created = since.toISOString().slice(0, 10);
    const q = `${query} created:>${created} stars:>10`;
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${perLang}`;

    try {
      const res = await fetchWithRetryFn(url, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = (await res.json()) as { items?: GhApiRepo[] };
      const items = data.items || [];

      for (const r of items) {
        const parts = (r.full_name || '').split('/');
        const owner = parts[0] || 'unknown';
        const repo = parts[1] || 'unknown';
        allRepos.push({
          owner,
          repo,
          description: r.description || '',
          language: r.language || undefined,
          starsTotal: r.stargazers_count,
          url: r.html_url
        });
      }
    } catch (e) {
      console.warn(`GitHub API fetch failed for ${lang}:`, e instanceof Error ? e.message : e);
    }
    await sleep(300);
  }

  allRepos.sort((a, b) => (b.starsTotal ?? 0) - (a.starsTotal ?? 0));
  return allRepos.slice(0, limit);
}

/**
 * GitHub Trending 服务（API + token 或爬虫回退）
 */
export class GitHubTrendingService {
  private buildHeaders(): Record<string, string> {
    return {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      'DNT': '1',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1'
    };
  }

  /**
   * 获取 Trending 页面 HTML
   */
  private async fetchTrendingPage(): Promise<string> {
    const url = 'https://github.com/trending';

    try {
      const response = await fetchWithRetry(url, {
        headers: this.buildHeaders()
      });

      const html = await response.text();

      // 调试：输出 HTML 大小
      if (process.env.DEBUG === 'true') {
        console.log(`\n📥 GitHub Trending 页面抓取:`);
        console.log(`  URL: ${url}`);
        console.log(`  HTML 大小: ${html.length} 字符`);
        console.log(`  HTTP 状态: ${response.status}`);
      }

      return html;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch GitHub trending page: ${errorMsg}`);
    }
  }

  async fetchTrending(options: FetchTrendingOptions): Promise<NewsArticle[]> {
    try {
      let repos: TrendingRepo[];

      if (options.token && options.languages.length > 0) {
        repos = await fetchByApi(
          options.token,
          options.languages,
          options.limit,
          fetchWithRetry
        );
      } else {
        const html = await this.fetchTrendingPage();
        repos = parseTrendingRepos(html);
      }

      // 按 starsToday 排序
      repos.sort((a, b) => {
        const aStars = a.starsToday ?? a.starsTotal ?? 0;
        const bStars = b.starsToday ?? b.starsTotal ?? 0;
        return bStars - aStars;
      });

      // 限制数量
      const items = repos.slice(0, options.limit);

      const now = new Date().toISOString();

      // 转换为 NewsArticle
      const articles: NewsArticle[] = items.map(repo => {
        const language = repo.language || undefined;
        const topic = language ? `${language} 热门项目` : 'GitHub 热门项目';
        const starsText = repo.starsToday ? `今日 +${repo.starsToday} stars` : '近期热门';
        const totalText = repo.starsTotal ? `总 ${repo.starsTotal} stars` : '';

        return {
          id: `gh-trending-${repo.owner}-${repo.repo}`.toLowerCase(),
          title: `${repo.owner}/${repo.repo}`,
          summary: `${repo.description} | ${starsText}${totalText ? ` | ${totalText}` : ''}`,
          url: repo.url,
          source: 'GitHub Trending',
          sourceType: 'github' as const,
          author: repo.owner,
          publishedAt: now,
          category: 'all' as const,
          language: 'en' as const,
          score: repo.starsToday ?? repo.starsTotal ?? 0,
          tags: [topic, language || 'unknown'].filter(Boolean)
        } as NewsArticle;
      });

      // 调试输出
      if (process.env.DEBUG === 'true') {
        console.log('\n📊 GitHub Trending 爬虫抓取结果:');
        console.log(`  最终返回: ${articles.length} 个仓库`);
        console.log(`  请求限制: ${options.limit}`);
        articles.forEach((article, i) => {
          console.log(`  ${i + 1}. ${article.title} | ${article.tags[0]} | ⭐ ${article.score}`);
        });
        console.log('');
      }

      return articles;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`GitHub trending fetch failed: ${errorMsg}`);
      return [];
    }
  }
}

export const githubTrendingService = new GitHubTrendingService();
