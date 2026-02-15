import type { Context } from '@mariozechner/pi-ai';
import { completeWithFallback } from '../model.js';
import type { DigestAnalysis, NewsArticle, SummaryStyle } from '../types/news.types.js';

interface AnalyzeOptions {
  articles: NewsArticle[];
  style: SummaryStyle;
  queryKeywords: string[];
}

interface AnalyzeResult {
  analysis: DigestAnalysis;
  rawText: string;
}

export class AnalysisService {
  async analyze(options: AnalyzeOptions): Promise<AnalyzeResult> {
    const compactArticles = options.articles.map(a => ({
      title: a.title,
      summary: a.summary,
      source: a.source,
      sourceType: a.sourceType,
      url: a.url,
      publishedAt: a.publishedAt
    }));

    const prompt = [
      `请分析以下新闻数据，风格=${options.style}。`,
      `重点关键词：${options.queryKeywords.join(', ')}`,
      '输出 JSON，不要输出额外说明。',
      '{',
      '  "title": "本次新闻摘要标题（不超过30字）",',
      '  "overview": "100-200字概览",',
      '  "highlights": ["要点1", "要点2", "要点3"],',
      '  "keywords": ["关键词1", "关键词2", "关键词3"]',
      '}',
      `新闻数据: ${JSON.stringify(compactArticles)}`
    ].join('\n');

    const context: Context = {
      systemPrompt: '你是新闻编辑与产业分析师，擅长从多源资讯中抽取事实并总结趋势。',
      messages: [
        {
          role: 'user',
          content: prompt,
          timestamp: Date.now()
        }
      ]
    };

    const { response } = await completeWithFallback(context);
    const rawText = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')
      .trim();

    const parsed = safeParseAnalysis(rawText);
    const analysis: DigestAnalysis = {
      title: parsed.title || 'AI 新闻摘要',
      overview: parsed.overview || rawText,
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights.slice(0, 8) : [],
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 20) : options.queryKeywords,
      generatedAt: new Date().toISOString()
    };

    return { analysis, rawText };
  }
}

function safeParseAnalysis(rawText: string): Partial<DigestAnalysis> {
  try {
    return JSON.parse(rawText) as Partial<DigestAnalysis>;
  } catch {
    const jsonBlockMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonBlockMatch) {
      try {
        return JSON.parse(jsonBlockMatch[0]) as Partial<DigestAnalysis>;
      } catch {
        return {};
      }
    }
    return {};
  }
}

export const analysisService = new AnalysisService();
