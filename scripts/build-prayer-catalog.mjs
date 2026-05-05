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
    const normMap = byCountryNorms[code] || {};
    labels[code] = {};
    for (const slug of slugs) {
      const n = normMap[slug];
      labels[code][slug] = typeof n === 'string' && n.length ? n : titleFromSlug(slug);
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify({ countries, labels, cities }));
  console.log(
    'Wrote',
    OUT_FILE,
    'countries=',
    Object.keys(cities).length,
    'cities=',
    Object.values(cities).reduce((a, b) => a + b.length, 0)
  );
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
