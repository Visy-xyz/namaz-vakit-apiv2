import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLocation, validateDate, validateMonth } from '../lib/validate.js';

test('validateLocation: accepts a plain slug', () => {
  assert.equal(validateLocation('al', 'tirana'), null);
});

test('validateLocation: accepts hyphenated slugs', () => {
  // v1 used to reject these outright, making those cities unreachable.
  assert.equal(validateLocation('co', 'santa-marta'), null);
});

test('validateLocation: accepts underscored slugs', () => {
  assert.equal(validateLocation('us', 'new_york'), null);
});

test('validateLocation: accepts non-ISO country folders', () => {
  assert.equal(validateLocation('ua_crm', 'simferopol'), null);
  assert.equal(validateLocation('kudus', 'kudus'), null);
});

test('validateLocation: rejects path traversal in the city slug', () => {
  assert.notEqual(validateLocation('al', '../../etc/passwd'), null);
  assert.notEqual(validateLocation('al', '..'), null);
});

test('validateLocation: rejects path traversal in the country code', () => {
  assert.notEqual(validateLocation('../al', 'tirana'), null);
});

test('validateLocation: rejects empty values', () => {
  assert.notEqual(validateLocation('', 'tirana'), null);
  assert.notEqual(validateLocation('al', ''), null);
});

test('validateDate: accepts padded and unpadded forms', () => {
  assert.equal(validateDate('2026-05-13'), null);
  assert.equal(validateDate('2026-5-3'), null);
});

test('validateDate: absent date is allowed', () => {
  assert.equal(validateDate(undefined), null);
});

test('validateDate: rejects nonsense', () => {
  assert.notEqual(validateDate('13-05-2026'), null);
  assert.notEqual(validateDate('yesterday'), null);
});

test('validateMonth: accepts YYYY-MM, rejects YYYY-MM-DD', () => {
  assert.equal(validateMonth('2026-05'), null);
  assert.notEqual(validateMonth('2026-05-13'), null);
});
