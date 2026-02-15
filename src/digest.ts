import { loadConfig } from './config.js';
import { getConfiguredModel } from './model.js';
import { analysisService } from './services/analysis.service.js';
import { githubTrendingService } from './services/github-trending.service.js';
import { hackerNewsService } from './services/hackernews.service.js';
import { rssOutputService } from './services/rss-output.service.js';
import { rssService } from './services/rss.service.js';
import { telegramService } from './services/telegram.service.js';
import { twitterService } from './services/twitter.service.js';
import type { NewsArticle } from './types/news.types.js';

function matchesKeywords(article: NewsArticle, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const text = `${article.title} ${article.summary} ${(article.tags || []).join(' ')}`.toLowerCase();
  return keywords.some(keyword => text.includes(keyword.toLowerCase()));
}

function dedupArticles(articles: NewsArticle[]): NewsArticle[] {
  const seen = new Set<string>();
  const result: NewsArticle[] = [];
  for (const article of articles) {
    const key = `${article.title.toLowerCase().trim()}|${article.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(article);
  }
  return result;
}

export async function runDigestPipeline(): Promise<void> {
  const config = loadConfig();
  const llm = getConfiguredModel().config;
  console.log('开始执行新闻聚合流程...');
  console.log(`关键词: ${config.keywords.join(', ')}`);
  console.log(`模型: ${llm.provider}/${llm.model}`);

  const [hnArticles, rssArticles, twitterArticles, githubArticles] = await Promise.all([
    hackerNewsService.fetchAINews({
      limit: config.maxItemsPerSource,
      timeRange: config.timeRange
    }),
    rssService.fetchNews({
      feeds: config.rssFeeds,
      limit: config.maxItemsPerSource,
      timeRange: config.timeRange,
      keywords: config.keywords
    }),
    twitterService.fetchHotTweets({
      bearerToken: config.xBearerToken,
      keywords: config.xQueryKeywords,
      limit: config.maxItemsPerSource,
      timeRange: config.timeRange
    }),
    config.includeGithubTrending
      ? githubTrendingService.fetchTrending({
          languages: config.githubTrendingLanguages,
          timeRange: config.timeRange,
          limit: config.maxItemsPerSource
        })
      : Promise.resolve([])
  ]);

  let allArticles = [...hnArticles, ...rssArticles, ...twitterArticles, ...githubArticles];
  allArticles = allArticles.filter(article => matchesKeywords(article, config.keywords));
  allArticles = dedupArticles(allArticles);
  allArticles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  if (allArticles.length === 0) {
    console.warn('未获取到符合条件的新闻。');
    return;
  }

  const { analysis } = await analysisService.analyze({
    articles: allArticles,
    style: config.summaryStyle,
    queryKeywords: config.keywords
  });

  const previewArticles = allArticles.slice(0, 10);
  const rssXml = rssOutputService.buildXml({
    analysis,
    articles: previewArticles,
    channelTitle: `${analysis.title} (${new Date().toLocaleDateString('zh-CN')})`
  });
  await rssOutputService.writeToFile(config.outputRssPath, rssXml);

  const telegramText = [
    `【${analysis.title}】`,
    '',
    analysis.overview,
    '',
    '重点：',
    ...analysis.highlights.map((h, idx) => `${idx + 1}. ${h}`),
    '',
    `RSS 已生成：${config.outputRssPath}`
  ].join('\n');

  try {
    await telegramService.sendMessage({
      botToken: config.telegramBotToken,
      chatId: config.telegramChatId,
      text: telegramText
    });
  } catch (error) {
    console.error('Telegram push failed:', error);
  }

  console.log('\n聚合完成:');
  console.log(`- HackerNews: ${hnArticles.length}`);
  console.log(`- RSS: ${rssArticles.length}`);
  console.log(`- Twitter/X: ${twitterArticles.length}`);
  console.log(`- GitHub Trending: ${githubArticles.length}`);
  console.log(`- 合并后: ${allArticles.length}`);
  console.log(`- 输出 RSS: ${config.outputRssPath}`);
}
