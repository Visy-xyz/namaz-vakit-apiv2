import fs from 'fs';
import path from 'path';

let cache = null;
let attempted = false;

export function loadPrayerCatalog() {
  if (attempted) return cache;
  attempted = true;
  const p = path.join(process.cwd(), 'generated', 'prayer-catalog.json');
  if (fs.existsSync(p)) {
    try {
      cache = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      cache = null;
    }
  } else {
    cache = null;
  }
  return cache;
}

/** @returns {Record<string, string[]>|null} */
export function catalogCitiesByCountry() {
  const c = loadPrayerCatalog();
  return c?.cities && typeof c.cities === 'object' ? c.cities : null;
}

export function catalogDisplayName(country, slug) {
  const c = String(country).toLowerCase();
  const s = String(slug);
  const lab = loadPrayerCatalog()?.labels?.[c]?.[s];
  return typeof lab === 'string' && lab.length ? lab : null;
}

export function catalogCountryMeta(country) {
  const c = String(country).toLowerCase();
  const meta = loadPrayerCatalog()?.countries?.[c];
  return meta && typeof meta === 'object' ? meta : null;
}
