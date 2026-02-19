import { readFile, writeFile } from 'node:fs/promises';
import type { DigestAnalysis, TopicStatsDay } from '../types/news.types.js';

interface TopicTrendSummary {
  topic: string;
  count7d: number;
  count30d: number;
  trend7d: number[];
}

const LATEST_START = '<!-- digest:latest:start -->';
const LATEST_END = '<!-- digest:latest:end -->';
const TREND_START = '<!-- digest:trend:start -->';
const TREND_END = '<!-- digest:trend:end -->';

function buildLatestBlock(date: string, analysis: DigestAnalysis, docPath: string): string {
  const highlights = analysis.highlights.slice(0, 5).map((item, i) => `${i + 1}. ${item}`).join('\n');
  return [
    LATEST_START,
    `## 最新简报 (${date})`,
    '',
    analysis.overview,
    '',
    '重点:',
    highlights,
    '',
    `完整内容: [${docPath}](${docPath})`,
    LATEST_END
  ].join('\n');
}

function buildTrendBlock(today: TopicStatsDay, trend: TopicTrendSummary[]): string {
  const rows = trend.slice(0, 10).map(item =>
    `| ${item.topic} | ${item.count7d} | ${item.count30d} | ${item.trend7d.join(', ')} |`
  ).join('\n');

  return [
    TREND_START,
    `## 话题趋势 (${today.date})`,
    '',
    '| Topic | 7d | 30d | 近7天分布 |',
    '| --- | --- | --- | --- |',
    rows || '| Other | 0 | 0 | 0, 0, 0, 0, 0, 0, 0 |',
    TREND_END
  ].join('\n');
}

function replaceBlock(content: string, start: string, end: string, block: string): string {
  const startIndex = content.indexOf(start);
  const endIndex = content.indexOf(end);
  if (startIndex >= 0 && endIndex > startIndex) {
    const before = content.slice(0, startIndex);
    const after = content.slice(endIndex + end.length);
    return `${before}${block}${after}`;
  }
  return `${block}\n\n${content}`;
}

export class ReadmeService {
  async updateReadme(options: {
    readmePath: string;
    date: string;
    analysis: DigestAnalysis;
    docPath: string;
    todayTopicStats: TopicStatsDay;
    trend: TopicTrendSummary[];
  }): Promise<void> {
    let content = '';
    try {
      content = await readFile(options.readmePath, 'utf-8');
    } catch {
      content = '# Self News Agent\n\n';
    }

    const latestBlock = buildLatestBlock(options.date, options.analysis, options.docPath);
    const trendBlock = buildTrendBlock(options.todayTopicStats, options.trend);

    let next = replaceBlock(content, LATEST_START, LATEST_END, latestBlock);
    next = replaceBlock(next, TREND_START, TREND_END, trendBlock);

    await writeFile(options.readmePath, next, 'utf-8');
  }
}

export const readmeService = new ReadmeService();
