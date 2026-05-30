import { join } from 'node:path';
import { loadConfig } from './config.js';
import { getConfiguredModel } from './model.js';
import { analysisService } from './services/analysis.service.js';
import { curationService } from './services/curation.service.js';
import { emailService } from './services/email.service.js';
import { externalCuratedSourceService } from './services/external-curated-source.service.js';
import { githubTrendingService } from './services/github-trending.service.js';
import { hackerNewsService } from './services/hackernews.service.js';
import { historyService } from './services/history.service.js';
import { markdownOutputService } from './services/markdown-output.service.js';
import { productHuntService } from './services/product-hunt.service.js';
import { readmeService } from './services/readme.service.js';
import { rssOutputService } from './services/rss-output.service.js';
import { rssService } from './services/rss.service.js';
import { telegramService } from './services/telegram.service.js';
import { stripLeadingListMarker, toReadableText } from './text-format.js';
import { topicService } from './services/topic.service.js';
import { topicStatsService } from './services/topic-stats.service.js';
import { twitterService } from './services/twitter.service.js';
import { dedupArticles, dedupWithHistory, matchesKeywords } from './utils/article-utils.js';
import type { NewsArticle } from './types/news.types.js';
import type { ParsedConfig } from './config.js';
import type { SourceType } from './types/news.types.js';
import type { CustomRssFeedConfig } from './services/rss.service.js';

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
  const perSourceLimit = Math.min(config.maxItemsPerSource, 20);
  const llm = getConfiguredModel();
  console.log('开始执行新闻聚合流程...');
  console.log(`关键词: ${config.keywords.join(', ')}`);
  console.log(`模型: ${llm.provider}/${llm.model}`);
  console.log(`每个来源最多抓取: ${perSourceLimit} 篇`);

  // 获取 Product Hunt 产品（使用专门的服务）
  let productHuntProducts: Awaited<ReturnType<typeof productHuntService.fetchTopProducts>> = [];
  let translatedProductHuntProducts: Awaited<ReturnType<typeof productHuntService.fetchTopProducts>> = [];
  let productHuntArticles: NewsArticle[] = [];

  if (config.includeProductHunt && config.productHuntFeeds.length > 0) {
    productHuntProducts = await productHuntService.fetchTopProducts({
      feedUrl: config.productHuntFeeds[0],
      limit: perSourceLimit,
      timeRange: config.timeRange
    });
    if (productHuntProducts.length > 0) {
      console.log(`  🌐 正在翻译 ${productHuntProducts.length} 篇 Product Hunt 产品...`);
      translatedProductHuntProducts = await productHuntService.translateProducts(productHuntProducts, 'zh');
      console.log(`  ✅ Product Hunt 翻译完成`);
      productHuntArticles = productHuntService.toArticles(translatedProductHuntProducts, 'zh');
    }
  }

  const [
    hnArticles,
    rssArticles,
    twitterArticles,
    githubArticles,
    ve2xArticles,
    linuxDoArticles,
    redditArticles,
    aiHotArticles,
    hex2077Articles
  ] = await Promise.all([
    hackerNewsService.fetchAINews({
      limit: perSourceLimit,
      timeRange: config.timeRange,
      translate: true  // 自动翻译 HN 文章
    }),
    config.includeRss ? rssService.fetchNews({
      feeds: config.rssFeeds,
      limit: perSourceLimit,
      timeRange: config.timeRange,
      keywords: config.keywords
    }) : Promise.resolve([]),
    config.includeTwitter ? twitterService.fetchHotTweets({
      bearerToken: config.xBearerToken,
      keywords: config.xQueryKeywords,
      limit: perSourceLimit,
      timeRange: config.timeRange
    }) : Promise.resolve([]),
    config.includeGithubTrending
      ? githubTrendingService.fetchTrending({
          token: config.githubToken,
          languages: config.githubTrendingLanguages,
          timeRange: config.timeRange,
          limit: perSourceLimit
        })
      : Promise.resolve([]),
    fetchRssIfEnabled(config.includeVe2x, config.ve2xFeeds, 'Ve2x', 've2x', 'zh', [], config),
    fetchRssIfEnabled(config.includeLinuxDo, config.linuxDoFeeds, 'Linux.do', 'linuxdo', 'zh', [], config),
    fetchRssIfEnabled(config.includeReddit, config.redditFeeds, 'Reddit', 'reddit', 'en', config.keywords, config),
    externalCuratedSourceService.fetchAiHot({
      enabled: config.includeAiHot,
      baseUrl: config.aiHotBaseUrl,
      take: config.aiHotTake,
      timeRange: config.timeRange
    }),
    externalCuratedSourceService.fetchHex2077({
      enabled: config.includeHex2077,
      feeds: config.hex2077Feeds,
      limit: perSourceLimit,
      timeRange: config.timeRange
    })
  ]);

  const fetchedArticles = [
    ...hnArticles,
    ...rssArticles,
    ...twitterArticles,
    ...githubArticles,
    ...ve2xArticles,
    ...linuxDoArticles,
    ...redditArticles,
    ...aiHotArticles,
    ...hex2077Articles,
    ...productHuntArticles
  ];

  let allArticles = fetchedArticles.filter(article =>
    article.sourceType === 'aihot' ||
    article.sourceType === 'hex2077' ||
    matchesKeywords(article, config.keywords)
  );
  const beforeDedupCount = allArticles.length;
  allArticles = dedupArticles(allArticles);
  const afterDedupCount = allArticles.length;

  const historicalArticles = await historyService.getHistoricalArticles(
    config.outputDailyDir,
    config.historyDays
  );
  const historyDedup = dedupWithHistory(allArticles, historicalArticles);
  allArticles = historyDedup.articles;
  allArticles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  if (allArticles.length === 0) {
    console.warn('未获取到符合条件的新闻。');
    return;
  }

  const curation = curationService.curate({
    articles: allArticles,
    profile: config.curationProfile,
    maxHighlights: config.maxHighlights,
    minScore: config.minScore
  });
  const selectedArticles = curation.selectedArticles;
  console.log(`  🧹 当前批次去重: ${beforeDedupCount} -> ${afterDedupCount}`);
  console.log(`  📜 历史去重过滤: ${historyDedup.filteredCount} 篇 / 历史 ${historyDedup.historicalCount} 篇`);
  console.log(`  ⭐ 精选候选: ${selectedArticles.length} 篇，低价值过滤: ${curation.filteredLowValueCount} 篇`);

  const { analysis } = await analysisService.analyze({
    articles: selectedArticles,
    style: config.summaryStyle,
    queryKeywords: config.keywords
  });
  const dailyDate = toDateString(new Date());
  const classifications = await topicService.classifyArticles(curation.rankedArticles);
  const todayTopicStats = topicService.summarizeByDay(dailyDate, curation.rankedArticles, classifications);
  const topicHistory = await topicStatsService.upsertDay(config.topicStatsPath, todayTopicStats);
  topicStatsService.buildTrendSummary(topicHistory);

  const generatedAt = new Date(analysis.generatedAt || Date.now());
  const timeSegment = generatedAt.toISOString().slice(11, 19).replace(/:/g, '-');
  const msSegment = String(generatedAt.getMilliseconds()).padStart(3, '0');
  const dailyFileName = `${dailyDate}-${timeSegment}-${msSegment}.md`;
  const dailyDocPath = join(config.outputDailyDir, dailyFileName);
  const githubDocsBase = 'https://github.com/FanLu1994/self-news-agent/tree/main/docs/daily';
  const docUrl = `${githubDocsBase}/${dailyFileName}`;

  const previewArticles = selectedArticles.slice(0, 10);
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
    articles: curation.rankedArticles,
    topicStats: todayTopicStats
  });

  if (config.updateReadme) {
    await readmeService.updateReadme({
      readmePath: config.readmePath,
      date: dailyDate,
      analysis,
      articles: curation.rankedArticles,
      topicStats: todayTopicStats
    });
  }

  // 构建完整的报告内容（用于 Telegram 和 Email）
  const fullReport = [
    `🤖 ${toReadableText(analysis.title)} - ${dailyDate}`,
    '',
    toReadableText(analysis.overview),
    '',
    '⭐ 今日精选:',
    ''
  ];

  // 添加每一条值得关注的新闻
  for (const [idx, h] of analysis.highlights.entries()) {
    fullReport.push(`${idx + 1}. ${toReadableText(stripLeadingListMarker(h))}`);
    fullReport.push('');  // 每一条新闻后加一个空行
  }

  // 添加洞察与深度（如果有）
  if (analysis.sourceHighlights) {
    fullReport.push(
      '',
      '💡 洞察与深度:',
      '',
      toReadableText(analysis.sourceHighlights)
    );
  }

  // 添加 Product Hunt 热门产品（如果有）
  if (translatedProductHuntProducts.length > 0) {
    const phText = productHuntService.generateRecommendationText(translatedProductHuntProducts);
    if (phText) {
      fullReport.push(
        '',
        '---',
        '',
        '🚀 Product Hunt 热门产品:',
        '',
        phText
      );
    }
  }

  // 添加话题统计
  const topicSummary = Object.entries(todayTopicStats.byTopic)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([topic, count]) => `- ${topic}: ${count}`)
    .join('\n');

  fullReport.push(
    '',
    '---',
    '',
    '📊 话题分布:',
    '',
    topicSummary,
    '',
    '---',
    '',
    `📄 完整报告: ${docUrl}`
  );

  const telegramText = fullReport.join('\n');

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
      text: fullReport.join('\n')
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
  console.log(`- AI HOT: ${aiHotArticles.length}`);
  console.log(`- HEX2077: ${hex2077Articles.length}`);
  console.log(`- Twitter/X: ${twitterArticles.length}`);
  console.log(`- GitHub Trending: ${githubArticles.length}`);
  console.log(`- 最终归档: ${curation.rankedArticles.length} 篇（已去重）`);
  console.log(`- 今日精选: ${selectedArticles.length} 篇`);
  console.log(`- 输出 Markdown: ${dailyDocPath}`);
  console.log(`- 话题统计: ${config.topicStatsPath}`);
  console.log(`- 输出 RSS: ${config.outputRssPath}`);
}
