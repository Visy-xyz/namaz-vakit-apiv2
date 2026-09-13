import fs from 'fs';
import path from 'path';
import { dataRoot } from './paths.js';

const base = () => (process.env.DATA_BASE_URL || '').replace(/\/$/, '');

/**
 * City JSON files are ~270 KB raw (a full year of days), which is several MB
 * once parsed. Caching them is worth it on a warm instance — the same city is
 * usually requested repeatedly — but the cache MUST be bounded, or a busy
 * instance walking many cities exhausts the function's memory.
 */
const MAX_CACHED_CITIES = 24;
const cache = new Map();

function cacheGet(key) {
  if (!cache.has(key)) return undefined;
  // Re-insert to mark most-recently-used (Map preserves insertion order).
  const value = cache.get(key);
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function cacheSet(key, value) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > MAX_CACHED_CITIES) {
    cache.delete(cache.keys().next().value);
  }
}

/**
 * @param {string} country
 * @param {string} city slug
 * @returns {Promise<object|null>} parsed city JSON or null if not found
 */
export async function readCityJson(country, city) {
  const cc = String(country).toLowerCase();
  const slug = String(city).toLowerCase();
  const key = `${cc}/${slug}`;

  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  const result = await loadCityJson(cc, slug);
  // Cache misses too: a bad slug shouldn't re-hit the network every request.
  cacheSet(key, result);
  return result;
}

async function loadCityJson(cc, slug) {
  const b = base();

  if (b) {
    const url = `${b}/${encodeURIComponent(cc)}/${encodeURIComponent(slug)}.json`;
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.status === 404) return null;
      if (!res.ok) {
        console.error('readCityJson fetch failed', url, res.status);
        return null;
      }
      return await res.json();
    } catch (e) {
      console.error('readCityJson', url, e);
      return null;
    }
  }

  const file = path.join(dataRoot(), cc, `${slug}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Only nudges on Vercel when env is missing (local dev without DATA_BASE_URL is normal). */
export function dataBaseUrlHint() {
  if (base()) return null;
  if (process.env.VERCEL !== '1') return null;
  return 'Set DATA_BASE_URL to a public base URL that mirrors the repo `data/` tree (same country/city.json paths).';
}
