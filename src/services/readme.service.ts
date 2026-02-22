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

  // 构建完整内容
  const sections: string[] = [
    `# ${options.analysis.title} - ${options.date}`,
    '',
    `更新时间: ${formatDateTime(options.analysis.generatedAt)}`,
    '',
  ];

  // 助理简报
  if (options.analysis.overview) {
    sections.push(
      '## 📝 助理简报',
      '',
      options.analysis.overview,
      ''
    );
  }

  // 重点推荐
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

  // 洞察与深度
  if (options.analysis.sourceHighlights) {
    sections.push(
      '## 💡 洞察与深度',
      '',
      options.analysis.sourceHighlights,
      ''
    );
  }

  // 话题统计
  const topicSummary = Object.entries(options.topicStats.byTopic)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
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

  // 来源明细
  const sourceSections = Object.entries(grouped)
    .filter(([_, items]) => items.length > 0)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([source, items]) => {
      const lines = items.slice(0, 10).map((item, idx) =>
        `${idx + 1}. [${item.title}](${item.url})\n   - 摘要: ${item.summary}\n   - 时间: ${formatDateTime(item.publishedAt)}`
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
