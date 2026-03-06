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

interface CuratedItem {
  title: string;
  url: string;
  summary: string;
  reason: string;
  source: string;
  publishedAt: string;
}

interface TopicGroup {
  topic: string;
  items: CuratedItem[];
}

/**
 * 智能筛选服务 - 从海量信息中筛选出值得关注的内容
 */
export class AnalysisService {
  /**
   * 按主题分组文章
   */
  private groupByTopic(articles: NewsArticle[]): TopicGroup[] {
    const topicMap = new Map<string, NewsArticle[]>();

    for (const article of articles) {
      const topics = article.tags || ['Other'];

      for (const topic of topics) {
        if (!topicMap.has(topic)) {
          topicMap.set(topic, []);
        }
        topicMap.get(topic)!.push(article);
      }
    }

    return Array.from(topicMap.entries())
      .map(([topic, items]) => ({
        topic,
        items: items.sort((a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
        )
      }))
      .filter(group => group.items.length >= 2) // 只保留有足够内容的主题
      .sort((a, b) => b.items.length - a.items.length)
      .slice(0, 8); // 最多8个主题
  }

  /**
   * 构建精选文章列表文本
   */
  private buildCuratedArticlesText(articles: NewsArticle[]): string {
    return articles.map((article, idx) =>
      `【${idx + 1}】${article.title}\n` +
      `   来源: ${article.source}\n` +
      `   简介: ${(article.summary || '').slice(0, 150)}\n` +
      `   链接: ${article.url}\n` +
      `   时间: ${article.publishedAt}`
    ).join('\n\n');
  }

  async analyze(options: AnalyzeOptions): Promise<AnalyzeResult> {
    const { articles, style, queryKeywords } = options;

    console.log(`\n🤖 智能助理正在筛选 ${articles.length} 篇内容...`);

    // 按主题分组
    const topicGroups = this.groupByTopic(articles);

    // 构建文章文本（限制数量以控制 token）
    const articlesText = this.buildCuratedArticlesText(
      articles.slice(0, 80) // 最多分析80篇
    );

    // 构建筛选 prompt
    const prompt = this.buildCuratorPrompt({
      totalArticles: articles.length,
      articlesText,
      topicGroups,
      queryKeywords,
      style
    });

    const context: Context = {
      systemPrompt: `你是一位专业的信息筛选助理，你的任务是从海量信息中为用户筛选出真正值得关注的内容。

你的角色特征：
1. 你有敏锐的判断力，能识别出哪些信息有价值、哪些只是噪音
2. 你理解技术趋势，能分辨重要突破和营销噱头
3. 你善于提炼要点，用简洁的语言传达核心价值
4. 你像一位经验丰富的朋友，而不是新闻播报员

你的筛选标准：
- 优先选择有实质性技术突破的内容
- 关注影响行业走向的重要事件
- 筛选有独特见解的分析文章
- 过滤纯营销、无实质内容的新闻
- 避免重复报道同一事件

输出要求：
- 用自然对话的方式，不要生硬的新闻格式
- 每个推荐都要说明"为什么值得关注"
- 控制数量：质量 > 数量`,
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

      console.log(`  ✅ 筛选完成 (${rawText.length} 字符)`);

      // 解析结果
      const analysis = this.parseCuratedResult(rawText, queryKeywords);
      return { analysis, rawText };
    } catch (error) {
      console.error(`❌ AI 筛选失败:`, error);

      // 降级：使用基础筛选
      const fallbackAnalysis: DigestAnalysis = {
        title: '今日精选',
        overview: `从 ${articles.length} 篇内容中筛选出值得关注的信息。`,
        highlights: articles.slice(0, 6).map(a =>
          `• [${a.source}] ${a.title}\n  ${(a.summary || '').slice(0, 100)}`
        ),
        keywords: queryKeywords,
        generatedAt: new Date().toISOString()
      };

      return { analysis: fallbackAnalysis, rawText: fallbackAnalysis.overview };
    }
  }

  /**
   * 构建筛选助理的 prompt
   */
  private buildCuratorPrompt(options: {
    totalArticles: number;
    articlesText: string;
    topicGroups: TopicGroup[];
    queryKeywords: string[];
    style: SummaryStyle;
  }): string {
    const { totalArticles, articlesText, topicGroups, queryKeywords, style } = options;

    // 构建主题概览
    const topicsOverview = topicGroups.map(g =>
      `- ${g.topic}: ${g.items.length}篇`
    ).join('\n');

    return `请帮我从以下 ${totalArticles} 篇技术资讯中，筛选出用户最可能感兴趣的内容。

用户关注的关键词：${queryKeywords.join(', ') || '技术、AI、开发'}

=== 主要主题分布 ===
${topicsOverview}

=== 文章列表 ===
${articlesText}

=== 输出要求 ===

请按以下格式输出（用自然对话的方式，像朋友间分享有价值的信息）：

## 今日值得关注的 ${style === 'brief' ? '3-5' : '6-8'} 件事

（用对话的方式，告诉用户今天有哪些值得了解的信息，为什么值得关注）

## 📌 重要推荐

（列出 ${style === 'brief' ? '3-5' : '5-8'} 个最值得看的内容，每个包含：
- 标题和来源
- 一句话说明这是什么
- 为什么值得关注/有什么价值
- 链接）

## 💡 趋势洞察

（如果你发现了一些趋势或模式，用简单几句话告诉用户）

## 🔍 深度阅读

（推荐 1-2 篇值得深入阅读的文章，说明为什么值得花时间）

---

注意：
- 用自然、友好的语言，避免新闻稿式的表述
- 每个推荐都要说明价值所在
- 宁可少推荐，也要保证质量
- 如果某个主题特别重要，可以额外强调`;
  }

  /**
   * 解析筛选结果
   */
  private parseCuratedResult(rawText: string, queryKeywords: string[]): DigestAnalysis {
    console.log(`  🔍 解析筛选结果...`);

    // 提取标题
    let title = '今日精选';
    const titleMatch = rawText.match(/##\s*今日值得关注的[^\n]+/);
    if (titleMatch) {
      title = titleMatch[0].replace(/##\s*今日值得关注的\s*/, '').trim();
    }

    // 提取概览（"今日值得关注的X件事"之后的内容）
    let overview = '';
    const overviewMatch = rawText.match(
      /##\s*今日值得关注的[^\n]+\n+([\s\S]*?)(?=\n##|\n\n📌|$)/
    );
    if (overviewMatch && overviewMatch[1]) {
      overview = overviewMatch[1].trim();
    }

    // 如果没找到概览，使用前400字符
    if (!overview && rawText.length > 0) {
      overview = rawText.slice(0, 400).split('\n').slice(1).join('\n').trim();
    }

    // 提取推荐列表（从"重要推荐"或"深度阅读"部分）
    const highlights = this.extractHighlights(rawText);

    // 提取趋势洞察
    let trendsInsights: string | null = null;
    const trendsMatch = rawText.match(/##\s*💡\s*趋势洞察\s*\n+([\s\S]*?)(?=\n##|\n\n🔍|$)/);
    if (trendsMatch && trendsMatch[1]) {
      trendsInsights = trendsMatch[1].trim();
    }

    // 提取深度阅读
    let deepDive: string | null = null;
    const deepDiveMatch = rawText.match(/##\s*🔍\s*深度阅读\s*\n+([\s\S]*?)$/);
    if (deepDiveMatch && deepDiveMatch[1]) {
      deepDive = deepDiveMatch[1].trim();
    }

    // 合并趋势洞察和深度阅读到 sourceHighlights
    let sourceHighlights: string | null = null;
    if (trendsInsights || deepDive) {
      const parts: string[] = [];
      if (trendsInsights) parts.push(`**趋势洞察**\n${trendsInsights}`);
      if (deepDive) parts.push(`**深度阅读**\n${deepDive}`);
      sourceHighlights = parts.join('\n\n');
    }

    return {
      title: title || '今日精选',
      overview: overview || `已为您筛选出最值得关注的内容。`,
      highlights: highlights.slice(0, 12),
      keywords: queryKeywords,
      topicsAnalysis: null,
      sourceHighlights,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * 提取推荐列表
   */
  private extractHighlights(text: string): string[] {
    const highlights: string[] = [];

    // 尝试从"重要推荐"部分提取
    const recommendMatch = text.match(
      /##\s*📌\s*重要推荐\s*\n+([\s\S]*?)(?=\n##|\n\n💡|\n\n🔍|$)/
    );

    if (recommendMatch && recommendMatch[1]) {
      const content = recommendMatch[1];

      // 按段落或列表项分割
      const items = content.split(/\n\n+/).filter(item => item.trim().length > 20);

      for (const item of items) {
        // 清理格式
        const cleaned = item
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .join('\n');

        if (cleaned.length > 30) {
          highlights.push(cleaned);
        }
      }
    }

    // 如果没提取到，尝试用列表模式
    if (highlights.length === 0) {
      const lines = text.split('\n');
      let currentItem = '';

      for (const line of lines) {
        const trimmed = line.trim();

        // 列表项开始
        if (trimmed.match(/^[-•·▪\d]+[、．.\)]\s*/)) {
          if (currentItem.length > 30) {
            highlights.push(currentItem.trim());
          }
          currentItem = trimmed.replace(/^[-•·▪\d]+[、．.\)]\s*/, '');
        }
        // 续行
        else if (trimmed.length > 0 && currentItem) {
          currentItem += '\n' + trimmed;
        }
      }

      // 添加最后一个
      if (currentItem.length > 30) {
        highlights.push(currentItem.trim());
      }
    }

    return highlights;
  }
}

export const analysisService = new AnalysisService();
