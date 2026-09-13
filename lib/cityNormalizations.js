import fs from 'fs';
import { resolveAsset } from './paths.js';
import { catalogDisplayName } from './prayerCatalog.js';

let cache = null;

export function loadCityNormalizations() {
  if (cache) return cache;
  const file = resolveAsset('city-normalizations.json');
  if (!file) {
    cache = { byCountry: {} };
    return cache;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    cache = { byCountry: raw.byCountry && typeof raw.byCountry === 'object' ? raw.byCountry : {} };
  } catch {
    cache = { byCountry: {} };
  }
  return cache;
}

export function displayCityName(country, slug) {
  const fromCatalog = catalogDisplayName(country, slug);
  if (fromCatalog) return fromCatalog;

  const c = String(country).toLowerCase();
  const s = String(slug);
  const map = loadCityNormalizations().byCountry[c];
  if (map && typeof map[s] === 'string' && map[s].length) return map[s];
  return titleFromSlug(s);
}

function titleFromSlug(slug) {
  return slug
    .split('_')
    .map(w => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');
}
