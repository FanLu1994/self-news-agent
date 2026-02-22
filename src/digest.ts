import { join } from 'node:path';
import { loadConfig } from './config.js';
import { getConfiguredModel } from './model.js';
import { analysisService } from './services/analysis.service.js';
import { emailService } from './services/email.service.js';
import { githubTrendingService } from './services/github-trending.service.js';
import { hackerNewsService } from './services/hackernews.service.js';
import { markdownOutputService } from './services/markdown-output.service.js';
import { readmeService } from './services/readme.service.js';
import { rssOutputService } from './services/rss-output.service.js';
import { rssService } from './services/rss.service.js';
import { telegramService } from './services/telegram.service.js';
import { topicService } from './services/topic.service.js';
import { topicStatsService } from './services/topic-stats.service.js';
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
    const normalizedTitle = article.title.toLowerCase().replace(/[^\w\s\u4e00-\u9fa5]/g, '').trim();
    const normalizedUrl = article.url.split('?')[0].trim().toLowerCase();
    const key = `${normalizedTitle}|${normalizedUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(article);
  }
  return result;
}

function toDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export async function runDigestPipeline(): Promise<void> {
  const config = loadConfig();
  const llm = getConfiguredModel();
  console.log('开始执行新闻聚合流程...');
  console.log(`关键词: ${config.keywords.join(', ')}`);
  console.log(`模型: ${llm.provider}/${llm.model}`);

  const [hnArticles, rssArticles, twitterArticles, githubArticles, ve2xArticles, linuxDoArticles, redditArticles, productHuntArticles] = await Promise.all([
    hackerNewsService.fetchAINews({
      limit: config.maxItemsPerSource,
      timeRange: config.timeRange,
      translate: true  // 自动翻译 HN 文章
    }),
    rssService.fetchNews({
      feeds: config.rssFeeds,
      limit: config.maxItemsPerSource,
      timeRange: config.timeRange,
      keywords: config.keywords
    }),
    config.includeTwitter ? twitterService.fetchHotTweets({
      bearerToken: config.xBearerToken,
      keywords: config.xQueryKeywords,
      limit: config.maxItemsPerSource,
      timeRange: config.timeRange
    }) : Promise.resolve([]),
    config.includeGithubTrending
      ? githubTrendingService.fetchTrending({
          languages: config.githubTrendingLanguages,
          timeRange: config.timeRange,
          limit: config.maxItemsPerSource
        })
      : Promise.resolve([]),
    config.includeVe2x
      ? rssService.fetchNewsFromConfigs({
          feeds: config.ve2xFeeds.map(feed => ({
            name: 'Ve2x',
            source: 'Ve2x',
            sourceType: 've2x' as const,
            url: feed,
            language: 'zh',
            category: 'all'
          })),
          limit: config.maxItemsPerSource,
          timeRange: config.timeRange,
          keywords: []
        })
      : Promise.resolve([]),
    config.includeLinuxDo
      ? rssService.fetchNewsFromConfigs({
          feeds: config.linuxDoFeeds.map(feed => ({
            name: 'Linux.do',
            source: 'Linux.do',
            sourceType: 'linuxdo' as const,
            url: feed,
            language: 'zh',
            category: 'all'
          })),
          limit: config.maxItemsPerSource,
          timeRange: config.timeRange,
          keywords: []
        })
      : Promise.resolve([]),
    config.includeReddit
      ? rssService.fetchNewsFromConfigs({
          feeds: config.redditFeeds.map(feed => ({
            name: 'Reddit',
            source: 'Reddit',
            sourceType: 'reddit' as const,
            url: feed,
            language: 'en',
            category: 'all'
          })),
          limit: config.maxItemsPerSource,
          timeRange: config.timeRange,
          keywords: config.keywords
        })
      : Promise.resolve([]),
    config.includeProductHunt
      ? rssService.fetchNewsFromConfigs({
          feeds: config.productHuntFeeds.map(feed => ({
            name: 'Product Hunt',
            source: 'Product Hunt',
            sourceType: 'producthunt' as const,
            url: feed,
            language: 'en',
            category: 'all'
          })),
          limit: config.maxItemsPerSource,
          timeRange: config.timeRange,
          keywords: []
        })
      : Promise.resolve([])
  ]);

  let allArticles = [
    ...hnArticles,
    ...rssArticles,
    ...twitterArticles,
    ...githubArticles,
    ...ve2xArticles,
    ...linuxDoArticles,
    ...redditArticles,
    ...productHuntArticles
  ];
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
  const dailyDate = toDateString(new Date());
  const classifications = await topicService.classifyArticles(allArticles);
  const todayTopicStats = topicService.summarizeByDay(dailyDate, allArticles, classifications);
  const topicHistory = await topicStatsService.upsertDay(config.topicStatsPath, todayTopicStats);
  const trend = topicStatsService.buildTrendSummary(topicHistory);

  const previewArticles = allArticles.slice(0, 10);
  const rssXml = rssOutputService.buildXml({
    analysis,
    articles: previewArticles,
    channelTitle: `${analysis.title} (${new Date().toLocaleDateString('zh-CN')})`
  });
  await rssOutputService.writeToFile(config.outputRssPath, rssXml);
  const dailyDocPath = join(config.outputDailyDir, `${dailyDate}.md`);
  await markdownOutputService.writeDailyMarkdown({
    path: dailyDocPath,
    date: dailyDate,
    analysis,
    articles: allArticles,
    topicStats: todayTopicStats
  });

  if (config.updateReadme) {
    await readmeService.updateReadme({
      readmePath: config.readmePath,
      date: dailyDate,
      analysis,
      articles: allArticles,
      topicStats: todayTopicStats
    });
  }

  const telegramText = [
    `【${analysis.title}】`,
    '',
    analysis.overview,
    '',
    '重点：',
    ...analysis.highlights.map((h, idx) => `${idx + 1}. ${h}`),
    '',
    `Markdown 已生成：${dailyDocPath}`,
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

  try {
    await emailService.sendDigestEmail({
      enabled: config.emailEnabled,
      provider: config.emailProvider,
      apiKey: config.resendApiKey,
      from: config.emailFrom,
      to: config.emailTo,
      subject: `Self News Digest - ${dailyDate}`,
      text: [
        `标题: ${analysis.title}`,
        '',
        analysis.overview,
        '',
        '重点:',
        ...analysis.highlights.map((item, idx) => `${idx + 1}. ${item}`),
        '',
        `完整文档: ${dailyDocPath}`
      ].join('\n')
    });
  } catch (error) {
    console.error('Email push failed:', error);
  }

  console.log('\n聚合完成:');
  console.log(`- HackerNews: ${hnArticles.length}`);
  console.log(`- RSS: ${rssArticles.length}`);
  console.log(`- Ve2x: ${ve2xArticles.length}`);
  console.log(`- Linux.do: ${linuxDoArticles.length}`);
  console.log(`- Reddit: ${redditArticles.length}`);
  console.log(`- Product Hunt: ${productHuntArticles.length}`);
  console.log(`- Twitter/X: ${twitterArticles.length}`);
  console.log(`- GitHub Trending: ${githubArticles.length}`);
  console.log(`- 合并后: ${allArticles.length}`);
  console.log(`- 输出 Markdown: ${dailyDocPath}`);
  console.log(`- 话题统计: ${config.topicStatsPath}`);
  console.log(`- 输出 RSS: ${config.outputRssPath}`);
}
