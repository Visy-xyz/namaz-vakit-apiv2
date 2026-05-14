import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogStats, catalogCitiesByCountry, catalogDisplayName } from '../lib/prayerCatalog.js';

test('catalogStats: returns an object when catalog is loaded', () => {
  const stats = catalogStats();
  assert.ok(stats !== null, 'catalogStats should not be null when generated/prayer-catalog.json exists');
});

test('catalogStats: reports 167 countries', () => {
  const stats = catalogStats();
  assert.equal(stats.countries, 167);
});

test('catalogStats: reports more than 3900 cities', () => {
  const stats = catalogStats();
  assert.ok(stats.cities > 3900, `expected >3900 cities, got ${stats.cities}`);
});

test('catalogStats: builtAt is an ISO string', () => {
  const stats = catalogStats();
  assert.ok(typeof stats.builtAt === 'string', 'builtAt should be a string');
  assert.ok(!isNaN(Date.parse(stats.builtAt)), 'builtAt should be a valid ISO date');
});

test('catalogCitiesByCountry: returns cities for "af"', () => {
  const byCountry = catalogCitiesByCountry();
  assert.ok(Array.isArray(byCountry['af']), 'af should have a city array');
  assert.ok(byCountry['af'].length > 0, 'af should have at least one city');
});

test('catalogDisplayName: resolves kabul display name', () => {
  const name = catalogDisplayName('af', 'kabul');
  assert.ok(typeof name === 'string' && name.length > 0, 'should return a non-empty display name');
});
