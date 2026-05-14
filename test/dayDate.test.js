import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayDateKey, coverageRange } from '../lib/dayDate.js';

// dayDateKey — date field (new Diyanet format)
test('dayDateKey: reads plain date field', () => {
  assert.equal(dayDateKey({ date: '2026-05-04' }), '2026-05-04');
});

test('dayDateKey: trims date field with time component', () => {
  assert.equal(dayDateKey({ date: '2026-05-04T00:00:00' }), '2026-05-04');
});

test('dayDateKey: ignores date field if not ISO shape', () => {
  const result = dayDateKey({ date: 'garbage', gregorianDateLongIso8601: '2026-05-04T12:00:00Z' });
  assert.equal(result, '2026-05-04');
});

// dayDateKey — gregorianDateLongIso8601 fallback
test('dayDateKey: reads gregorianDateLongIso8601', () => {
  assert.equal(dayDateKey({ gregorianDateLongIso8601: '2026-05-04T12:00:00Z' }), '2026-05-04');
});

test('dayDateKey: reads gregorianDateLongIso8601 without time', () => {
  assert.equal(dayDateKey({ gregorianDateLongIso8601: '2026-01-01' }), '2026-01-01');
});

// dayDateKey — gregorianDateShortIso8601 fallback (DD.MM.YYYY)
test('dayDateKey: reads gregorianDateShortIso8601 with leading zeros', () => {
  assert.equal(dayDateKey({ gregorianDateShortIso8601: '04.05.2026' }), '2026-05-04');
});

test('dayDateKey: reads gregorianDateShortIso8601 without leading zeros', () => {
  assert.equal(dayDateKey({ gregorianDateShortIso8601: '4.5.2026' }), '2026-05-04');
});

test('dayDateKey: reads gregorianDateShortIso8601 for January 1st', () => {
  assert.equal(dayDateKey({ gregorianDateShortIso8601: '1.1.2026' }), '2026-01-01');
});

// dayDateKey — gregorianDateShort fallback
test('dayDateKey: reads gregorianDateShort', () => {
  assert.equal(dayDateKey({ gregorianDateShort: '04.05.2026' }), '2026-05-04');
});

// dayDateKey — priority: date > longIso > shortIso > short
test('dayDateKey: prefers date field over all others', () => {
  assert.equal(dayDateKey({
    date: '2026-05-04',
    gregorianDateLongIso8601: '2026-01-01T00:00:00Z',
    gregorianDateShortIso8601: '31.12.2025',
  }), '2026-05-04');
});

test('dayDateKey: prefers longIso over shortIso when date missing', () => {
  assert.equal(dayDateKey({
    gregorianDateLongIso8601: '2026-05-04T00:00:00Z',
    gregorianDateShortIso8601: '31.12.2025',
  }), '2026-05-04');
});

// dayDateKey — null / invalid inputs
test('dayDateKey: returns null for empty object', () => {
  assert.equal(dayDateKey({}), null);
});

test('dayDateKey: returns null for null input', () => {
  assert.equal(dayDateKey(null), null);
});

test('dayDateKey: returns null for string input', () => {
  assert.equal(dayDateKey('2026-05-04'), null);
});

test('dayDateKey: returns null for undefined', () => {
  assert.equal(dayDateKey(undefined), null);
});

test('dayDateKey: returns null when all fields are garbage', () => {
  assert.equal(dayDateKey({ date: 123, gregorianDateLongIso8601: 456 }), null);
});

// coverageRange
test('coverageRange: returns first → last date for full year', () => {
  const days = [{ date: '2026-01-01' }, { date: '2026-12-31' }];
  assert.equal(coverageRange(days), '2026-01-01 → 2026-12-31');
});

test('coverageRange: works with single element', () => {
  const days = [{ date: '2026-05-04' }];
  assert.equal(coverageRange(days), '2026-05-04 → 2026-05-04');
});

test('coverageRange: returns unknown for empty array', () => {
  assert.equal(coverageRange([]), 'unknown');
});

test('coverageRange: returns unknown for null', () => {
  assert.equal(coverageRange(null), 'unknown');
});

test('coverageRange: returns unknown for undefined', () => {
  assert.equal(coverageRange(undefined), 'unknown');
});

test('coverageRange: returns unknown when dates cannot be extracted', () => {
  assert.equal(coverageRange([{}, {}]), 'unknown');
});
