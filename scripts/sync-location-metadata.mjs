#!/usr/bin/env node
/**
 * Synchronizes Diyanet location metadata with the API data tree.
 *
 * Inputs:
 *   --all-cities <file>              Diyanet export shaped as { countryId: {...} }
 *   --base-city-normalizations <file> Existing city-normalizations.json to reuse
 *
 * Outputs:
 *   countries-all.json
 *   data/city-normalizations.json
 *   data/country-normalizations.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const COUNTRIES_ALL = path.join(ROOT, 'countries-all.json');
const CITY_NORMS = path.join(DATA, 'city-normalizations.json');
const COUNTRY_NORMS = path.join(DATA, 'country-normalizations.json');

const args = process.argv.slice(2);

const COUNTRY_ID_TO_CODE = {
  '4': 'nl',
  '7': 'hu',
  '8': 'it',
  '9': 'ba',
  '11': 'be',
  '12': 'se',
  '13': 'de',
  '14': 'sk',
  '15': 'gb',
  '16': 'cz',
  '18': 'xk',
  '19': 'si',
  '20': 'lv',
  '21': 'fr',
  '22': 'gr',
  '23': 'es',
  '24': 'mt',
  '25': 'al',
  '26': 'dk',
  '28': 'mk',
  '31': 'lu',
  '32': 'ie',
  '33': 'us',
  '34': 'me',
  '35': 'at',
  '36': 'no',
  '37': 'ro',
  '38': 'li',
  '39': 'pl',
  '40': 'ua',
  '41': 'fi',
  '42': 'lb',
  '43': 'ce',
  '44': 'bg',
  '45': 'pt',
  '47': 'lt',
  '49': 'ch',
  '51': 'bm',
  '52': 'ca',
  '53': 'mx',
  '54': 'bs',
  '55': 'mw',
  '56': 'vu',
  '110': 'tz',
  '111': 'gn',
  '112': 're',
  '113': 'hk',
  '114': 'ke',
  '115': 'nc',
  '116': 'jp',
  '117': 'id',
  '170': 'sz',
  '171': 'gp',
  '172': 'sr',
  '173': 'om',
  '174': 'ls',
  '175': 'er',
  '176': 'tl',
  '206': 'kudus',
};

const COUNTRY_OVERRIDES = {
  kudus: { name: 'Jerusalem', nameTr: 'KUDUS', region: 'Middle East', diyanetCountryId: '206' },
  ua_crm: { name: 'Crimea', nameTr: 'KIRIM', region: 'Europe' },
  xk: { name: 'Kosovo' },
  ce: { name: 'Chechnya', region: 'Russia & Post-Soviet' },
};

const NAME_AL = {
  al: 'Shqiperi',
  xk: 'Kosove',
  mk: 'Maqedoni',
  me: 'Mali i Zi',
  ba: 'Bosnje',
};

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

function argValue(name) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : null;
}

function readJson(file, fallback) {
  if (!file || !fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function titleCase(value) {
  return String(value || '')
    .toLowerCase()
    .split(/([ _-]+)/)
    .map(part => (/^[a-z]/.test(part) ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleFromSlug(slug) {
  return String(slug)
    .split('_')
    .map(part => titleCase(part))
    .join(' ');
}

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
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

function countryNameFromCode(code) {
  if (COUNTRY_OVERRIDES[code]?.name) return COUNTRY_OVERRIDES[code].name;
  try {
    return regionNames.of(code.toUpperCase()) || code.toUpperCase();
  } catch {
    return titleFromSlug(code);
  }
}

function normalizeCountriesAllEntry(raw) {
  const countryId = String(raw.id ?? raw.countryId ?? '');
  const countryCode = COUNTRY_ID_TO_CODE[countryId];
  const cities = [];

  for (const city of raw.cities || []) {
    const districts = (city.districts || [])
      .filter(d => d.id || d.districtId)
      .map(d => ({
        districtName: d.name_en || d.districtName || d.name || d.districtNameTr,
        districtNameTr: d.name || d.districtNameTr || d.name_en || d.districtName,
        districtId: String(d.id ?? d.districtId),
      }));

    if (!districts.length) continue;
    cities.push({
      cityName: city.name_en || city.cityName || city.name || raw.name_en || raw.countryName,
      cityNameTr: city.name || city.cityNameTr || city.name_en || city.cityName || raw.name,
      cityId: String(city.id ?? city.cityId ?? ''),
      districts,
    });
  }

  return {
    countryName: raw.name_en || raw.countryName || raw.name,
    countryNameTr: raw.name || raw.countryNameTr || raw.name_en || raw.countryName,
    countryId,
    ...(countryCode ? { countryCode } : {}),
    ...(raw.region ? { region: raw.region } : {}),
    cities,
  };
}

function countrySortKey(country) {
  return `${String(country.countryName || '').toLowerCase()}|${country.countryId}`;
}

function buildCountriesAll(allCitiesObject) {
  const countries = [];
  for (const raw of Object.values(allCitiesObject || {})) {
    const normalized = normalizeCountriesAllEntry(raw);
    if (!normalized.countryId || !normalized.cities.length) continue;
    countries.push(normalized);
  }

  return countries.sort((a, b) => countrySortKey(a).localeCompare(countrySortKey(b)));
}

function dataCountryDirs() {
  if (!fs.existsSync(DATA)) return [];
  return fs
    .readdirSync(DATA)
    .filter(name => {
      const full = path.join(DATA, name);
      return !name.startsWith('.') && fs.statSync(full).isDirectory();
    })
    .sort();
}

function buildSourceIndexes(countries, allCitiesObject) {
  const countryByCode = {};
  const labelsByDistrictId = {};
  const labelsBySlug = {};

  for (const country of countries) {
    const code = String(country.countryCode || COUNTRY_ID_TO_CODE[String(country.countryId)] || '').toLowerCase();
    if (!code) continue;

    countryByCode[code] = {
      name: titleCase(country.countryName),
      nameTr: country.countryNameTr,
      region: country.region,
      diyanetCountryId: String(country.countryId),
    };

    for (const city of country.cities || []) {
      for (const district of city.districts || []) {
        const label = titleCase(district.districtName);
        const districtId = String(district.districtId || '');
        const slug = slugify(district.districtName);
        if (districtId) labelsByDistrictId[districtId] = { code, label };
        if (slug) {
          labelsBySlug[code] ||= {};
          labelsBySlug[code][slug] = label;
        }
      }
    }
  }

  for (const raw of Object.values(allCitiesObject || {})) {
    const code = COUNTRY_ID_TO_CODE[String(raw.id)];
    if (!code || countryByCode[code]) continue;
    countryByCode[code] = {
      name: titleCase(raw.name_en || raw.name),
      nameTr: raw.name,
      region: raw.region,
      diyanetCountryId: String(raw.id),
    };
  }

  return { countryByCode, labelsByDistrictId, labelsBySlug };
}

function buildCityNormalizations(baseNorms, indexes) {
  const byCountry = {};
  const countriesFound = [];
  let cityCount = 0;

  for (const code of dataCountryDirs()) {
    const dir = path.join(DATA, code);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
    if (!files.length) continue;

    countriesFound.push(code);
    byCountry[code] = {};

    for (const file of files) {
      const slug = file.replace(/\.json$/i, '');
      let districtId = '';
      try {
        districtId = String(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))?._meta?.districtId || '');
      } catch {
        districtId = '';
      }

      const byId = indexes.labelsByDistrictId[districtId];
      const base = baseNorms.byCountry?.[code]?.[slug];
      const bySlug = indexes.labelsBySlug[code]?.[slug];
      byCountry[code][slug] =
        byId?.code === code && byId.label ? byId.label : base || bySlug || titleFromSlug(slug);
      cityCount++;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    source: 'data/ + countries-all.json + all_cities.json',
    cityCount,
    countriesFound,
    note: 'API display labels. Existing city-normalizations are reused first where no Diyanet district match is available; remaining entries fall back to cleaned slugs.',
    byCountry,
  };
}

function buildCountryNormalizations(indexes) {
  const byCode = {};

  for (const code of dataCountryDirs()) {
    const fromSource = indexes.countryByCode[code] || {};
    const override = COUNTRY_OVERRIDES[code] || {};
    const name = override.name || fromSource.name || countryNameFromCode(code);

    byCode[code] = {
      name,
      nameAl: NAME_AL[code] || name,
      flag: override.flag || flagEmoji(code),
      ...(override.nameTr || fromSource.nameTr ? { nameTr: override.nameTr || fromSource.nameTr } : {}),
      ...(override.region || fromSource.region ? { region: override.region || fromSource.region } : {}),
      ...(override.diyanetCountryId || fromSource.diyanetCountryId
        ? { diyanetCountryId: override.diyanetCountryId || fromSource.diyanetCountryId }
        : {}),
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    source: 'data/ + countries-all.json + all_cities.json',
    note: 'Country display metadata used by /api/cities. Edit byCode entries for preferred public labels.',
    byCode,
  };
}

function main() {
  const allCitiesPath = argValue('--all-cities');
  const baseNormPath = argValue('--base-city-normalizations');

  const allCitiesObject = readJson(allCitiesPath, {});
  const baseNorms = readJson(baseNormPath || CITY_NORMS, { byCountry: {} });
  const countries = buildCountriesAll(allCitiesObject);
  const indexes = buildSourceIndexes(countries, allCitiesObject);

  writeJson(COUNTRIES_ALL, countries);
  writeJson(CITY_NORMS, buildCityNormalizations(baseNorms, indexes));
  writeJson(COUNTRY_NORMS, buildCountryNormalizations(indexes));

  console.log(`Wrote ${COUNTRIES_ALL} (${countries.length} countries)`);
  console.log(`Wrote ${CITY_NORMS}`);
  console.log(`Wrote ${COUNTRY_NORMS}`);
}

main();
