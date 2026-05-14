import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeYearMonth, normalizeYmd } from '../lib/dateParams.js';

// normalizeYearMonth
test('normalizeYearMonth: pads single-digit month', () => {
  assert.equal(normalizeYearMonth('2026-5'), '2026-05');
});

test('normalizeYearMonth: leaves already-padded month unchanged', () => {
  assert.equal(normalizeYearMonth('2026-05'), '2026-05');
});

test('normalizeYearMonth: handles December', () => {
  assert.equal(normalizeYearMonth('2026-12'), '2026-12');
});

test('normalizeYearMonth: trims surrounding whitespace', () => {
  assert.equal(normalizeYearMonth('  2026-5  '), '2026-05');
});

test('normalizeYearMonth: returns empty string for empty input', () => {
  assert.equal(normalizeYearMonth(''), '');
});

test('normalizeYearMonth: returns empty string for null', () => {
  assert.equal(normalizeYearMonth(null), '');
});

test('normalizeYearMonth: returns empty string for undefined', () => {
  assert.equal(normalizeYearMonth(undefined), '');
});

test('normalizeYearMonth: returns empty string for non-string', () => {
  assert.equal(normalizeYearMonth(2026), '');
});

test('normalizeYearMonth: does not match full date string', () => {
  assert.equal(normalizeYearMonth('2026-05-04'), '2026-05-04');
});

test('normalizeYearMonth: returns garbage as-is', () => {
  assert.equal(normalizeYearMonth('not-a-date'), 'not-a-date');
});

// normalizeYmd
test('normalizeYmd: pads single-digit month and day', () => {
  assert.equal(normalizeYmd('2026-5-4'), '2026-05-04');
});

test('normalizeYmd: leaves already-padded date unchanged', () => {
  assert.equal(normalizeYmd('2026-05-04'), '2026-05-04');
});

test('normalizeYmd: pads January 1st', () => {
  assert.equal(normalizeYmd('2026-1-1'), '2026-01-01');
});

test('normalizeYmd: trims surrounding whitespace', () => {
  assert.equal(normalizeYmd('  2026-5-4  '), '2026-05-04');
});

test('normalizeYmd: returns empty string for empty input', () => {
  assert.equal(normalizeYmd(''), '');
});

test('normalizeYmd: returns empty string for null', () => {
  assert.equal(normalizeYmd(null), '');
});

test('normalizeYmd: returns empty string for undefined', () => {
  assert.equal(normalizeYmd(undefined), '');
});

test('normalizeYmd: returns empty string for non-string', () => {
  assert.equal(normalizeYmd(20260504), '');
});

test('normalizeYmd: does not match year-month only', () => {
  assert.equal(normalizeYmd('2026-05'), '2026-05');
});

test('normalizeYmd: returns garbage as-is', () => {
  assert.equal(normalizeYmd('not-a-date'), 'not-a-date');
});
