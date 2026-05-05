#!/usr/bin/env node
/**
 * Generates editable normalization source files for the V2 data set.
 *
 * Inputs:
 *   countries-allv2.json
 *   data/{country}/{city}.json
 *
 * Outputs:
 *   data/city-normalizations.json
 *   data/country-normalizations.json
 *
 * Existing normalization values are preserved, so manual fixes are not lost.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const COUNTRIES_FILE = path.join(ROOT, 'countries-allv2.json');
const CITY_OUT = path.join(DATA, 'city-normalizations.json');
const COUNTRY_OUT = path.join(DATA, 'country-normalizations.json');

const COUNTRY_OVERRIDES = {
  an: { name: 'Netherlands Antilles' },
  ce: { name: 'Chechnya', region: 'Russia & Post-Soviet' },
  kudus: { name: 'Jerusalem', region: 'Middle East' },
  ua_crm: { name: 'Crimea', region: 'Europe' },
};

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function smartTitle(value) {
  return String(value || '')
    .toLocaleLowerCase('tr')
    .split(/([ _'-]+)/)
    .map(part => {
      if (!/[\p{L}\p{N}]/u.test(part)) return part;
      return part.charAt(0).toLocaleUpperCase('tr') + part.slice(1);
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleFromSlug(slug) {
  return String(slug)
    .split('_')
    .map(part => smartTitle(part))
    .join(' ');
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

function countryNameFromCode(code, sourceName) {
  if (COUNTRY_OVERRIDES[code]?.name) return COUNTRY_OVERRIDES[code].name;
  try {
    return regionNames.of(code.toUpperCase()) || smartTitle(sourceName || code);
  } catch {
    return smartTitle(sourceName || code);
  }
}

function dataDirs() {
  return fs
    .readdirSync(DATA)
    .filter(name => {
      const full = path.join(DATA, name);
      return !name.startsWith('.') && fs.statSync(full).isDirectory();
    })
    .sort();
}

function buildIndexes(countries) {
  const countryByCode = {};
  const districtById = {};

  for (const country of countries) {
    const code = String(country.countryCode || '').toLowerCase();
    if (!code) continue;

    countryByCode[code] = country;
    for (const city of country.cities || []) {
      for (const district of city.districts || []) {
        const id = String(district.districtId || '');
        if (!id) continue;
        districtById[id] = { country, city, district };
      }
    }
  }

  return { countryByCode, districtById };
}

function loadCityMeta(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))._meta || {};
  } catch {
    return {};
  }
}

function cityLabelFromSources(code, slug, meta, indexed) {
  const district = indexed?.district;
  if (district?.districtName) return smartTitle(district.districtName);
  if (meta.cityName) return smartTitle(meta.cityName);
  if (district?.districtNameTr) return smartTitle(district.districtNameTr);
  if (meta.cityNameTr) return smartTitle(meta.cityNameTr);
  return titleFromSlug(slug);
}

function main() {
  if (!fs.existsSync(COUNTRIES_FILE)) {
    console.error(`Missing ${COUNTRIES_FILE}`);
    process.exit(1);
  }
  if (!fs.existsSync(DATA)) {
    console.error(`Missing ${DATA}`);
    process.exit(1);
  }

  const countriesAll = readJson(COUNTRIES_FILE, []);
  const previousCities = readJson(CITY_OUT, { byCountry: {} });
  const previousCountries = readJson(COUNTRY_OUT, { byCode: {} });
  const indexes = buildIndexes(countriesAll);

  const byCountry = {};
  const countriesFound = [];
  let cityCount = 0;

  for (const code of dataDirs()) {
    const dir = path.join(DATA, code);
    const files = fs.readdirSync(dir).filter(file => file.endsWith('.json')).sort();
    if (!files.length) continue;

    countriesFound.push(code);
    byCountry[code] = {};

    for (const file of files) {
      const slug = file.replace(/\.json$/i, '');
      const meta = loadCityMeta(path.join(dir, file));
      const indexed = indexes.districtById[String(meta.districtId || '')];
      byCountry[code][slug] =
        previousCities.byCountry?.[code]?.[slug] || cityLabelFromSources(code, slug, meta, indexed);
      cityCount++;
    }
  }

  const byCode = {};
  for (const code of countriesFound) {
    const previous = previousCountries.byCode?.[code] || {};
    const source = indexes.countryByCode[code] || {};
    const override = COUNTRY_OVERRIDES[code] || {};
    const name = previous.name || override.name || countryNameFromCode(code, source.countryName);

    byCode[code] = {
      name,
      nameAl: previous.nameAl || name,
      flag: previous.flag != null ? previous.flag : flagEmoji(code),
      ...(previous.nameTr || source.countryNameTr ? { nameTr: previous.nameTr || source.countryNameTr } : {}),
      ...(previous.region || override.region ? { region: previous.region || override.region } : {}),
      ...(previous.diyanetCountryId || source.countryId
        ? { diyanetCountryId: previous.diyanetCountryId || String(source.countryId) }
        : {}),
    };
  }

  writeJson(CITY_OUT, {
    generatedAt: new Date().toISOString(),
    source: 'countries-allv2.json + data/',
    cityCount,
    countriesFound,
    note: 'Editable city display labels used by scripts/build-prayer-catalog.mjs. Manual edits are preserved on regeneration.',
    byCountry,
  });

  writeJson(COUNTRY_OUT, {
    generatedAt: new Date().toISOString(),
    source: 'countries-allv2.json + data/',
    note: 'Editable country display metadata used by scripts/build-prayer-catalog.mjs. Manual edits are preserved on regeneration.',
    byCode,
  });

  console.log(`Wrote ${CITY_OUT} countries=${countriesFound.length} cities=${cityCount}`);
  console.log(`Wrote ${COUNTRY_OUT} countries=${Object.keys(byCode).length}`);
}

main();
