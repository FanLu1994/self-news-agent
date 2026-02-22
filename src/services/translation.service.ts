/**
 * 翻译服务
 *
 * 使用 DeepSeek API 进行文本翻译
 */

import type { Context } from '@mariozechner/pi-ai';

interface TranslateOptions {
  text: string;
  from?: 'en' | 'zh' | 'auto';
  to: 'zh' | 'en';
}

interface TranslateResult {
  originalText: string;
  translatedText: string;
  from: string;
  to: string;
}

/**
 * 简单的语言检测
 */
function detectLanguage(text: string): 'en' | 'zh' | 'unknown' {
  // 检测中文字符（CJK 统一汉字）
  const cjkRegex = /[\u4e00-\u9fa5]/;
  const hasCJK = cjkRegex.test(text);

  // 检测英文单词
  const englishWordRegex = /\b[a-zA-Z]{3,}\b/g;
  const englishWords = text.match(englishWordRegex);
  const hasEnglish = englishWords && englishWords.length > 0;

  if (hasCJK && !hasEnglish) return 'zh';
  if (hasEnglish && !hasCJK) return 'en';
  if (hasCJK && hasEnglish) {
    // 如果同时包含中英文，判断哪个占主导
    const cjkCount = (text.match(cjkRegex) || []).length;
    const englishCharCount = text.replace(/[^a-zA-Z]/g, '').length;
    return cjkCount > englishCharCount ? 'zh' : 'en';
  }

  return 'unknown';
}

/**
 * 翻译服务类
 */
export class TranslationService {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.baseUrl = process.env.OPENAI_BASE_URL || 'https://api.deepseek.com';
  }

  /**
   * 检查是否需要翻译
   */
  private needsTranslation(text: string, targetLang: 'zh' | 'en'): boolean {
    const detected = detectLanguage(text);
    if (detected === 'unknown') return false;

    // 如果检测到的语言和目标语言不同，则需要翻译
    return (detected === 'en' && targetLang === 'zh') ||
           (detected === 'zh' && targetLang === 'en');
  }

  /**
   * 翻译单段文本
   */
  async translate(options: TranslateOptions): Promise<TranslateResult> {
    const { text, from = 'auto', to } = options;

    // 自动检测语言
    const detectedFrom = from === 'auto' ? detectLanguage(text) : from;

    // 如果不需要翻译，直接返回
    if (detectedFrom === 'unknown' || detectedFrom === to) {
      return {
        originalText: text,
        translatedText: text,
        from: detectedFrom,
        to
      };
    }

    try {
      const prompt = to === 'zh'
        ? `请将以下英文翻译成中文，保持技术术语的准确性，不要添加任何解释，只返回翻译结果：\n\n${text}`
        : `Please translate the following Chinese text to English, maintaining technical accuracy. Return only the translation without any explanation:\n\n${text}`;

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: to === 'zh' ? '你是一位专业的技术翻译专家。' : 'You are a professional technical translator.' },
            { role: 'user', content: prompt }
          ],
          stream: false,
          temperature: 0.3
        })
      });

      if (!response.ok) {
        throw new Error(`Translation API error: ${response.status}`);
      }

      const data = await response.json();
      const translatedText = data.choices[0]?.message?.content?.trim() || text;

      return {
        originalText: text,
        translatedText,
        from: detectedFrom,
        to
      };
    } catch (error) {
      console.error('Translation failed:', error);
      // 翻译失败时返回原文
      return {
        originalText: text,
        translatedText: text,
        from: detectedFrom,
        to
      };
    }
  }

  /**
   * 批量翻译（保持顺序）
   */
  async translateBatch(texts: string[], to: 'zh' | 'en'): Promise<string[]> {
    const results: string[] = [];

    for (const text of texts) {
      // 检查是否需要翻译
      if (this.needsTranslation(text, to)) {
        const result = await this.translate({ text, to });
        results.push(result.translatedText);
      } else {
        results.push(text);
      }

      // 避免请求过快
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return results;
  }

  /**
   * 翻译文章对象
   */
  async translateArticle<T extends { title: string; summary?: string }>(
    article: T,
    to: 'zh' | 'en' = 'zh'
  ): Promise<T> {
    const translatedTitle = await this.translate({ text: article.title, to });

    let translatedSummary = article.summary;
    if (article.summary) {
      const summaryResult = await this.translate({ text: article.summary, to });
      translatedSummary = summaryResult.translatedText;
    }

    return {
      ...article,
      title: translatedTitle.translatedText,
      summary: translatedSummary
    };
  }

  /**
   * 批量翻译文章
   */
  async translateArticles<T extends { title: string; summary?: string }>(
    articles: T[],
    to: 'zh' | 'en' = 'zh'
  ): Promise<T[]> {
    const results: T[] = [];

    for (const article of articles) {
      const translated = await this.translateArticle(article, to);
      results.push(translated);

      // 避免请求过快
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    return results;
  }
}

export const translationService = new TranslationService();
