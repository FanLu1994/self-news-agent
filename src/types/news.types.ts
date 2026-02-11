/**
 * 新闻类型定义
 * 
 * 教学要点：
 * - TypeScript 接口定义最佳实践
 * - 使用字面量类型 (literal types) 定义枚举
 * - 可选属性和联合类型的使用
 */

/**
 * 新闻分类
 */
export type NewsCategory = 'ai' | 'ml' | 'nlp' | 'cv' | 'robotics' | 'all';

/**
 * 语言类型
 */
export type Language = 'en' | 'zh' | 'all';

/**
 * 时间范围
 */
export type TimeRange = '1d' | '3d' | '7d';

/**
 * 总结风格
 */
export type SummaryStyle = 'brief' | 'detailed' | 'keywords';

/**
 * 新闻文章接口
 */
export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  author?: string;
  publishedAt: string;
  category: NewsCategory;
  language: Language;
  score?: number;          // HackerNews 评分
  commentCount?: number;   // 评论数量
  tags?: string[];
}

/**
 * HackerNews Item 接口
 */
export interface HNItem {
  id: number;
  type: 'story' | 'comment' | 'poll' | 'job';
  by?: string;
  time: number;
  title?: string;
  url?: string;
  text?: string;
  score?: number;
  descendants?: number;  // 评论数
  kids?: number[];       // 子评论 IDs
}

/**
 * RSS Feed Item 接口
 */
export interface RSSFeedItem {
  title?: string;
  link?: string;
  pubDate?: string;
  creator?: string;
  content?: string;
  contentSnippet?: string;
  categories?: string[];
}

/**
 * 新闻获取选项
 */
export interface FetchNewsOptions {
  category: NewsCategory;
  language: Language;
  limit: number;
  timeRange: TimeRange;
}

/**
 * 新闻总结结果
 */
export interface NewsSummary {
  overview: string;
  mainTopics: string[];
  keyTrends: string[];
  detailedAnalysis: {
    breakthroughs: string[];
    industryImpacts: string[];
    futureImplications: string[];
    regionalInsights: {
      international: string;
      china: string;
    };
  };
  topArticles: Array<{
    title: string;
    url: string;
    reason: string;
  }>;
  categoryBreakdown: Record<string, number>;
  languageDistribution: {
    en: number;
    zh: number;
  };
  totalArticles: number;
  generatedAt: string;
}

/**
 * 工具结果详情
 */
export interface ToolResultDetails {
  articleCount?: number;
  category?: NewsCategory;
  language?: Language;
  timeRange?: TimeRange;
  tokenUsage?: {
    input: number;
    output: number;
    total: number;
    cost: number;
  };
  style?: SummaryStyle;
  articlesAnalyzed?: number;
}
