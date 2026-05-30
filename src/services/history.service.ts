/**
 * 历史记录服务 - 用于读取和解析历史日报
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

interface HistoricalArticle {
  title: string;
  url: string;
  source: string;
  date: string;
}

/**
 * 历史记录服务
 */
export class HistoryService {
  /**
   * 从历史日报中提取文章信息
   */
  private async parseDailyFile(filePath: string): Promise<HistoricalArticle[]> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const articles: HistoricalArticle[] = [];

      // 匹配类似格式：
      // ### Source Name (X篇)
      // 1. [Title](url)
      //    - 摘要: ...
      //    - 时间: ...

      const lines = content.split('\n');
      let currentSource = '';
      let inArticleSection = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // 匹配来源标题：### Source Name (X篇)
        const sourceMatch = line.match(/^###\s*(.+?)\s*\(\d+篇\)/);
        if (sourceMatch) {
          currentSource = sourceMatch[1].trim();
          inArticleSection = true;
          continue;
        }

        // 匹配文章链接：1. [Title](url)
        const articleMatch = line.match(/^\d+\.\s*\[([^\]]+)\]\(([^)]+)\)/);
        if (articleMatch && inArticleSection) {
          const title = articleMatch[1].trim();
          const url = articleMatch[2].trim();
          const timeMatch = lines[i + 2]?.match(/.*时间:\s*(.+)/);

          articles.push({
            title,
            url,
            source: currentSource || 'Unknown',
            date: timeMatch ? timeMatch[1].trim() : ''
          });
        }
      }

      return articles;
    } catch (error) {
      console.error(`Failed to parse daily file: ${filePath}`, error);
      return [];
    }
  }

  /**
   * 从目录名提取日期 (YYYY-MM-DD 或 YYYY-MM-DD-HH-MM-SS-ms)
   */
  private extractDateFromFilename(filename: string): string | null {
    // 匹配 YYYY-MM-DD 格式
    const match = filename.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
  }

  /**
   * 获取指定天数内的历史文章
   * @param dailyDir 日报目录
   * @param days 获取最近多少天的历史记录
   */
  async getHistoricalArticles(dailyDir: string, days: number = 7): Promise<HistoricalArticle[]> {
    try {
      const files = await readdir(dailyDir);
      const now = new Date();
      const cutoffDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

      // 筛选符合条件的文件
      const validFiles = files
        .filter(file => {
          const dateStr = this.extractDateFromFilename(file);
          if (!dateStr) return false;
          const fileDate = new Date(dateStr);
          return !isNaN(fileDate.getTime()) && fileDate >= cutoffDate;
        })
        .sort() // 按文件名排序（升序，即从旧到新）
        .slice(0, -1); // 去掉最新的文件（今天的）

      const allArticles: HistoricalArticle[] = [];

      for (const file of validFiles) {
        const filePath = join(dailyDir, file);
        const articles = await this.parseDailyFile(filePath);
        allArticles.push(...articles);
      }

      console.log(`  📜 从 ${validFiles.length} 个历史文件中解析出 ${allArticles.length} 篇文章`);
      return allArticles;
    } catch (error) {
      console.error('Failed to read historical articles:', error);
      return [];
    }
  }

  /**
   * 构建历史记录的 URL 集合（用于快速去重）
   */
  buildHistoricalUrlSet(historicalArticles: HistoricalArticle[]): Set<string> {
    const urlSet = new Set<string>();
    for (const article of historicalArticles) {
      // 标准化 URL（移除查询参数）
      const normalizedUrl = article.url.split('?')[0].trim().toLowerCase();
      urlSet.add(normalizedUrl);
    }
    return urlSet;
  }

  /**
   * 构建历史记录的标题集合（用于快速去重）
   */
  buildHistoricalTitleSet(historicalArticles: HistoricalArticle[]): Set<string> {
    const titleSet = new Set<string>();
    for (const article of historicalArticles) {
      // 标准化标题（移除特殊字符，转为小写）
      const normalizedTitle = article.title
        .toLowerCase()
        .replace(/[^\w\s\u4e00-\u9fa5]/g, '')
        .trim();
      titleSet.add(normalizedTitle);
    }
    return titleSet;
  }
}

export const historyService = new HistoryService();
