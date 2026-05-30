import test from 'node:test';
import assert from 'node:assert/strict';
import { curationService } from './curation.service.js';
import type { NewsArticle } from '../types/news.types.js';

function article(overrides: Partial<NewsArticle>): NewsArticle {
  return {
    id: overrides.id || 'id',
    title: overrides.title || 'Article',
    summary: overrides.summary || 'Summary',
    url: overrides.url || `https://example.com/${overrides.id || 'id'}`,
    source: overrides.source || 'RSS',
    sourceType: overrides.sourceType || 'rss',
    publishedAt: overrides.publishedAt || new Date().toISOString(),
    category: overrides.category || 'ai',
    language: overrides.language || 'zh',
    score: overrides.score,
    commentCount: overrides.commentCount,
    tags: overrides.tags
  };
}

test('curation ranks AI coding and agent content over generic posts', () => {
  const result = curationService.curate({
    profile: 'ai-developer',
    maxHighlights: 2,
    minScore: 1,
    articles: [
      article({
        id: 'agent',
        title: 'Open source coding agent adds MCP tool use',
        summary: 'A new GitHub project improves Claude Code workflows with agent tools and benchmarks.',
        sourceType: 'github',
        score: 500
      }),
      article({
        id: 'generic',
        title: 'Mac window switching tips',
        summary: 'A community discussion about window management.',
        sourceType: 'linuxdo'
      }),
      article({
        id: 'marketing',
        title: 'Free AI webinar giveaway',
        summary: 'Register for a free webinar and discount.',
        sourceType: 'producthunt'
      })
    ]
  });

  assert.equal(result.selectedArticles[0]?.id, 'agent');
  assert.ok(result.selectedArticles[0]?.valueScore > (result.rankedArticles.find(item => item.id === 'generic')?.valueScore || 0));
});

test('curation includes external selected source reasons', () => {
  const result = curationService.curate({
    profile: 'ai-developer',
    maxHighlights: 1,
    minScore: 1,
    articles: [
      article({
        id: 'aihot',
        title: 'Codex Windows computer use is available',
        summary: 'Codex can now take action on Windows computers.',
        sourceType: 'aihot',
        source: 'AI HOT / OpenAI'
      })
    ]
  });

  assert.equal(result.selectedArticles.length, 1);
  assert.ok(result.selectedArticles[0]?.valueReasons.some(reason => reason.includes('外部精选源')));
});
