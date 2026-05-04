import fs from 'fs';
import path from 'path';
import { getQuery } from '../lib/query.js';
import { dataRoot } from '../lib/paths.js';
import { countryMeta } from '../lib/countryMeta.js';
import { displayCityName } from '../lib/cityNormalizations.js';
import { catalogCitiesByCountry } from '../lib/prayerCatalog.js';

const DATA_DIR = dataRoot();

/** @returns {{ code: string, dirName: string }[]} */
function listCountryDirs() {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs
    .readdirSync(DATA_DIR)
    .filter(name => {
      if (name.startsWith('.')) return false;
      const full = path.join(DATA_DIR, name);
      try {
        return fs.statSync(full).isDirectory();
      } catch {
        return false;
      }
    })
    .map(dirName => ({ code: dirName.toLowerCase(), dirName }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

function citiesFromCatalog(countryFilter) {
  const byCountry = catalogCitiesByCountry();
  if (!byCountry) return null;

  const result = {};
  for (const code of Object.keys(byCountry).sort()) {
    if (countryFilter && countryFilter.toLowerCase() !== code) continue;
    const meta = countryMeta(code);
    const slugs = byCountry[code];
    const cities = slugs
      .map(slug => ({
        slug,
        displayName: displayCityName(code, slug),
        endpoint: `/api/prayer?country=${code}&city=${slug}`,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'en', { sensitivity: 'base' }));

    result[code] = { ...meta, cities };
  }
  return result;
}

function citiesFromFilesystem(countryFilter) {
  const result = {};
  for (const { code, dirName } of listCountryDirs()) {
    if (countryFilter && countryFilter.toLowerCase() !== code) continue;

    const dir = path.join(DATA_DIR, dirName);
    const meta = countryMeta(code);

    const cities = fs
      .readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const slug = f.replace(/\.json$/i, '');
        return {
          slug,
          displayName: displayCityName(code, slug),
          endpoint: `/api/prayer?country=${code}&city=${slug}`,
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'en', { sensitivity: 'base' }));

    result[code] = { ...meta, cities };
  }
  return result;
}

/**
 * GET /api/cities              → all countries + cities
 * GET /api/cities?country=af   → only that country
 *
 * On Vercel, uses generated/prayer-catalog.json (see scripts/build-prayer-catalog.mjs).
 * Locally falls back to scanning data/ if the catalog is missing.
 */
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    return res.status(204).end();
  }

  const { country } = getQuery(req);
  const fromCat = citiesFromCatalog(country || undefined);
  const payload = fromCat ?? citiesFromFilesystem(country || undefined);

  return res.status(200).json(payload);
}
