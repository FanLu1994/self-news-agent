import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { stripLeadingListMarker } from '../text-format.js';
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

function cleanListItem(value: string): string {
  return stripLeadingListMarker(value);
}

function rankedMeta(article: NewsArticle): string {
  const valueScore = 'valueScore' in article ? Number(article.valueScore) : null;
  const reasons = 'valueReasons' in article && Array.isArray(article.valueReasons)
    ? article.valueReasons as string[]
    : [];
  const parts = [
    valueScore !== null && Number.isFinite(valueScore) ? `价值分: ${valueScore}` : '',
    reasons.length > 0 ? `理由: ${reasons.slice(0, 2).join('；')}` : ''
  ].filter(Boolean);
  return parts.length > 0 ? `   - ${parts.join(' | ')}\n` : '';
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
        '## 今日最值得看',
        '',
        options.analysis.overview,
        ''
      );
    }

    // 添加重点推荐
    if (options.analysis.highlights.length > 0) {
      sections.push(
        '## 重点推荐',
        '',
        ...options.analysis.highlights.map((item, index) =>
          typeof item === 'string'
            ? `${index + 1}. ${cleanListItem(item)}`
            : `${index + 1}. ${JSON.stringify(item)}`
        ),
        ''
      );
    }

    // 添加趋势洞察/深度阅读（如果有）
    if (options.analysis.sourceHighlights) {
      sections.push(
        '## 趋势判断与深度阅读',
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
          rankedMeta(item) +
          `   - 时间: ${formatDateTime(item.publishedAt)}`
      );
        return `### ${source} (${items.length}篇)\n\n${lines.join('\n')}`;
      })
      .join('\n\n');

    sections.push(
      '## 完整来源归档',
      '',
      '<details>',
      '<summary>展开全部来源</summary>',
      '',
      sourceSections
        ? sourceSections
        : '暂无来源明细',
      '',
      '</details>'
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
