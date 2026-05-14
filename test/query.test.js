import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getQuery } from '../lib/query.js';

test('getQuery: extracts multiple params', () => {
  assert.deepEqual(getQuery({ url: '/api/prayer?country=af&city=kabul' }), {
    country: 'af',
    city: 'kabul',
  });
});

test('getQuery: extracts single param', () => {
  assert.deepEqual(getQuery({ url: '/api/prayer?country=af' }), { country: 'af' });
});

test('getQuery: returns empty object when no params', () => {
  assert.deepEqual(getQuery({ url: '/api/prayer' }), {});
});

test('getQuery: returns empty object for bare path', () => {
  assert.deepEqual(getQuery({ url: '/' }), {});
});

test('getQuery: returns empty object when url is undefined', () => {
  assert.deepEqual(getQuery({ url: undefined }), {});
});

test('getQuery: handles date param with hyphens', () => {
  assert.deepEqual(getQuery({ url: '/api/prayer?date=2026-05-04' }), { date: '2026-05-04' });
});

test('getQuery: handles month param', () => {
  assert.deepEqual(getQuery({ url: '/api/monthly?country=af&city=kabul&month=2026-05' }), {
    country: 'af',
    city: 'kabul',
    month: '2026-05',
  });
});

test('getQuery: preserves case of values', () => {
  assert.deepEqual(getQuery({ url: '/api/prayer?country=AF&city=Kabul' }), {
    country: 'AF',
    city: 'Kabul',
  });
});

test('getQuery: last value wins for duplicate keys', () => {
  const result = getQuery({ url: '/api/prayer?country=af&country=tr' });
  assert.equal(result.country, 'tr');
});

test('getQuery: handles empty string url', () => {
  assert.deepEqual(getQuery({ url: '' }), {});
});
