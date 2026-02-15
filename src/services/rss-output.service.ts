import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DigestAnalysis, NewsArticle } from '../types/news.types.js';

interface BuildRssOptions {
  analysis: DigestAnalysis;
  articles: NewsArticle[];
  channelTitle?: string;
  channelLink?: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export class RssOutputService {
  buildXml(options: BuildRssOptions): string {
    const now = new Date().toUTCString();
    const channelTitle = options.channelTitle || 'Self News Agent Digest';
    const channelLink = options.channelLink || 'https://example.com/self-news-agent';

    const summaryItem = `
      <item>
        <title>${escapeXml(options.analysis.title)}</title>
        <link>${escapeXml(channelLink)}</link>
        <description>${escapeXml(options.analysis.overview)}</description>
        <pubDate>${now}</pubDate>
        <guid isPermaLink="false">digest-${escapeXml(options.analysis.generatedAt)}</guid>
      </item>
    `.trim();

    const articleItems = options.articles.slice(0, 30).map(article => `
      <item>
        <title>${escapeXml(article.title)}</title>
        <link>${escapeXml(article.url)}</link>
        <description>${escapeXml(article.summary)}</description>
        <author>${escapeXml(article.author || article.source)}</author>
        <category>${escapeXml(article.sourceType)}</category>
        <pubDate>${new Date(article.publishedAt).toUTCString()}</pubDate>
        <guid isPermaLink="false">${escapeXml(article.id)}</guid>
      </item>
    `.trim()).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(channelTitle)}</title>
    <link>${escapeXml(channelLink)}</link>
    <description>${escapeXml(options.analysis.overview)}</description>
    <language>zh-cn</language>
    <lastBuildDate>${now}</lastBuildDate>
    ${summaryItem}
    ${articleItems}
  </channel>
</rss>`;
  }

  async writeToFile(path: string, xml: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, xml, 'utf-8');
  }
}

export const rssOutputService = new RssOutputService();
