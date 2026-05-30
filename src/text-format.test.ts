import test from 'node:test';
import assert from 'node:assert/strict';
import { stripLeadingListMarker } from './text-format.js';

test('stripLeadingListMarker removes repeated ordered list prefixes', () => {
  assert.equal(
    stripLeadingListMarker('1. 1. ADHD — 让 Coding Agent 学会多线程思考'),
    'ADHD — 让 Coding Agent 学会多线程思考'
  );
});

test('stripLeadingListMarker removes malformed markdown bullet prefix', () => {
  assert.equal(
    stripLeadingListMarker('*1. ADHD — 让 Coding Agent 学会多线程思考**'),
    'ADHD — 让 Coding Agent 学会多线程思考**'
  );
});

test('stripLeadingListMarker preserves balanced bold markers after numbering', () => {
  assert.equal(
    stripLeadingListMarker('1. **ADHD — 让 Coding Agent 学会多线程思考**'),
    '**ADHD — 让 Coding Agent 学会多线程思考**'
  );
});
