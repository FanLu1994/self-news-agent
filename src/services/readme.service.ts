import { writeFile } from 'node:fs/promises';
import type { DigestAnalysis, TopicStatsDay, NewsArticle } from '../types/news.types.js';

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

function buildDailyMarkdown(options: {
  date: string;
  analysis: DigestAnalysis;
  articles: NewsArticle[];
  topicStats: TopicStatsDay;
}): string {
  const grouped = groupBySource(options.articles);
  const sourceSections = Object.entries(grouped).map(([source, items]) => {
    const lines = items.slice(0, 20).map((item, idx) =>
      `${idx + 1}. [${item.title}](${item.url})\n   - 核心观点: ${item.summary}\n   - 发布时间: ${formatDateTime(item.publishedAt)}`
    );
    return `## ${source}\n\n${lines.join('\n')}`;
  }).join('\n\n');

  const topicSummary = Object.entries(options.topicStats.byTopic)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([topic, count]) => `- ${topic}: ${count}`)
    .join('\n');

  return [
    `# 每日新闻简报 - ${options.date}`,
    '',
    `生成时间: ${formatDateTime(options.analysis.generatedAt)}`,
    '',
    '## 摘要',
    '',
    options.analysis.overview,
    '',
    '## 今日重点',
    '',
    ...options.analysis.highlights.map((item, index) => `${index + 1}. ${item}`),
    '',
    '## 话题统计',
    '',
    topicSummary || '- Other: 0',
    '',
    '## 来源明细',
    '',
    sourceSections,
    ''
  ].join('\n');
}

export class ReadmeService {
  async updateReadme(options: {
    readmePath: string;
    date: string;
    analysis: DigestAnalysis;
    articles: NewsArticle[];
    topicStats: TopicStatsDay;
  }): Promise<void> {
    const markdown = buildDailyMarkdown({
      date: options.date,
      analysis: options.analysis,
      articles: options.articles,
      topicStats: options.topicStats
    });

    await writeFile(options.readmePath, markdown, 'utf-8');
  }
}

export const readmeService = new ReadmeService();
