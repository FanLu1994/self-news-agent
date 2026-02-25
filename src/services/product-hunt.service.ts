import Parser from 'rss-parser';
import type { NewsArticle, TimeRange } from '../types/news.types.js';
import { translationService } from './translation.service.js';

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
  thumbnail?: string;
  votes?: string;
  comments?: string;
  'media:thumbnail'?: string;
  'ph:votes'?: string;
  'ph:comments'?: string;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
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
   * 清理 feed 文本
   */
  private normalizeFeedText(text: string): string {
    const decoded = decodeHtmlEntities(text);
    return decoded
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * 从 Product Hunt Atom feed 中提取段落文本
   */
  private extractParagraphs(content: string | undefined): string[] {
    if (!content) return [];

    const decoded = decodeHtmlEntities(content);
    const paragraphMatches = decoded.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || [];

    const paragraphs = paragraphMatches
      .map(paragraph => this.normalizeFeedText(paragraph))
      .map(paragraph => paragraph.replace(/^[-:|]\s*/, '').trim())
      .filter(Boolean)
      .filter(paragraph => !/^\s*(discussion|link)\s*(\||$)/i.test(paragraph));

    if (paragraphs.length > 0) return paragraphs;

    const plain = this.normalizeFeedText(content);
    if (!plain) return [];

    const fallback = plain
      .split(/\s*\|\s*|\s*[•·]\s*/g)
      .map(segment => segment.trim())
      .filter(Boolean)
      .filter(segment => !/^(discussion|link)$/i.test(segment));

    return fallback;
  }

  /**
   * 清理翻译输出，去除模型常见附加前缀/引号
   */
  private normalizeTranslatedText(text: string): string {
    return text
      .replace(/^翻译[:：]\s*/i, '')
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * 从 Product Hunt Atom feed 解析产品
   */
  private parseProductHuntItem(item: ProductHuntFeedItem): ProductHuntPost | null {
    if (!item.title || !item.link) return null;

    const name = item.title.trim();
    const paragraphs = this.extractParagraphs(item.content || item.contentSnippet);
    const snippet = item.contentSnippet ? this.normalizeFeedText(item.contentSnippet) : '';

    // 常见格式：第一段为 tagline，第二段可能是更完整介绍
    const tagline = paragraphs[0] || snippet || '';
    let description = paragraphs[1] || snippet || tagline;
    if (!description) description = tagline;

    // 提取投票数和评论数
    const votesRaw = item.votes ?? item['ph:votes'];
    const commentsRaw = item.comments ?? item['ph:comments'];
    const votes = votesRaw ? parseInt(String(votesRaw), 10) : undefined;
    const comments = commentsRaw ? parseInt(String(commentsRaw), 10) : undefined;

    // 提取分类/话题
    const topics = (item.categories || []).map(topic => this.normalizeFeedText(topic)).filter(Boolean);

    return {
      name,
      tagline,
      description: description.slice(0, 500),
      url: item.link,
      votes,
      comments,
      thumbnail: item.thumbnail || item['media:thumbnail'] || undefined,
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
   * 翻译 Product Hunt 产品信息（名称保持原文，仅翻译标语和描述）
   */
  async translateProducts(
    products: ProductHuntPost[],
    to: 'zh' | 'en' = 'zh'
  ): Promise<ProductHuntPost[]> {
    const translated: ProductHuntPost[] = [];

    for (const product of products) {
      const translateText = async (text: string): Promise<string> => {
        if (!text.trim()) return text;
        const result = await translationService.translate({
          text,
          from: 'en', // Product Hunt 以英文为主，避免自动检测失准导致漏翻
          to
        });
        return this.normalizeTranslatedText(result.translatedText || text);
      };

      const translatedTagline = product.tagline
        ? await translateText(product.tagline)
        : product.tagline;

      const translatedDescription = product.description
        ? (
            product.description.trim() === product.tagline.trim()
              ? translatedTagline
              : await translateText(product.description)
          )
        : product.description;

      const translatedTopics: string[] = [];
      for (const topic of product.topics || []) {
        const translatedTopic = await translateText(topic);
        translatedTopics.push(translatedTopic || topic);
      }

      const taglineResult = product.tagline
        ? { translatedText: translatedTagline }
        : null;
      const descriptionResult = product.description
        ? { translatedText: translatedDescription }
        : null;

      translated.push({
        ...product,
        tagline: taglineResult?.translatedText || product.tagline,
        description: descriptionResult?.translatedText || product.description,
        topics: translatedTopics.length > 0 ? translatedTopics : product.topics
      });

      // 避免请求过快
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    return translated;
  }

  /**
   * 将 Product Hunt 产品转换为 NewsArticle 格式
   */
  toArticles(products: ProductHuntPost[], language: 'zh' | 'en' = 'en'): NewsArticle[] {
    const now = new Date().toISOString();

    return products.map((product, index) => {
      const votesText = product.votes ? `🗳️ ${product.votes} 票` : '';
      const commentsText = product.comments ? `💬 ${product.comments} 评论` : '';
      const statsText = [votesText, commentsText].filter(Boolean).join(' | ');

      // 提取主要话题
      const mainTopic = product.topics && product.topics.length > 0
        ? product.topics[0]
        : 'Product Hunt';
      const topicTags = product.topics ? product.topics.slice(0, 3) : [];

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
        language,
        score: product.votes || 0,
        tags: [mainTopic, 'Product Hunt', ...topicTags].filter(Boolean)
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
        p.description && p.description !== p.tagline ? p.description : '',
        stats ? `_${stats}_` : '',
        p.url,
        ''
      );
    }

    return lines.join('\n');
  }
}

export const productHuntService = new ProductHuntService();
