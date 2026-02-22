import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DigestAnalysis, NewsArticle, TopicStatsDay } from '../types/news.types.js';

interface WriteDailyMarkdownOptions {
  path: string;
  date: string;
  analysis: DigestAnalysis;
  articles: NewsArticle[];
  topicStats: TopicStatsDay;
}

function formatDateTime(date: string): string {
  return new Date(date).toLocaleString('zh-CN', { hour12: false });
}

function groupBySource(articles: NewsArticle[]): Record<string, NewsArticle[]> {
  return articles.reduce((acc, article) => {
    const key = article.source;
    if (!acc[key]) acc[key] = [];
    acc[key].push(article);
    return acc;
  }, {} as Record<string, NewsArticle[]>);
}

export class MarkdownOutputService {
  buildDailyMarkdown(options: WriteDailyMarkdownOptions): string {
    const grouped = groupBySource(options.articles);

    // 构建来源明细部分
    const sourceSections = Object.entries(grouped).map(([source, items]) => {
      const lines = items.slice(0, 20).map((item, idx) =>
        `${idx + 1}. [${item.title}](${item.url})\n   - 核心观点: ${item.summary}\n   - 发布时间: ${formatDateTime(item.publishedAt)}`
      );
      return `## ${source}\n\n${lines.join('\n')}`;
    }).join('\n\n');

    // 构建话题统计
    const topicSummary = Object.entries(options.topicStats.byTopic)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([topic, count]) => `- ${topic}: ${count}`)
      .join('\n');

    // 构建完整内容
    const sections: string[] = [
      `# ${options.analysis.title} - ${options.date}`,
      '',
      `生成时间: ${formatDateTime(options.analysis.generatedAt)}`,
      '',
      '## 📋 摘要',
      '',
      options.analysis.overview,
      '',
      '## 🔥 重点内容',
      '',
      ...options.analysis.highlights.map((item, index) => `${index + 1}. ${item}`)
    ];

    // 添加话题分析（如果有）
    if (options.analysis.topicsAnalysis) {
      sections.push(
        '',
        '## 💬 话题分析',
        '',
        options.analysis.topicsAnalysis
      );
    }

    // 添加来源亮点（如果有）
    if (options.analysis.sourceHighlights) {
      sections.push(
        '',
        '## 📰 来源亮点',
        '',
        options.analysis.sourceHighlights
      );
    }

    sections.push(
      '',
      '## 📊 话题统计',
      '',
      topicSummary || '- Other: 0',
      '',
      '## 📂 来源明细',
      '',
      sourceSections
    );

    return sections.join('\n');
  }

  async writeDailyMarkdown(options: WriteDailyMarkdownOptions): Promise<void> {
    await mkdir(dirname(options.path), { recursive: true });
    const markdown = this.buildDailyMarkdown(options);
    await writeFile(options.path, markdown, 'utf-8');
  }
}

export const markdownOutputService = new MarkdownOutputService();
