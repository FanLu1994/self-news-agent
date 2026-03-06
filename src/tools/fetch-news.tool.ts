/**
 * 新闻获取工具
 * 
 * 教学要点 (@mariozechner/pi-ai):
 * 1. 使用 Type.Object 定义工具参数
 * 2. 使用 StringEnum 定义枚举参数（兼容所有 LLM）
 * 3. 实现 async execute() 方法
 * 4. 使用 onUpdate() 提供进度反馈
 * 5. 处理 signal 支持取消操作
 * 6. 返回结构化数据
 * 7. 错误处理和降级策略
 */

import { Type } from '@sinclair/typebox';
import { StringEnum } from '@mariozechner/pi-ai';
import type { Tool } from '@mariozechner/pi-ai';
import { githubTrendingService } from '../services/github-trending.service.js';
import { hackerNewsService } from '../services/hackernews.service.js';
import { rssService } from '../services/rss.service.js';
import { twitterService } from '../services/twitter.service.js';
import type { NewsArticle } from '../types/news.types.js';
import { matchesKeywords } from '../utils/article-utils.js';

/**
 * 新闻获取工具定义
 */
export const fetchNewsTool: Tool = {
  name: 'fetch_news',
  
  description: `从 HackerNews、中文科技媒体 RSS、X/Twitter（可选）和 GitHub Trending（可选）获取 AI 和技术新闻。
支持按类别、语言、时间范围和文章数量进行筛选。
返回包含标题、摘要、来源和 URL 的结构化新闻文章列表。`,

  // 教学要点：使用 Type.Object 定义参数，使用 StringEnum 定义枚举
  parameters: Type.Object({
    category: StringEnum(['ai', 'ml', 'nlp', 'cv', 'robotics', 'all'] as const, {
      description: '新闻类别：ai（通用AI）、ml（机器学习）、nlp（自然语言处理）、cv（计算机视觉）、robotics（机器人）或 all（全部）',
      default: 'all'
    }),
    
    language: StringEnum(['en', 'zh', 'all'] as const, {
      description: '语言筛选：en（来自 HackerNews 的英文）、zh（来自 RSS 源的中文）或 all（双语）',
      default: 'all'
    }),
    
    limit: Type.Number({
      description: '获取的最大文章数（1-50）',
      default: 15,
      minimum: 1,
      maximum: 50
    }),
    
    timeRange: StringEnum(['1d', '3d', '7d'] as const, {
      description: '时间范围：1d（过去一天）、3d（过去3天）、7d（过去一周）',
      default: '7d'
    }),

    keywords: Type.Array(Type.String({
      minLength: 1
    }), {
      description: '关键词列表，用于过滤新闻内容，例如 ["agent", "openai", "deep learning"]',
      default: []
    }),

    includeTwitter: Type.Boolean({
      description: '是否包含 Twitter/X 热点内容（需要配置 X_BEARER_TOKEN）',
      default: true
    }),

    includeGithubTrending: Type.Boolean({
      description: '是否包含 GitHub Trending 热门仓库',
      default: true
    })
  }),

  // 教学要点：实现 async execute 方法
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    console.log('\n🔧 fetch_news tool called with params:', params);

    // 教学要点：检查取消信号
    if (signal?.aborted) {
      throw new Error('Operation cancelled by user');
    }

    // 教学要点：使用 onUpdate 提供进度反馈
    onUpdate?.({
      content: [{ type: 'text', text: '🔍 初始化新闻源...' }],
      details: { progress: 5 }
    });

    try {
      const { category, language, limit, timeRange } = params;
      const keywords: string[] = Array.isArray(params.keywords) ? params.keywords : [];
      const includeTwitter = params.includeTwitter !== false;
      const includeGithubTrending = params.includeGithubTrending !== false;
      const perSourceLimit = 20;
      
      let hnArticles: NewsArticle[] = [];
      let rssArticles: NewsArticle[] = [];
      let twitterArticles: NewsArticle[] = [];
      let githubArticles: NewsArticle[] = [];

      // 根据语言选择数据源
      const shouldFetchHN = language === 'en' || language === 'all';
      const shouldFetchRSS = language === 'zh' || language === 'all';

      // 计算每个源应该获取的数量
      const hnLimitRaw = shouldFetchHN && shouldFetchRSS 
        ? Math.ceil(limit * 0.7)  // 70% 英文
        : limit;
      const rssLimitRaw = shouldFetchHN && shouldFetchRSS
        ? Math.ceil(limit * 0.3)  // 30% 中文
        : limit;
      const hnLimit = Math.min(hnLimitRaw, perSourceLimit);
      const rssLimit = Math.min(rssLimitRaw, perSourceLimit);

      // 并行获取数据
      const fetchPromises: Promise<void>[] = [];

      if (shouldFetchHN) {
        onUpdate?.({
          content: [{ type: 'text', text: '🔍 搜索 HackerNews...' }],
          details: { progress: 20 }
        });

        fetchPromises.push(
          hackerNewsService.fetchAINews({
            limit: hnLimit,
            timeRange
          }).then(articles => {
            hnArticles = articles;
            console.log(`  ✓ HackerNews: ${articles.length} articles`);
          }).catch(error => {
            console.error('  ❌ HackerNews error:', error);
            hnArticles = [];
          })
        );
      }

      if (shouldFetchRSS) {
        onUpdate?.({
          content: [{ type: 'text', text: '🔍 获取中文 RSS 源...' }],
          details: { progress: 40 }
        });

        fetchPromises.push(
          rssService.fetchNews({
            feeds: (process.env.RSS_FEEDS || '').split(',').map(v => v.trim()).filter(Boolean),
            limit: rssLimit,
            timeRange,
            keywords
          }).then(articles => {
            rssArticles = articles;
            console.log(`  ✓ RSS Feeds: ${articles.length} articles`);
          }).catch(error => {
            console.error('  ❌ RSS error:', error);
            rssArticles = [];
          })
        );
      }

      if (includeTwitter) {
        fetchPromises.push(
          twitterService.fetchHotTweets({
            bearerToken: process.env.X_BEARER_TOKEN,
            keywords,
            limit: Math.min(Math.ceil(limit * 0.5), perSourceLimit),
            timeRange
          }).then(articles => {
            twitterArticles = articles;
            console.log(`  ✓ Twitter/X: ${articles.length} posts`);
          }).catch(error => {
            console.error('  ❌ Twitter/X error:', error);
            twitterArticles = [];
          })
        );
      }

      if (includeGithubTrending) {
        fetchPromises.push(
          githubTrendingService.fetchTrending({
            languages: (process.env.GITHUB_TRENDING_LANGUAGES || '').split(',').map(v => v.trim()).filter(Boolean),
            limit: Math.min(Math.ceil(limit * 0.5), perSourceLimit),
            timeRange
          }).then(articles => {
            githubArticles = articles;
            console.log(`  ✓ GitHub Trending: ${articles.length} repos`);
          }).catch(error => {
            console.error('  ❌ GitHub Trending error:', error);
            githubArticles = [];
          })
        );
      }

      // 等待所有请求完成
      await Promise.all(fetchPromises);

      onUpdate?.({
        content: [{ type: 'text', text: '📊 合并和排序结果...' }],
        details: { progress: 70 }
      });

      // 合并结果
      let allArticles = [...hnArticles, ...rssArticles, ...twitterArticles, ...githubArticles];

      if (keywords.length > 0) {
        allArticles = allArticles.filter(article => matchesKeywords(article, keywords));
      }

      // 按发布时间排序（最新的在前）
      allArticles.sort((a, b) => 
        new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      );

      // 限制总数量
      allArticles = allArticles.slice(0, limit);

      onUpdate?.({
        content: [{ type: 'text', text: `✓ 找到 ${allArticles.length} 篇文章` }],
        details: { progress: 90 }
      });

      // 构建输出
      const output = {
        totalFound: allArticles.length,
        filters: {
          category,
          language,
          limit,
          timeRange
        },
        distribution: {
          english: hnArticles.length,
          chinese: rssArticles.length,
          twitter: twitterArticles.length,
          github: githubArticles.length
        },
        articles: allArticles.map(article => ({
          id: article.id,
          title: article.title,
          summary: article.summary,
          url: article.url,
          source: article.source,
          sourceType: article.sourceType,
          author: article.author,
          publishedAt: article.publishedAt,
          language: article.language,
          score: article.score,
          commentCount: article.commentCount,
          tags: article.tags || []
        }))
      };

      // 生成可读的输出文本
      let outputText = `# 新闻获取结果\n\n`;
      outputText += `**总计**：${allArticles.length} 篇文章\n`;
      outputText += `**分布**：${hnArticles.length} 篇英文，${rssArticles.length} 篇中文，${twitterArticles.length} 条推文，${githubArticles.length} 个仓库\n`;
      outputText += `**时间范围**：${timeRange}\n\n`;
      
      outputText += `## 文章列表\n\n`;
      allArticles.forEach((article, index) => {
        outputText += `${index + 1}. **${article.title}** (${article.language})\n`;
        outputText += `   - 来源：${article.source}\n`;
        outputText += `   - 发布时间：${new Date(article.publishedAt).toLocaleString('zh-CN')}\n`;
        if (article.score) {
          outputText += `   - 评分：${article.score} 分`;
          if (article.commentCount) {
            outputText += `，${article.commentCount} 条评论`;
          }
          outputText += `\n`;
        }
        outputText += `   - 链接：${article.url}\n`;
        outputText += `   - 摘要：${(article.summary || '').substring(0, 150)}...\n\n`;
      });

      outputText += `\n---\n\n`;
      outputText += `**原始 JSON 数据**（供 summarize_news 工具使用）：\n\`\`\`json\n${JSON.stringify(output, null, 2)}\n\`\`\``;

      // 教学要点：返回结构化数据
      return {
        content: [{
          type: 'text',
          text: outputText
        }],
        details: {
          articleCount: allArticles.length,
          category,
          language,
          timeRange,
          distribution: {
            english: hnArticles.length,
            chinese: rssArticles.length,
            twitter: twitterArticles.length,
            github: githubArticles.length
          },
          keywords,
          rawData: JSON.stringify(output)  // 供后续工具使用
        }
      };

    } catch (error) {
      console.error('❌ fetch_news 错误:', error);
      
      // 教学要点：错误处理
      throw new Error(
        `获取新闻失败：${error instanceof Error ? error.message : '未知错误'}`
      );
    }
  }
};
