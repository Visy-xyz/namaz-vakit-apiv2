#!/usr/bin/env node
/**
 * Builds generated/prayer-catalog.json from local data/ + normalized labels.
 * Commit this file so /api/cities works on Vercel without bundling all city JSON.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const OUT_DIR = path.join(ROOT, 'generated');
const OUT_FILE = path.join(OUT_DIR, 'prayer-catalog.json');
const CITY_NORMS = path.join(DATA, 'city-normalizations.json');
const COUNTRY_NORMS = path.join(DATA, 'country-normalizations.json');

const NAME_FALLBACK = {
  kudus: 'Jerusalem',
  ua_crm: 'Crimea',
  xk: 'Kosovo',
};

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

function titleFromSlug(slug) {
  return slug
    .split('_')
    .map(w => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');
}

function main() {
  if (!fs.existsSync(DATA)) {
    console.error('Missing data/ — nothing to build.');
    process.exit(1);
  }

  let byCountryNorms = {};
  if (fs.existsSync(CITY_NORMS)) {
    const raw = JSON.parse(fs.readFileSync(CITY_NORMS, 'utf8'));
    byCountryNorms = raw.byCountry && typeof raw.byCountry === 'object' ? raw.byCountry : {};
  }

  let countryNorms = {};
  if (fs.existsSync(COUNTRY_NORMS)) {
    const raw = JSON.parse(fs.readFileSync(COUNTRY_NORMS, 'utf8'));
    countryNorms = raw.byCode && typeof raw.byCode === 'object' ? raw.byCode : {};
  }

  const countries = {};
  const cities = {};
  const labels = {};
  const coverage = { years: [], firstDate: null, lastDate: null, sampled: 0 };

  for (const dirName of fs.readdirSync(DATA)) {
    if (dirName.startsWith('.')) continue;
    const full = path.join(DATA, dirName);
    if (!fs.statSync(full).isDirectory()) continue;

    const code = dirName.toLowerCase();
    countries[code] = countryMeta(code, countryNorms[code]);
    const slugs = fs
      .readdirSync(full)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace(/\.json$/i, ''))
      .sort();

    cities[code] = slugs;
    if (slugs.length) sampleCoverage(coverage, full, slugs[0]);
    const normMap = byCountryNorms[code] || {};
    labels[code] = {};
    for (const slug of slugs) {
      const n = normMap[slug];
      labels[code][slug] = typeof n === 'string' && n.length ? n : titleFromSlug(slug);
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  // `data/` is excluded from the Vercel function bundle, so the API can only
  // read normalisation files if the build copies them into `generated/`.
  for (const src of [CITY_NORMS, COUNTRY_NORMS]) {
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(OUT_DIR, path.basename(src)));
  }

  coverage.years.sort();
  fs.writeFileSync(
    OUT_FILE,
    JSON.stringify({ builtAt: new Date().toISOString(), coverage, countries, labels, cities })
  );
  console.log(
    'Wrote',
    OUT_FILE,
    'countries=',
    Object.keys(cities).length,
    'cities=',
    Object.values(cities).reduce((a, b) => a + b.length, 0)
  );
  console.log('Coverage: years=', coverage.years.join(','), 'through', coverage.lastDate);
}

/**
 * Reads one representative city per country and folds its date range into the
 * running coverage. `lastDate` is the EARLIEST end date seen, so the published
 * figure reflects the first country that will run out of data, not the best case.
 */
function sampleCoverage(coverage, countryDir, slug) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(countryDir, `${slug}.json`), 'utf8'));
    const rows = Array.isArray(parsed.data) ? parsed.data : [];
    if (!rows.length) return;

    const year = parsed._meta?.year;
    if (year != null && !coverage.years.includes(year)) coverage.years.push(year);

    const first = dayKey(rows[0]);
    const last = dayKey(rows[rows.length - 1]);
    if (first && (!coverage.firstDate || first < coverage.firstDate)) coverage.firstDate = first;
    if (last && (!coverage.lastDate || last < coverage.lastDate)) coverage.lastDate = last;
    coverage.sampled += 1;
  } catch {
    /* a single unreadable sample must not fail the catalog build */
  }
}

/** Mirrors lib/dayDate.js for the two shapes the Diyanet rows actually use. */
function dayKey(day) {
  const raw = typeof day?.date === 'string' ? day.date.trim() : '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const iso = day?.gregorianDateLongIso8601;
  if (typeof iso === 'string') {
    const m = iso.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const short = day?.gregorianDateShort;
  if (typeof short === 'string' && /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(short)) {
    const [dd, mm, yyyy] = short.split('.');
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  return null;
}

function countryMeta(code, normalized = {}) {
  const name = normalized.name || countryNameFromCode(code);
  return {
    name,
    nameAl: normalized.nameAl || name,
    flag: normalized.flag || flagEmoji(code),
    ...(normalized.nameTr ? { nameTr: normalized.nameTr } : {}),
    ...(normalized.region ? { region: normalized.region } : {}),
    ...(normalized.diyanetCountryId ? { diyanetCountryId: normalized.diyanetCountryId } : {}),
  };
}

function countryNameFromCode(code) {
  if (NAME_FALLBACK[code]) return NAME_FALLBACK[code];
  try {
    return regionNames.of(code.toUpperCase()) || code.toUpperCase();
  } catch {
    return titleFromSlug(code);
  }
}

function flagEmoji(code) {
  if (!/^[a-z]{2}$/.test(code)) return '';
  const A = 0x1f1e6;
  const upper = code.toUpperCase();
  return String.fromCodePoint(
    A + upper.charCodeAt(0) - 65,
    A + upper.charCodeAt(1) - 65
  );
}

main();
