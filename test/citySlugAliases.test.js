import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCitySlug } from '../lib/citySlugAliases.js';

test('resolveCitySlug: maps the legacy capital slugs', () => {
  assert.equal(resolveCitySlug('al', 'tirane'), 'tirana');
  assert.equal(resolveCitySlug('al', 'tiran'), 'tirana');
});

test('resolveCitySlug: is case-insensitive', () => {
  assert.equal(resolveCitySlug('AL', 'Tirane'), 'tirana');
});

test('resolveCitySlug: leaves real slugs and other countries alone', () => {
  assert.equal(resolveCitySlug('al', 'tirana'), 'tirana');
  assert.equal(resolveCitySlug('al', 'shkoder'), 'shkoder');
  assert.equal(resolveCitySlug('xk', 'tirane'), 'tirane');
});
