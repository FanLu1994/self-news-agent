import type { Context } from '@mariozechner/pi-ai';
import { completeWithFallback } from '../model.js';
import type { NewsArticle, TopicCategory, TopicClassification, TopicStatsDay } from '../types/news.types.js';

const TOPICS: TopicCategory[] = [
  'AI',
  'Frontend',
  'Backend',
  'DevOps',
  'Data',
  'Security',
  'Cloud',
  'Mobile',
  'Startup',
  'OpenSource',
  'Other'
];

const TOPIC_KEYWORDS: Array<{ topic: TopicCategory; keywords: string[] }> = [
  { topic: 'AI', keywords: ['ai', 'llm', 'model', 'agent', 'machine learning', 'deep learning', 'prompt'] },
  { topic: 'Frontend', keywords: ['react', 'vue', 'frontend', 'css', 'ui', 'ux', 'next.js'] },
  { topic: 'Backend', keywords: ['backend', 'api', 'server', 'database', 'microservice', 'node.js'] },
  { topic: 'DevOps', keywords: ['devops', 'ci/cd', 'kubernetes', 'docker', 'infra', 'sre'] },
  { topic: 'Data', keywords: ['data', 'analytics', 'etl', 'warehouse', 'bi'] },
  { topic: 'Security', keywords: ['security', 'vulnerability', 'cve', 'auth', 'encryption'] },
  { topic: 'Cloud', keywords: ['cloud', 'aws', 'azure', 'gcp', 'serverless'] },
  { topic: 'Mobile', keywords: ['ios', 'android', 'mobile', 'react native', 'flutter'] },
  { topic: 'Startup', keywords: ['startup', 'funding', 'growth', 'saas', 'product'] },
  { topic: 'OpenSource', keywords: ['open source', 'github', 'repository', 'oss'] }
];

function emptyTopicCounts(): Record<TopicCategory, number> {
  return TOPICS.reduce((acc, topic) => {
    acc[topic] = 0;
    return acc;
  }, {} as Record<TopicCategory, number>);
}

function heuristicTopic(article: NewsArticle): TopicCategory {
  const text = `${article.title} ${article.summary} ${(article.tags || []).join(' ')}`.toLowerCase();
  for (const item of TOPIC_KEYWORDS) {
    if (item.keywords.some(keyword => text.includes(keyword.toLowerCase()))) {
      return item.topic;
    }
  }
  return 'Other';
}

function safeParse(raw: string): TopicClassification[] | null {
  const jsonMatch = raw.match(/\[[\s\S]*\]/);
  const target = jsonMatch ? jsonMatch[0] : raw;
  try {
    const parsed = JSON.parse(target);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter(item => item && typeof item.articleId === 'string' && typeof item.topic === 'string')
      .map(item => ({
        articleId: item.articleId,
        topic: TOPICS.includes(item.topic) ? item.topic : 'Other',
        confidence: typeof item.confidence === 'number' ? item.confidence : 0.6
      }));
  } catch {
    return null;
  }
}

export class TopicService {
  async classifyArticles(articles: NewsArticle[]): Promise<TopicClassification[]> {
    if (articles.length === 0) return [];

    const compact = articles.map(article => ({
      articleId: article.id,
      title: article.title,
      summary: article.summary,
      source: article.source
    }));

    const prompt = [
      '请将每条新闻分类到一个话题。',
      `可选话题: ${TOPICS.join(', ')}`,
      '输出 JSON 数组，不要输出额外解释。',
      '[{"articleId":"...", "topic":"AI", "confidence":0.0}]',
      `新闻数据: ${JSON.stringify(compact)}`
    ].join('\n');

    const context: Context = {
      systemPrompt: '你是技术媒体编辑，擅长新闻话题分类。',
      messages: [{ role: 'user', content: prompt, timestamp: Date.now() }]
    };

    try {
      const { response } = await completeWithFallback(context);
      const raw = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n');
      const parsed = safeParse(raw);
      if (parsed && parsed.length > 0) return parsed;
    } catch {
      // fallback below
    }

    return articles.map(article => ({
      articleId: article.id,
      topic: heuristicTopic(article),
      confidence: 0.55
    }));
  }

  summarizeByDay(date: string, articles: NewsArticle[], classifications: TopicClassification[]): TopicStatsDay {
    const topicMap = new Map<string, TopicCategory>();
    for (const item of classifications) {
      topicMap.set(item.articleId, item.topic);
    }

    const byTopic = emptyTopicCounts();
    for (const article of articles) {
      const topic = topicMap.get(article.id) || heuristicTopic(article);
      byTopic[topic] += 1;
    }

    return {
      date,
      total: articles.length,
      byTopic
    };
  }
}

export const topicService = new TopicService();
