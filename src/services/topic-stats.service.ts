import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { TopicCategory, TopicStatsDay } from '../types/news.types.js';

interface TopicTrendSummary {
  topic: TopicCategory;
  count7d: number;
  count30d: number;
  trend7d: number[];
}

function safeParseHistory(raw: string): TopicStatsDay[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toISODate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function getLastNDates(n: number): string[] {
  const dates: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(toISODate(d));
  }
  return dates;
}

export class TopicStatsService {
  async readHistory(path: string): Promise<TopicStatsDay[]> {
    try {
      const content = await readFile(path, 'utf-8');
      const history = safeParseHistory(content);
      return history.sort((a, b) => a.date.localeCompare(b.date));
    } catch {
      return [];
    }
  }

  async upsertDay(path: string, day: TopicStatsDay): Promise<TopicStatsDay[]> {
    const history = await this.readHistory(path);
    const filtered = history.filter(item => item.date !== day.date);
    filtered.push(day);
    filtered.sort((a, b) => a.date.localeCompare(b.date));

    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(filtered, null, 2), 'utf-8');
    return filtered;
  }

  buildTrendSummary(history: TopicStatsDay[]): TopicTrendSummary[] {
    const dates7 = getLastNDates(7);
    const dates30 = getLastNDates(30);
    const byDate = new Map(history.map(item => [item.date, item]));

    const topics = new Set<TopicCategory>();
    for (const item of history) {
      for (const topic of Object.keys(item.byTopic) as TopicCategory[]) {
        topics.add(topic);
      }
    }

    const result: TopicTrendSummary[] = [];
    for (const topic of topics) {
      const trend7d = dates7.map(date => byDate.get(date)?.byTopic?.[topic] || 0);
      const count7d = trend7d.reduce((sum, n) => sum + n, 0);
      const count30d = dates30.reduce((sum, date) => sum + (byDate.get(date)?.byTopic?.[topic] || 0), 0);
      result.push({ topic, count7d, count30d, trend7d });
    }

    result.sort((a, b) => b.count7d - a.count7d);
    return result;
  }
}

export const topicStatsService = new TopicStatsService();
