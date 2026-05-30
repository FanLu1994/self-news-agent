import type { Context } from '@mariozechner/pi-ai';
import { completeWithFallback } from '../model.js';
import { stripLeadingListMarker } from '../text-format.js';
import type { DigestAnalysis, NewsArticle, RankedArticle, SummaryStyle } from '../types/news.types.js';

interface AnalyzeOptions {
  articles: RankedArticle[];
  style: SummaryStyle;
  queryKeywords: string[];
}

interface AnalyzeResult {
  analysis: DigestAnalysis;
  rawText: string;
}

interface TopicGroup {
  topic: string;
  items: NewsArticle[];
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
      ('valueScore' in article ? `   价值分: ${(article as RankedArticle).valueScore}\n` : '') +
      ('valueReasons' in article ? `   入选理由: ${(article as RankedArticle).valueReasons.join('；')}\n` : '') +
      ('riskFlags' in article && (article as RankedArticle).riskFlags.length > 0
        ? `   风险提示: ${(article as RankedArticle).riskFlags.join('；')}\n`
        : '') +
      `   简介: ${(article.summary || '').slice(0, 150)}\n` +
      `   链接: ${article.url}\n` +
      `   时间: ${article.publishedAt}`
    ).join('\n\n');
  }

  async analyze(options: AnalyzeOptions): Promise<AnalyzeResult> {
    const { articles, style, queryKeywords } = options;

    console.log(`\n🤖 智能助理正在编辑 ${articles.length} 篇精选候选...`);

    // 按主题分组
    const topicGroups = this.groupByTopic(articles);

    // 构建文章文本（限制数量以控制 token）
    const articlesText = this.buildCuratedArticlesText(
      articles.slice(0, 12)
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
        title: '今日 AI 开发者精选',
        overview: `已按 AI 开发者价值从候选内容中筛选出 ${Math.min(articles.length, 8)} 条重点。`,
        highlights: articles.slice(0, 8).map(a =>
          `**${a.title}**（${a.source}，价值分 ${a.valueScore}）\n${(a.summary || '').slice(0, 120)}\n为什么值得看：${a.valueReasons.join('；')}\n${a.url}`
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

    return `请帮我把以下 ${totalArticles} 篇已经过程序预筛和打分的 AI 技术资讯，编辑成一份少而精的 AI 开发者情报简报。

用户关注的关键词：${queryKeywords.join(', ') || '技术、AI、开发'}

=== 主要主题分布 ===
${topicsOverview}

=== 文章列表 ===
${articlesText}

=== 输出要求 ===

请按以下格式输出。不要重新扩大范围，不要补充未出现在候选文章里的事实。

## 今日最值得看

（2-4 句话概括今天最重要的方向，面向 AI 开发者）

## 📌 重点推荐

（列出 ${style === 'brief' ? '3-5' : '5-8'} 个最值得看的内容，每个包含：
- 标题和来源
- 一句话说明这是什么
- 为什么值得关注/对 AI 开发者有什么价值
- 如果候选里有风险提示，用一句话点出不确定性
- 链接）

## 💡 趋势判断

（给出 2-3 条趋势判断，每条都要来自上面的候选文章，不要空泛）

## 🔍 深度阅读

（推荐 1-2 篇值得深入阅读的文章，说明为什么值得花时间）

---

注意：
- 用自然、友好的语言，避免新闻稿式的表述
- 每个推荐都要说明价值所在
- 宁可少推荐，也要保证质量，避免营销感
- 保留每条链接
- 如果某个主题特别重要，可以额外强调`;
  }

  /**
   * 解析筛选结果
   */
  private parseCuratedResult(rawText: string, queryKeywords: string[]): DigestAnalysis {
    console.log(`  🔍 解析筛选结果...`);

    // 提取标题
    let title = '今日 AI 开发者精选';
    const titleMatch = rawText.match(/##\s*今日最值得看[^\n]*/);
    if (titleMatch) {
      title = '今日 AI 开发者精选';
    }

    // 提取概览（"今日值得关注的X件事"之后的内容）
    let overview = '';
    const overviewMatch = rawText.match(
      /##\s*今日值得关注的[^\n]+\n+([\s\S]*?)(?=\n##|\n\n📌|$)/
    );
    const newOverviewMatch = rawText.match(
      /##\s*今日最值得看[^\n]*\n+([\s\S]*?)(?=\n##|\n\n📌|$)/
    );
    if (newOverviewMatch && newOverviewMatch[1]) {
      overview = newOverviewMatch[1].trim();
    } else if (overviewMatch && overviewMatch[1]) {
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
    const trendsMatch = rawText.match(/##\s*💡\s*(趋势判断|趋势洞察)\s*\n+([\s\S]*?)(?=\n##|\n\n🔍|$)/);
    if (trendsMatch && trendsMatch[2]) {
      trendsInsights = trendsMatch[2].trim();
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
      if (trendsInsights) parts.push(`**趋势判断**\n${trendsInsights}`);
      if (deepDive) parts.push(`**深度阅读**\n${deepDive}`);
      sourceHighlights = parts.join('\n\n');
    }

    return {
      title: title || '今日 AI 开发者精选',
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
      /##\s*📌\s*(重要推荐|重点推荐)\s*\n+([\s\S]*?)(?=\n##|\n\n💡|\n\n🔍|$)/
    );

    if (recommendMatch && recommendMatch[2]) {
      const content = recommendMatch[2];

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
          highlights.push(stripLeadingListMarker(cleaned));
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
            highlights.push(stripLeadingListMarker(currentItem.trim()));
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
        highlights.push(stripLeadingListMarker(currentItem.trim()));
      }
    }

    return highlights;
  }
}

export const analysisService = new AnalysisService();
