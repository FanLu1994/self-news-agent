import type { Context } from '@mariozechner/pi-ai';
import { completeWithFallback } from '../model.js';
import type { DigestAnalysis, NewsArticle, SummaryStyle } from '../types/news.types.js';

interface AnalyzeOptions {
  articles: NewsArticle[];
  style: SummaryStyle;
  queryKeywords: string[];
}

interface AnalyzeResult {
  analysis: DigestAnalysis;
  rawText: string;
}

interface TopicSummary {
  topic: string;
  articleCount: number;
  representativeItems: {
    title: string;
    url: string;
    summary: string;
  }[];
}

/**
 * 分析服务 - 增强版
 */
export class AnalysisService {
  /**
   * 按来源分组文章
   */
  private groupBySource(articles: NewsArticle[]): Map<string, NewsArticle[]> {
    const groups = new Map<string, NewsArticle[]>();
    for (const article of articles) {
      const key = article.source;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(article);
    }
    return groups;
  }

  /**
   * 构建文章摘要文本（用于 LLM 分析）
   */
  private buildArticlesSummary(articles: NewsArticle[], maxItems: number = 50): string {
    const sorted = articles
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, maxItems);

    return sorted.map((article, idx) =>
      `${idx + 1}. [${article.source}] ${article.title}\n   摘要: ${article.summary.slice(0, 200)}\n   链接: ${article.url}`
    ).join('\n\n');
  }

  /**
   * 构建来源分组摘要
   */
  private buildSourceGroupsSummary(articles: NewsArticle[]): string {
    const groups = this.groupBySource(articles);
    const summaries: string[] = [];

    for (const [source, items] of groups) {
      const topItems = items.slice(0, 5);
      summaries.push(
        `【${source}】(${items.length}篇)\n${topItems.map((item, idx) =>
          `  ${idx + 1}. ${item.title}\n     ${item.summary.slice(0, 100)}`
        ).join('\n')}`
      );
    }

    return summaries.join('\n\n');
  }

  /**
   * 提取主题并生成摘要
   */
  private extractTopics(articles: NewsArticle[]): TopicSummary[] {
    const topics = new Map<string, Set<{
      title: string;
      url: string;
      summary: string;
    }>>();

    for (const article of articles) {
      for (const tag of article.tags || []) {
        if (!topics.has(tag)) {
          topics.set(tag, new Set());
        }
        topics.get(tag)!.add({
          title: article.title,
          url: article.url,
          summary: article.summary.slice(0, 150)
        });
      }
    }

    const result: TopicSummary[] = [];
    for (const [topic, items] of topics) {
      result.push({
        topic,
        articleCount: items.size,
        representativeItems: Array.from(items).slice(0, 3)
      });
    }

    return result.sort((a, b) => b.articleCount - a.articleCount).slice(0, 10);
  }

  async analyze(options: AnalyzeOptions): Promise<AnalyzeResult> {
    const { articles, style, queryKeywords } = options;

    console.log(`\n🤖 开始 AI 分析... (${articles.length} 篇文章)`);

    // 构建详细的文章摘要
    const articlesSummary = this.buildArticlesSummary(articles, 100);
    const sourceGroupsSummary = this.buildSourceGroupsSummary(articles);

    // 提取主题
    const topics = this.extractTopics(articles);

    // 构建增强的 prompt
    const prompt = this.buildEnhancedPrompt({
      articlesCount: articles.length,
      articlesSummary,
      sourceGroupsSummary,
      topics,
      style,
      queryKeywords
    });

    const context: Context = {
      systemPrompt: `你是专业的新闻编辑与产业分析师，擅长：
1. 从多源资讯中抽取关键事实并总结趋势
2. 识别行业热点和新兴技术方向
3. 分析不同来源的特色内容
4. 提供深度洞察而非简单罗列

输出要求：
- 标题：简洁有力，体现核心主题
- 概览：300-500字，全面覆盖主要动态
- 要点：8-12个，每个要点要有实质性内容，包含具体技术/产品/事件
- 话题分析：列出主要话题及热度
- 来源亮点：各来源的特色内容

输出格式必须是纯文本，不要 JSON 格式。`,
      messages: [
        {
          role: 'user',
          content: prompt,
          timestamp: Date.now()
        }
      ]
    };

    try {
      const { response } = await completeWithFallback(context);
      const rawText = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n')
        .trim();

      console.log(`  ✅ 分析完成 (${rawText.length} 字符)`);

      // 解析结果
      const analysis = this.parseAnalysisResult(rawText, queryKeywords);
      return { analysis, rawText };
    } catch (error) {
      console.error(`❌ AI 分析失败:`, error);

      // 降级到基础摘要
      const fallbackAnalysis: DigestAnalysis = {
        title: 'AI & 技术日报',
        overview: `获取到 ${articles.length} 篇文章。来源分布：${this.groupBySource(articles).size} 个。`,
        highlights: articles.slice(0, 8).map(a => `[${a.source}] ${a.title}`),
        keywords: queryKeywords,
        generatedAt: new Date().toISOString()
      };

      return { analysis: fallbackAnalysis, rawText: fallbackAnalysis.overview };
    }
  }

  /**
   * 构建增强的 prompt
   */
  private buildEnhancedPrompt(options: {
    articlesCount: number;
    articlesSummary: string;
    sourceGroupsSummary: string;
    topics: TopicSummary[];
    style: SummaryStyle;
    queryKeywords: string[];
  }): string {
    const {
      articlesCount,
      articlesSummary,
      sourceGroupsSummary,
      topics,
      style,
      queryKeywords
    } = options;

    const topicsText = topics
      .map(t => `  - ${t.topic} (${t.articleCount}篇): ${t.representativeItems.map(i => i.title).join(', ')}`)
      .join('\n');

    return [
      `请分析以下${articlesCount}篇新闻数据。`,
      `风格要求：${style === 'brief' ? '简要' : style === 'detailed' ? '详细' : '关键词'}模式`,
      `重点关注关键词：${queryKeywords.join(', ') || '无特定限制'}`,
      '',
      '=== 来源分组 ===',
      sourceGroupsSummary,
      '',
      '=== 主要话题 ===',
      topicsText,
      '',
      '=== 详细文章列表 ===',
      articlesSummary,
      '',
      '=== 输出要求 ===',
      '请按以下格式输出（纯文本，不要 JSON）：',
      '',
      '## 标题',
      '（简洁有力，体现核心主题，不超过30字）',
      '',
      '## 概览',
      '（300-500字，全面覆盖主要动态，包括：行业趋势、技术突破、产品发布、政策动态等）',
      '',
      '## 重点内容',
      '（8-12个要点，每个要点要有实质性内容，包含具体技术/产品/事件/来源）',
      '',
      '## 话题分析',
      '（列出主要讨论话题及热度）',
      '',
      '## 来源亮点',
      '（各来源的特色内容推荐）'
    ].join('\n');
  }

  /**
   * 解析分析结果 - 改进版，更宽松的解析
   */
  private parseAnalysisResult(rawText: string, queryKeywords: string[]): DigestAnalysis {
    console.log(`  🔍 解析 AI 响应...`);

    // 尝试提取标题
    let title = 'AI & 技术日报';
    const titlePatterns = [
      /## 标题\s*\n+([^\n]+)/,
      /标题[：:]\s*([^\n]+)/,
      /^#{1,2}\s+(.+)/
    ];
    for (const pattern of titlePatterns) {
      const match = rawText.match(pattern);
      if (match && match[1]) {
        title = match[1].trim();
        break;
      }
    }

    // 尝试提取概览
    let overview = '';
    const overviewPatterns = [
      /## 概览\s*\n+([\s\S]*?)(?=\n##|\n\n重点内容|\n\n重点|# |\n概览[：:])/,
      /概览[：:]\s*\n+([\s\S]*?)(?=\n##|\n\n重点内容|\n\n重点|# )/,
      /概览[：:]\s*([^\n]+(?:\n|$))/
    ];
    for (const pattern of overviewPatterns) {
      const match = rawText.match(pattern);
      if (match && match[1]) {
        overview = match[1].trim();
        break;
      }
    }

    // 如果没找到概览，使用前 500 字符
    if (!overview) {
      overview = rawText.slice(0, 500);
    }

    // 提取重点内容
    const highlights = this.extractBulletPoints(rawText);

    // 提取话题分析
    let topicsAnalysis: string | null = null;
    const topicsPatterns = [
      /## 话题分析\s*\n+([\s\S]*?)(?=\n##|\n\n来源亮点|\n\n##|$)/,
      /话题分析[：:]\s*\n+([\s\S]*?)(?=\n##|\n\n来源亮点|\n\n##|$)/,
      /话题[：:]\s*\n+([\s\S]*?)(?=\n##|\n\n来源|\n\n|$)/
    ];
    for (const pattern of topicsPatterns) {
      const match = rawText.match(pattern);
      if (match && match[1]) {
        topicsAnalysis = match[1].trim();
        break;
      }
    }

    // 提取来源亮点
    let sourceHighlights: string | null = null;
    const sourcesPatterns = [
      /## 来源亮点\s*\n+([\s\S]*?)$/,
      /来源亮点[：:]\s*\n+([\s\S]*?)$/,
      /来源[：:]\s*\n+([\s\S]*?)$/
    ];
    for (const pattern of sourcesPatterns) {
      const match = rawText.match(pattern);
      if (match && match[1]) {
        sourceHighlights = match[1].trim();
        break;
      }
    }

    return {
      title,
      overview,
      highlights: highlights.slice(0, 15),
      keywords: queryKeywords,
      topicsAnalysis,
      sourceHighlights,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * 提取列表项
   */
  private extractBulletPoints(text: string): string[] {
    const lines = text.split('\n');
    const bullets: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      // 匹配列表项：- 开头，或数字. 开头
      if (trimmed.match(/^[-•·▪\-\*]\s+\S/) || trimmed.match(/^[\d]+\.\s+\S/) || trimmed.match(/^[\d]+[、．]\s*\S/)) {
        bullets.push(trimmed.replace(/^[-•·▪\-\*]\s+/, '').replace(/^[\d]+[、．]\s*/, ''));
      }
    }

    return bullets;
  }
}

export const analysisService = new AnalysisService();
