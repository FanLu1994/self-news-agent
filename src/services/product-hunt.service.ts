import Parser from 'rss-parser';
import type { NewsArticle, TimeRange } from '../types/news.types.js';

interface ProductHuntPost {
  name: string;
  tagline: string;
  description: string;
  url: string;
  votes?: number;
  comments?: number;
  thumbnail?: string;
  topics?: string[];
}

interface ProductHuntFeedItem {
  title?: string;
  link?: string;
  pubDate?: string;
  content?: string;
  contentSnippet?: string;
  categories?: string[];
  'media:thumbnail'?: string;
  'ph:votes'?: string;
  'ph:comments'?: string;
}

/**
 * Product Hunt 服务
 * 专门处理 Product Hunt 的产品数据
 */
export class ProductHuntService {
  private parser: Parser;

  constructor() {
    this.parser = new Parser({
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AI News Agent/1.1)'
      },
      customFields: {
        item: [
          ['media:thumbnail', 'thumbnail'],
          ['ph:votes', 'votes'],
          ['ph:comments', 'comments']
        ]
      }
    });
  }

  /**
   * 从 Product Hunt Atom feed 的 content 中提取 tagline
   * Atom 格式：第一个 <p> 为产品标语，第二个 <p> 为 Discussion | Link
   */
  private extractTaglineFromContent(content: string | undefined): string {
    if (!content) return '';
    // 匹配第一个 <p>...</p> 或 &lt;p&gt;...&lt;/p&gt;（实体编码）
    const match =
      content.match(/<p[^>]*>([\s\S]*?)<\/p>/i) ??
      content.match(/&lt;p[^&]*&gt;([\s\S]*?)&lt;\/p&gt;/i);
    if (match) {
      return match[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&[^;]+;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    // 回退：contentSnippet 可能把 "Discussion | Link" 也包含进来，取第一个有意义段落
    const beforeDiscussion = content.split(/Discussion|Link/i)[0];
    return beforeDiscussion.replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * 从 Product Hunt Atom feed 解析产品
   * Atom 格式：title 仅为产品名，tagline 在 content 第一个 <p> 中
   */
  private parseProductHuntItem(item: any): ProductHuntPost | null {
    if (!item.title || !item.link) return null;

    // Atom 格式：title 仅为产品名
    const name = item.title.trim();

    // 从 content 第一个 <p> 提取 tagline（产品标语）
    const tagline = this.extractTaglineFromContent(item.content || item.contentSnippet);
    const description = tagline;

    // 提取投票数和评论数
    const votes = item.votes ? parseInt(String(item.votes), 10) : undefined;
    const comments = item.comments ? parseInt(String(item.comments), 10) : undefined;

    // 提取分类/话题
    const topics = item.categories || [];

    return {
      name,
      tagline,
      description: description.slice(0, 300),
      url: item.link,
      votes,
      comments,
      thumbnail: item.thumbnail || undefined,
      topics
    };
  }

  /**
   * 获取 Product Hunt 热门产品
   */
  async fetchTopProducts(options: {
    feedUrl: string;
    limit: number;
    timeRange: TimeRange;
  }): Promise<ProductHuntPost[]> {
    try {
      const feed = await this.parser.parseURL(options.feedUrl);
      if (!feed.items || feed.items.length === 0) {
        console.log('Product Hunt: 无数据');
        return [];
      }

      const products = feed.items
        .map(item => this.parseProductHuntItem(item))
        .filter((p): p is ProductHuntPost => p !== null);

      // 按投票数排序
      products.sort((a, b) => (b.votes || 0) - (a.votes || 0));

      console.log(`Product Hunt: 获取到 ${products.length} 个产品`);

      return products.slice(0, options.limit);
    } catch (error) {
      console.error('Product Hunt fetch failed:', error instanceof Error ? error.message : error);
      return [];
    }
  }

  /**
   * 将 Product Hunt 产品转换为 NewsArticle 格式
   */
  toArticles(products: ProductHuntPost[]): NewsArticle[] {
    const now = new Date().toISOString();

    return products.map((product, index) => {
      const votesText = product.votes ? `🗳️ ${product.votes} 票` : '';
      const commentsText = product.comments ? `💬 ${product.comments} 评论` : '';
      const statsText = [votesText, commentsText].filter(Boolean).join(' | ');

      // 提取主要话题
      const mainTopic = product.topics && product.topics.length > 0
        ? product.topics[0]
        : 'Product Hunt';

      return {
        id: `ph-${Date.now()}-${index}`,
        title: product.tagline ? `${product.name} - ${product.tagline}` : product.name,
        summary: `${product.description}${statsText ? ` | ${statsText}` : ''}`,
        url: product.url,
        source: 'Product Hunt',
        sourceType: 'producthunt',
        author: product.name,
        publishedAt: now,
        category: 'all',
        language: 'en',
        score: product.votes || 0,
        tags: [mainTopic, 'Product Hunt', ...product.topics.slice(0, 3)].filter(Boolean)
      } as NewsArticle;
    });
  }

  /**
   * 生成 Product Hunt 推荐文本
   */
  generateRecommendationText(products: ProductHuntPost[]): string {
    if (products.length === 0) return '';

    const lines: string[] = [];

    for (let i = 0; i < Math.min(products.length, 5); i++) {
      const p = products[i];
      const votes = p.votes ? `${p.votes} 票` : '';
      const comments = p.comments ? `${p.comments} 评论` : '';
      const stats = [votes, comments].filter(Boolean).join(' • ');

      lines.push(
        `**${p.name}**`,
        p.tagline || '',
        stats ? `_${stats}_` : '',
        p.url,
        ''
      );
    }

    return lines.join('\n');
  }
}

export const productHuntService = new ProductHuntService();
