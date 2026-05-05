#!/usr/bin/env node
/**
 * Discovers country/city/district IDs from https://ezanvakti.emushaf.net.
 *
 * This is step 1 only: it writes an ID catalog that the Diyanet fetch step can
 * use later. It does not download prayer times.
 *
 * Usage:
 *   node scripts/discover-emushaf-locations.mjs
 *   node scripts/discover-emushaf-locations.mjs --exclude-core
 *   node scripts/discover-emushaf-locations.mjs --exclude-data-dir C:\Users\visyy\Downloads\data
 *   node scripts/discover-emushaf-locations.mjs --exclude-code us,ca
 *   node scripts/discover-emushaf-locations.mjs --country-id 53 --out countries-mx.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const BASE = 'https://ezanvakti.emushaf.net';
const args = process.argv.slice(2);
const OUT = path.resolve(ROOT, argValue('--out') || 'countries-allv2.json');
const ONLY_COUNTRY_ID = argValue('--country-id');
const EXCLUDE_CORE = args.includes('--exclude-core');
const EXCLUDE_DATA_DIR = argValue('--exclude-data-dir');
const EXCLUDE_CODES = new Set(splitArgValues('--exclude-code'));
const DRY_RUN = args.includes('--dry-run');
const DELAY_MS = Number(argValue('--delay-ms') || 150);

const CORE_COUNTRY_IDS = new Set([
  // Europe + USA + Canada, for keeping countries-allv2 focused on the missing rest-of-world list.
  '1', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16',
  '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29',
  '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40', '41', '44',
  '45', '46', '47', '48', '49', '52',
]);

const COUNTRY_ID_TO_CODE = {
  '1': 'cy',
  '2': 'tr',
  '3': 'mc',
  '4': 'nl',
  '5': 'az',
  '6': 'ee',
  '7': 'hu',
  '8': 'it',
  '9': 'ba',
  '10': 'va',
  '11': 'be',
  '12': 'se',
  '13': 'de',
  '14': 'sk',
  '15': 'gb',
  '16': 'cz',
  '17': 'ad',
  '18': 'xk',
  '19': 'si',
  '20': 'lv',
  '21': 'fr',
  '22': 'gr',
  '23': 'es',
  '24': 'mt',
  '25': 'al',
  '26': 'dk',
  '27': 'rs',
  '28': 'mk',
  '29': 'ua_crm',
  '30': 'hr',
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
  '46': 'md',
  '47': 'lt',
  '48': 'gl',
  '49': 'ch',
  '51': 'bm',
  '52': 'ca',
  '53': 'mx',
  '54': 'bs',
  '55': 'mw',
  '56': 'vu',
  '57': 'co',
  '58': 'gd',
  '59': 'au',
  '60': 'mn',
  '61': 'cn',
  '62': 'ge',
  '63': 'gq',
  '64': 'sa',
  '65': 'bi',
  '66': 'an',
  '67': 'za',
  '68': 'pr',
  '69': 'pe',
  '70': 'ht',
  '71': 'tg',
  '72': 'do',
  '73': 'lr',
  '74': 'lk',
  '75': 'ug',
  '76': 'np',
  '77': 'pk',
  '79': 'ga',
  '80': 'cf',
  '81': 'rw',
  '82': 'gy',
  '83': 'bo',
  '84': 'ne',
  '85': 'fm',
  '86': 'dz',
  '87': 'mq',
  '88': 'km',
  '89': 'pa',
  '90': 'ag',
  '91': 'bf',
  '92': 'kz',
  '93': 'ae',
  '94': 'qa',
  '95': 'et',
  '96': 'tt',
  '97': 'bn',
  '98': 'mg',
  '99': 'gt',
  '100': 'mo',
  '101': 'tj',
  '102': 'sn',
  '103': 'mv',
  '104': 'am',
  '105': 'hn',
  '106': 'mr',
  '107': 'my',
  '108': 'tw',
  '109': 'gm',
  '110': 'tz',
  '111': 'gn',
  '112': 're',
  '113': 'hk',
  '114': 'ke',
  '115': 'nc',
  '116': 'jp',
  '117': 'id',
  '118': 'tn',
  '119': 'jm',
  '120': 'ci',
  '122': 'is',
  '123': 'dm',
  '124': 'iq',
  '125': 'ai',
  '126': 'ph',
  '127': 'ng',
  '128': 'kr',
  '129': 'sd',
  '130': 'to',
  '131': 'uz',
  '132': 'bh',
  '133': 'kw',
  '134': 'la',
  '135': 'vn',
  '136': 'lc',
  '137': 'th',
  '138': 'sc',
  '139': 'ec',
  '140': 'ao',
  '141': 'ni',
  '142': 'kp',
  '143': 'gh',
  '144': 'cv',
  '145': 'ma',
  '146': 'br',
  '147': 'ms',
  '148': 'ye',
  '149': 'pw',
  '150': 'so',
  '151': 'mz',
  '152': 'ml',
  '153': 'aw',
  '154': 'mm',
  '155': 'bt',
  '156': 'td',
  '157': 'yt',
  '158': 'zm',
  '159': 'tm',
  '160': 'dj',
  '161': 'kh',
  '162': 'cr',
  '163': 'sj',
  '164': 'mu',
  '165': 'sv',
  '166': 'af',
  '167': 'bw',
  '168': 'kg',
  '169': 'gu',
  '170': 'sz',
  '171': 'gp',
  '172': 'sr',
  '173': 'om',
  '174': 'ls',
  '175': 'er',
  '176': 'tl',
  '177': 'bd',
  '178': 'nu',
  '179': 'sg',
  '180': 'cd',
  '181': 'bj',
  '182': 'bz',
  '183': 'pn',
  '184': 'cm',
  '185': 'pg',
  '186': 've',
  '187': 'in',
  '188': 'bb',
  '189': 'eg',
  '191': 'sy',
  '192': 'jo',
  '193': 'nz',
  '194': 'py',
  '196': 'na',
  '197': 'fj',
  '198': 'ws',
  '199': 'ar',
  '200': 'cl',
  '201': 'uy',
  '202': 'ir',
  '203': 'ly',
  '204': 'ps',
  '205': 'il',
  '206': 'kudus',
  '207': 'ru',
  '208': 'by',
  '209': 'cu',
};

function argValue(name) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : null;
}

function splitArgValues(name) {
  const values = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== name) continue;
    const raw = args[i + 1] || '';
    values.push(...raw.split(',').map(value => value.trim().toLowerCase()).filter(Boolean));
  }
  return values;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchJson(pathname, label) {
  const url = `${BASE}${pathname}`;
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      if (attempt < 3) await sleep(500 * attempt);
    }
  }

  throw new Error(`${label} failed: ${lastError?.message || 'unknown error'} (${url})`);
}

function sortCountries(countries) {
  return countries.sort((a, b) =>
    String(a.countryName).localeCompare(String(b.countryName), 'en', { sensitivity: 'base' })
  );
}

function sortByName(list, key) {
  return list.sort((a, b) =>
    String(a[key]).localeCompare(String(b[key]), 'en', { sensitivity: 'base' })
  );
}

function existingCountryCodesFromDataDir(dir) {
  if (!dir) return new Set();
  const full = path.resolve(dir);
  if (!fs.existsSync(full)) {
    throw new Error(`--exclude-data-dir does not exist: ${full}`);
  }

  return new Set(
    fs
      .readdirSync(full)
      .filter(name => {
        const item = path.join(full, name);
        return !name.startsWith('.') && fs.statSync(item).isDirectory();
      })
      .map(name => name.toLowerCase())
  );
}

function normalizeCountry(raw) {
  const countryId = String(raw.UlkeID);
  return {
    countryName: raw.UlkeAdiEn || raw.UlkeAdi,
    countryNameTr: raw.UlkeAdi || raw.UlkeAdiEn,
    countryId,
    countryCode: COUNTRY_ID_TO_CODE[countryId] || '',
    cities: [],
  };
}

function normalizeCity(raw) {
  return {
    cityName: raw.SehirAdiEn || raw.SehirAdi,
    cityNameTr: raw.SehirAdi || raw.SehirAdiEn,
    cityId: String(raw.SehirID),
    districts: [],
  };
}

function normalizeDistrict(raw) {
  return {
    districtName: raw.IlceAdiEn || raw.IlceAdi,
    districtNameTr: raw.IlceAdi || raw.IlceAdiEn,
    districtId: String(raw.IlceID),
  };
}

function writeOutput(countries) {
  fs.writeFileSync(OUT, `${JSON.stringify(sortCountries(countries), null, 2)}\n`);
}

async function main() {
  const rawCountries = await fetchJson('/ulkeler', 'countries');
  let countries = rawCountries.map(normalizeCountry);
  const existingCodes = existingCountryCodesFromDataDir(EXCLUDE_DATA_DIR);

  if (ONLY_COUNTRY_ID) {
    countries = countries.filter(country => country.countryId === String(ONLY_COUNTRY_ID));
  }

  if (EXCLUDE_CORE) {
    countries = countries.filter(country => !CORE_COUNTRY_IDS.has(country.countryId));
  }

  if (existingCodes.size > 0) {
    countries = countries.filter(country => !existingCodes.has(country.countryCode));
  }

  if (EXCLUDE_CODES.size > 0) {
    countries = countries.filter(country => !EXCLUDE_CODES.has(country.countryCode));
  }

  console.log(`Discovered ${rawCountries.length} countries from ${BASE}/ulkeler`);
  console.log(`Selected ${countries.length} countries${EXCLUDE_CORE ? ' after --exclude-core' : ''}`);
  if (existingCodes.size > 0) {
    console.log(`Excluding ${existingCodes.size} country folders from ${path.resolve(EXCLUDE_DATA_DIR)}`);
  }
  if (EXCLUDE_CODES.size > 0) {
    console.log(`Excluding explicit country codes: ${[...EXCLUDE_CODES].join(', ')}`);
  }

  if (DRY_RUN) {
    const missingCodes = countries.filter(country => !country.countryCode).map(country => country.countryId);
    console.log(`Missing countryCode mappings: ${missingCodes.length ? missingCodes.join(', ') : 'none'}`);
    return;
  }

  const out = [];
  for (let i = 0; i < countries.length; i++) {
    const country = countries[i];
    process.stdout.write(
      `[${String(i + 1).padStart(3)}/${countries.length}] ${country.countryId} ${country.countryName} `
    );

    try {
      const rawCities = await fetchJson(`/sehirler/${country.countryId}`, `cities ${country.countryId}`);
      const cities = sortByName(rawCities.map(normalizeCity), 'cityName');
      process.stdout.write(`cities=${cities.length}`);

      for (const city of cities) {
        await sleep(DELAY_MS);
        const rawDistricts = await fetchJson(`/ilceler/${city.cityId}`, `districts ${city.cityId}`);
        city.districts = sortByName(rawDistricts.map(normalizeDistrict), 'districtName');
      }

      country.cities = cities.filter(city => city.districts.length > 0);
      out.push(country);
      writeOutput(out);
      console.log(` districts=${country.cities.reduce((sum, city) => sum + city.districts.length, 0)}`);
    } catch (err) {
      console.log(` failed: ${err.message}`);
    }

    await sleep(DELAY_MS);
  }

  writeOutput(out);
  const cityCount = out.reduce((sum, country) => sum + country.cities.length, 0);
  const districtCount = out.reduce(
    (sum, country) => sum + country.cities.reduce((citySum, city) => citySum + city.districts.length, 0),
    0
  );

  console.log(`\nWrote ${OUT}`);
  console.log(`countries=${out.length} cities=${cityCount} districts=${districtCount}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
