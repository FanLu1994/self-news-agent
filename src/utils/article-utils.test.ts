import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeUrl, dedupArticles, dedupWithHistory, titleSimilarity } from './article-utils.js';
import type { NewsArticle } from '../types/news.types.js';

function article(overrides: Partial<NewsArticle>): NewsArticle {
  return {
    id: overrides.id || 'id',
    title: overrides.title || 'Show HN: Tiny vLLM',
    summary: overrides.summary || 'A small LLM inference engine.',
    url: overrides.url || 'https://example.com/a',
    source: overrides.source || 'HackerNews',
    sourceType: overrides.sourceType || 'hn',
    publishedAt: overrides.publishedAt || '2026-05-30T00:00:00.000Z',
    category: overrides.category || 'ai',
    language: overrides.language || 'en',
    score: overrides.score,
    commentCount: overrides.commentCount,
    tags: overrides.tags
  };
}

test('canonicalizeUrl removes tracking params and fragments', () => {
  assert.equal(
    canonicalizeUrl('https://www.example.com/post/?utm_source=x&ref=y#section'),
    'https://example.com/post'
  );
});

test('dedupArticles keeps one item for same canonical URL', () => {
  const items = dedupArticles([
    article({ id: 'a', url: 'https://example.com/post?utm_source=x', score: 10 }),
    article({ id: 'b', url: 'https://example.com/post', score: 20 })
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0]?.id, 'b');
});

test('dedupArticles removes same-source similar translated titles', () => {
  const items = dedupArticles([
    article({ id: 'a', title: 'Show HN: Tiny-vLLM high performance inference engine', url: 'https://a.example.com/1' }),
    article({ id: 'b', title: 'Tiny vLLM high performance inference engine', url: 'https://a.example.com/2' })
  ]);

  assert.equal(items.length, 1);
  assert.ok(titleSimilarity('Show HN: Tiny-vLLM high performance inference engine', 'Tiny vLLM high performance inference engine') > 0.8);
});

test('dedupWithHistory removes historical URL duplicates', () => {
  const result = dedupWithHistory(
    [article({ id: 'new', url: 'https://example.com/post?utm_medium=x' })],
    [{ title: 'Old title', url: 'https://example.com/post', source: 'old', date: '2026-05-29' }]
  );

  assert.equal(result.articles.length, 0);
  assert.equal(result.filteredCount, 1);
});
