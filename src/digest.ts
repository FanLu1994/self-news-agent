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
import { toReadableText } from './text-format.js';
import { topicService } from './services/topic.service.js';
import { topicStatsService } from './services/topic-stats.service.js';
import { twitterService } from './services/twitter.service.js';
import { dedupArticles, matchesKeywords } from './utils/article-utils.js';
import type { NewsArticle } from './types/news.types.js';
import type { ParsedConfig } from './config.js';
import type { SourceType } from './types/news.types.js';

function toDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function buildRssFeedConfig(
  feeds: string[],
  name: string,
  sourceType: SourceType,
  language: 'zh' | 'en'
): CustomRssFeedConfig[] {
  return feeds.map(url => ({
    name,
    source: name,
    sourceType,
    url,
    language,
    category: 'all' as const
  }));
}

function fetchRssIfEnabled(
  enabled: boolean,
  feeds: string[],
  name: string,
  sourceType: SourceType,
  language: 'zh' | 'en',
  keywords: string[],
  config: Pick<ParsedConfig, 'maxItemsPerSource' | 'timeRange'>
): Promise<NewsArticle[]> {
  if (!enabled || feeds.length === 0) return Promise.resolve([]);
  return rssService.fetchNewsFromConfigs({
    feeds: buildRssFeedConfig(feeds, name, sourceType, language),
    limit: config.maxItemsPerSource,
    timeRange: config.timeRange,
    keywords
  });
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
    fetchRssIfEnabled(config.includeVe2x, config.ve2xFeeds, 'Ve2x', 've2x', 'zh', [], config),
    fetchRssIfEnabled(config.includeLinuxDo, config.linuxDoFeeds, 'Linux.do', 'linuxdo', 'zh', [], config),
    fetchRssIfEnabled(config.includeReddit, config.redditFeeds, 'Reddit', 'reddit', 'en', config.keywords, config),
    fetchRssIfEnabled(config.includeProductHunt, config.productHuntFeeds, 'Product Hunt', 'producthunt', 'en', [], config)
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

  const generatedAt = new Date(analysis.generatedAt || Date.now());
  const timeSegment = generatedAt.toISOString().slice(11, 19).replace(/:/g, '-');
  const msSegment = String(generatedAt.getMilliseconds()).padStart(3, '0');
  const dailyFileName = `${dailyDate}-${timeSegment}-${msSegment}.md`;
  const dailyDocPath = join(config.outputDailyDir, dailyFileName);
  const githubDocsBase = 'https://github.com/FanLu1994/self-news-agent/tree/main/docs/daily';
  const docUrl = `${githubDocsBase}/${dailyFileName}`;

  const previewArticles = allArticles.slice(0, 10);
  const rssXml = rssOutputService.buildXml({
    analysis,
    articles: previewArticles,
    channelTitle: `${analysis.title} (${new Date().toLocaleDateString('zh-CN')})`
  });
  await rssOutputService.writeToFile(config.outputRssPath, rssXml);
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

  // 助理风格的推送消息
  const telegramText = [
    `🤖 ${toReadableText(analysis.title)}`,
    '',
    toReadableText(analysis.overview),
    '',
    '⭐ 值得关注:',
    ...analysis.highlights.slice(0, 6).map((h, idx) => `${idx + 1}. ${toReadableText(h).split('\n')[0]}`),
    '',
    `📄 完整报告: ${docUrl}`
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
      subject: `🤖 每日精选 - ${dailyDate}`,
      text: [
        `${toReadableText(analysis.title)}`,
        '',
        toReadableText(analysis.overview),
        '',
        '⭐ 值得关注:',
        ...analysis.highlights.slice(0, 8).map((item, idx) => `${idx + 1}. ${toReadableText(item)}`),
        '',
        `📄 完整报告: ${docUrl}`
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
