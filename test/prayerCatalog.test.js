import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  catalogStats,
  catalogCitiesByCountry,
  catalogDisplayName,
  catalogCoverage,
} from '../lib/prayerCatalog.js';

/**
 * Assertions are derived from the catalog rather than hard-coded, so this file
 * is identical in the v1 and v2 repos despite their different country sets.
 */
const anyCountry = () => Object.keys(catalogCitiesByCountry() ?? {}).sort()[0];

test('catalogStats: returns an object when catalog is loaded', () => {
  assert.ok(catalogStats() !== null, 'run `npm run build:catalog` first');
});

test('catalogStats: counts match the city map', () => {
  const stats = catalogStats();
  const byCountry = catalogCitiesByCountry();
  assert.equal(stats.countries, Object.keys(byCountry).length);
  assert.equal(
    stats.cities,
    Object.values(byCountry).reduce((sum, arr) => sum + arr.length, 0)
  );
});

test('catalogStats: covers a realistic number of cities', () => {
  assert.ok(catalogStats().cities > 1000, 'catalog looks truncated');
});

test('catalogStats: builtAt is a valid ISO date', () => {
  const { builtAt } = catalogStats();
  assert.equal(typeof builtAt, 'string');
  assert.ok(!Number.isNaN(Date.parse(builtAt)));
});

test('catalogCitiesByCountry: every country has at least one city', () => {
  const byCountry = catalogCitiesByCountry();
  for (const [code, cities] of Object.entries(byCountry)) {
    assert.ok(Array.isArray(cities) && cities.length > 0, `${code} has no cities`);
  }
});

test('catalogDisplayName: resolves a name for a real city', () => {
  const cc = anyCountry();
  const slug = catalogCitiesByCountry()[cc][0];
  const name = catalogDisplayName(cc, slug);
  assert.ok(typeof name === 'string' && name.length > 0, `no display name for ${cc}/${slug}`);
});

test('catalogDisplayName: returns null for an unknown city', () => {
  assert.equal(catalogDisplayName(anyCountry(), '__nope__'), null);
});

test('catalogCoverage: reports the shipped date range', () => {
  const coverage = catalogCoverage();
  assert.ok(coverage, 'catalog should carry a coverage block — rebuild it');
  assert.match(coverage.lastDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(coverage.firstDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(coverage.firstDate <= coverage.lastDate);
  assert.ok(Array.isArray(coverage.years) && coverage.years.length > 0);
});
