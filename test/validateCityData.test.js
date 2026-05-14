import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invalidFields } from '../lib/validateCityData.js';

const ALL_FIELDS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

const validDay = {
  fajr: '05:30',
  sunrise: '06:53',
  dhuhr: '12:02',
  asr: '14:39',
  maghrib: '17:01',
  isha: '18:18',
};

test('invalidFields: returns empty array for a valid day', () => {
  assert.deepEqual(invalidFields(validDay), []);
});

test('invalidFields: catches a single null field', () => {
  assert.deepEqual(invalidFields({ ...validDay, fajr: null }), ['fajr']);
});

test('invalidFields: catches a single missing field', () => {
  const { isha, ...rest } = validDay;
  assert.deepEqual(invalidFields(rest), ['isha']);
});

test('invalidFields: catches a field with wrong format', () => {
  assert.deepEqual(invalidFields({ ...validDay, dhuhr: '12:2' }), ['dhuhr']);
});

test('invalidFields: catches a field that is an empty string', () => {
  assert.deepEqual(invalidFields({ ...validDay, asr: '' }), ['asr']);
});

test('invalidFields: catches multiple bad fields', () => {
  const day = { ...validDay, fajr: null, maghrib: 'bad' };
  assert.deepEqual(invalidFields(day), ['fajr', 'maghrib']);
});

test('invalidFields: returns all fields for null input', () => {
  assert.deepEqual(invalidFields(null), ALL_FIELDS);
});

test('invalidFields: returns all fields for undefined input', () => {
  assert.deepEqual(invalidFields(undefined), ALL_FIELDS);
});

test('invalidFields: returns all fields for empty object', () => {
  assert.deepEqual(invalidFields({}), ALL_FIELDS);
});

test('invalidFields: rejects time with seconds (HH:MM:SS)', () => {
  assert.deepEqual(invalidFields({ ...validDay, fajr: '05:30:00' }), ['fajr']);
});

test('invalidFields: accepts midnight 00:00', () => {
  assert.deepEqual(invalidFields({ ...validDay, fajr: '00:00' }), []);
});

test('invalidFields: rejects numeric time value', () => {
  assert.deepEqual(invalidFields({ ...validDay, sunrise: 653 }), ['sunrise']);
});
