import { canonicalizeUrl, normalizeTitle } from '../utils/article-utils.js';
import type { CurationProfile, NewsArticle, RankedArticle, SourceType } from '../types/news.types.js';

interface CurateOptions {
  articles: NewsArticle[];
  profile: CurationProfile;
  maxHighlights: number;
  minScore: number;
}

export interface CurateResult {
  rankedArticles: RankedArticle[];
  selectedArticles: RankedArticle[];
  filteredLowValueCount: number;
}

const PROFILE_KEYWORDS = [
  'agent',
  'agents',
  '智能体',
  'coding',
  'code',
  'codex',
  'claude code',
  'cursor',
  'devin',
  'openhands',
  'mcp',
  'skill',
  'skills',
  'tool use',
  '工具调用',
  'llm',
  '模型',
  'inference',
  '推理',
  'benchmark',
  'eval',
  '开源',
  'github',
  'prompt'
];

const SUBSTANTIVE_KEYWORDS = [
  'release',
  'launch',
  'open source',
  'benchmark',
  'paper',
  'api',
  'sdk',
  'framework',
  'runtime',
  '模型',
  '发布',
  '开源',
  '评测',
  '基准',
  '论文',
  '接口',
  '框架',
  '性能',
  '训练',
  '推理'
];

const LOW_VALUE_KEYWORDS = [
  '免费',
  '抽奖',
  '注册',
  '优惠',
  '邀请码',
  '求助',
  '碎碎念',
  '招聘',
  '广告',
  'newsletter',
  'webinar'
];

const SOURCE_RELIABILITY: Record<SourceType, number> = {
  aihot: 0.95,
  hex2077: 0.88,
  hn: 0.82,
  github: 0.78,
  rss: 0.72,
  twitter: 0.62,
  producthunt: 0.58,
  reddit: 0.55,
  ve2x: 0.48,
  linuxdo: 0.45
};

function containsAny(text: string, keywords: string[]): string[] {
  return keywords.filter(keyword => text.includes(keyword.toLowerCase()));
}

function sourceReliability(article: NewsArticle): number {
  return SOURCE_RELIABILITY[article.sourceType] ?? 0.5;
}

function sourceScore(article: NewsArticle): number {
  return Math.round(sourceReliability(article) * 20);
}

function heatScore(article: NewsArticle): number {
  const score = article.score || 0;
  const comments = article.commentCount || 0;
  if (score <= 0 && comments <= 0) return 0;
  return Math.min(18, Math.round(Math.log1p(score + comments * 2) * 4));
}

function freshnessScore(article: NewsArticle): number {
  const ageHours = (Date.now() - new Date(article.publishedAt).getTime()) / (1000 * 60 * 60);
  if (!Number.isFinite(ageHours) || ageHours < 0) return 4;
  if (ageHours <= 24) return 10;
  if (ageHours <= 72) return 6;
  return 2;
}

function buildClusterId(article: NewsArticle): string {
  const title = normalizeTitle(article.title).slice(0, 80).replace(/\s+/g, '-');
  return `${article.sourceType}-${title || canonicalizeUrl(article.url)}`;
}

function scoreArticle(article: NewsArticle, profile: CurationProfile): RankedArticle {
  const reasons: string[] = [];
  const risks: string[] = [];
  const text = `${article.title} ${article.summary} ${(article.tags || []).join(' ')}`.toLowerCase();
  let score = 20;

  const profileHits = profile === 'ai-developer' ? containsAny(text, PROFILE_KEYWORDS) : [];
  if (profileHits.length > 0) {
    score += Math.min(28, 10 + profileHits.length * 3);
    reasons.push(`命中 AI 开发者关注点: ${profileHits.slice(0, 4).join(', ')}`);
  }

  const substantiveHits = containsAny(text, SUBSTANTIVE_KEYWORDS);
  if (substantiveHits.length > 0) {
    score += Math.min(18, 6 + substantiveHits.length * 2);
    reasons.push(`有实质技术信息: ${substantiveHits.slice(0, 3).join(', ')}`);
  }

  const reliability = sourceScore(article);
  score += reliability;
  if (reliability >= 15) reasons.push('信源可信度较高');

  const heat = heatScore(article);
  score += heat;
  if (heat >= 8) reasons.push('社区热度较高');

  const freshness = freshnessScore(article);
  score += freshness;
  if (freshness >= 10) reasons.push('时间新鲜');

  if (article.sourceType === 'aihot' || article.sourceType === 'hex2077') {
    score += 8;
    reasons.push('外部精选源已预筛');
  }

  if (article.sourceType === 'github') {
    score += 6;
    reasons.push('可直接查看或试用的开源项目');
  }

  if (!article.summary || article.summary.trim().length < 20) {
    score -= 12;
    risks.push('摘要信息不足');
  }

  const lowValueHits = containsAny(text, LOW_VALUE_KEYWORDS);
  if (lowValueHits.length > 0) {
    score -= Math.min(25, 8 + lowValueHits.length * 4);
    risks.push(`可能偏噪音: ${lowValueHits.slice(0, 3).join(', ')}`);
  }

  if (article.sourceType === 'linuxdo' || article.sourceType === 've2x') {
    score -= 6;
    risks.push('社区帖需人工判断上下文');
  }

  return {
    ...article,
    canonicalUrl: canonicalizeUrl(article.url),
    clusterId: buildClusterId(article),
    sourceReliability: sourceReliability(article),
    valueScore: Math.max(0, Math.min(100, Math.round(score))),
    valueReasons: reasons.length > 0 ? reasons : ['与 AI 技术主题相关'],
    riskFlags: risks
  };
}

export class CurationService {
  curate(options: CurateOptions): CurateResult {
    const rankedArticles = options.articles
      .map(article => scoreArticle(article, options.profile))
      .sort((a, b) => {
        if (b.valueScore !== a.valueScore) return b.valueScore - a.valueScore;
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      });

    const selectedArticles = rankedArticles
      .filter(article => article.valueScore >= options.minScore)
      .slice(0, options.maxHighlights);

    const fallbackSelection = selectedArticles.length > 0
      ? selectedArticles
      : rankedArticles.slice(0, options.maxHighlights);

    return {
      rankedArticles,
      selectedArticles: fallbackSelection,
      filteredLowValueCount: rankedArticles.filter(article => article.valueScore < options.minScore).length
    };
  }
}

export const curationService = new CurationService();
