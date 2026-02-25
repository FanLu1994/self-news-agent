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
  return new Date(date).toLocaleString('zh-CN', {
    hour12: false,
    timeZone: 'Asia/Shanghai'
  });
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

    // 构建完整内容
    const sections: string[] = [
      `# ${options.analysis.title} - ${options.date}`,
      '',
      `生成时间: ${formatDateTime(options.analysis.generatedAt)}`,
      '',
    ];

    // 如果有概览，添加概览
    if (options.analysis.overview) {
      sections.push(
        '## 📝 助理简报',
        '',
        options.analysis.overview,
        ''
      );
    }

    // 添加重点推荐
    if (options.analysis.highlights.length > 0) {
      sections.push(
        '## ⭐ 重点推荐',
        '',
        ...options.analysis.highlights.map((item, index) =>
          typeof item === 'string'
            ? `${index + 1}. ${item}`
            : `${index + 1}. ${JSON.stringify(item)}`
        ),
        ''
      );
    }

    // 添加趋势洞察/深度阅读（如果有）
    if (options.analysis.sourceHighlights) {
      sections.push(
        '## 💡 洞察与深度',
        '',
        options.analysis.sourceHighlights,
        ''
      );
    }

    // 添加话题统计
    const topicSummary = Object.entries(options.topicStats.byTopic)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([topic, count]) => `- ${topic}: ${count}`)
      .join('\n');

    sections.push(
      '---',
      '',
      '## 📊 话题分布',
      '',
      topicSummary || '- Other: 0',
      ''
    );

    // 构建来源明细（放在最后，作为参考）
    const sourceSections = Object.entries(grouped)
      .filter(([_, items]) => items.length > 0)
      .sort((a, b) => b[1].length - a[1].length) // 按数量排序
      .map(([source, items]) => {
        const lines = items.slice(0, 15).map((item, idx) =>
          `${idx + 1}. [${item.title}](${item.url})\n` +
          `   - 摘要: ${item.summary}\n` +
          `   - 时间: ${formatDateTime(item.publishedAt)}`
        );
        return `### ${source} (${items.length}篇)\n\n${lines.join('\n')}`;
      })
      .join('\n\n');

    sections.push(
      '## 📂 完整来源',
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
