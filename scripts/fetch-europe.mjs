#!/usr/bin/env node
/**
 * fetch-europe.mjs — Diyanet date-range fetch from countries-all.json (or countries.json).
 *
 * Reads DIYANET_EMAIL / DIYANET_PASS from the environment (GitHub Actions secrets).
 * Writes data/{country}/{city}.json under the repository root.
 *
 * Token handling: refreshes on HTTP 401, and proactively before JWT `exp` (or every ~40 min if not a JWT).
 *
 * Usage:
 *   node scripts/fetch-europe.mjs                  → skip cities that already have a file
 *   node scripts/fetch-europe.mjs --refetch        → overwrite existing
 *   node scripts/fetch-europe.mjs --country nl     → single country code
 *   node scripts/fetch-europe.mjs --dry-run        → counts only
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

const EMAIL = process.env.DIYANET_EMAIL;
const PASS = process.env.DIYANET_PASS;
const BASE = 'https://awqatsalah.diyanet.gov.tr';
const YEAR = new Date().getFullYear();
const DELAY = 1200;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const REFETCH = args.includes('--refetch');
const ONLY_CTRY = args.includes('--country') ? args[args.indexOf('--country') + 1] : null;

let currentToken = null;
let tokenRefreshCount = 0;
/** Millisecond timestamp when the current token should be considered expired (with buffer). */
let tokenExpiresAtMs = 0;

const COUNTRY_MAP = {
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
  '34': 'me',
  '35': 'at',
  '36': 'no',
  '37': 'ro',
  '38': 'li',
  '39': 'pl',
  '40': 'ua',
  '41': 'fi',
  '44': 'bg',
  '45': 'pt',
  '47': 'lt',
  '49': 'ch',
  '33': 'us',
  '52': 'ca',
};

function loadCountriesJson() {
  const candidates = [
    path.join(ROOT, 'countries-all.json'),
    path.join(ROOT, 'countries.json'),
    path.join(ROOT, 'europe-countries.json'),
    path.join(ROOT, 'all-countries.json'),
    path.join(__dirname, 'countries.json'),
  ];
  for (const f of candidates) {
    if (fs.existsSync(f)) {
      console.log(`Reading: ${f}`);
      return JSON.parse(fs.readFileSync(f, 'utf8'));
    }
  }
  console.error('No countries list found. Add countries-all.json or countries.json at repo root (see README).');
  process.exit(1);
}

/** Diyanet access tokens are JWTs with `exp` (seconds since epoch). */
function readJwtExpMs(token) {
  try {
    const parts = String(token).split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (typeof payload.exp === 'number') return payload.exp * 1000;
  } catch (_) {
    /* not a JWT */
  }
  return null;
}

const FALLBACK_TOKEN_TTL_MS = 40 * 60 * 1000;
const REFRESH_BEFORE_EXPIRY_MS = 2 * 60 * 1000;

function applyNewToken(t) {
  currentToken = t;
  const exp = readJwtExpMs(t);
  tokenExpiresAtMs = exp ?? Date.now() + FALLBACK_TOKEN_TTL_MS;
}

async function ensureValidToken() {
  const now = Date.now();
  if (!currentToken || now >= tokenExpiresAtMs - REFRESH_BEFORE_EXPIRY_MS) {
    process.stdout.write('\n  Refreshing auth token... ');
    applyNewToken(await getToken());
    tokenRefreshCount++;
    process.stdout.write(`ok (expires in ~${Math.round((tokenExpiresAtMs - now) / 60000)} min)\n`);
  }
}

function buildCityList(countriesData) {
  const cities = [];
  const list = Array.isArray(countriesData) ? countriesData : countriesData?.countries || [];

  for (const country of list) {
    const countryId = String(country.countryId);
    const countryCode = String(country.countryCode || COUNTRY_MAP[countryId] || '').toLowerCase();
    if (!countryCode) continue;
    if (ONLY_CTRY && countryCode !== ONLY_CTRY) continue;

    for (const city of country.cities || []) {
      for (const district of city.districts || []) {
        if (!district.districtId) continue;
        const slug = slugify(district.districtName);
        cities.push({
          country: countryCode,
          countryName: country.countryName,
          city: slug,
          cityName: district.districtName,
          districtId: parseInt(district.districtId, 10),
        });
      }
    }
  }
  return cities;
}

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .substring(0, 40);
}

async function getToken() {
  const res = await fetch(`${BASE}/Auth/Login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Email: EMAIL, Password: PASS }),
  });
  const d = await res.json();
  const t = d?.data?.accessToken || d?.Data?.AccessToken;
  if (!t) throw new Error('Login failed: ' + JSON.stringify(d).slice(0, 200));
  return t;
}

async function _doFetch(token, districtId) {
  let res;
  try {
    res = await fetch(`${BASE}/api/PrayerTime/DateRange`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        CityId: districtId,
        StartDate: `${YEAR}-01-01`,
        EndDate: `${YEAR}-12-31`,
      }),
    });
  } catch (err) {
    throw new Error(`Network: ${err.message}`);
  }

  if (res.status === 401) {
    return { status: 401, ok: false, data: null, text: '' };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { status: res.status, ok: false, data: null, text };
  }
  const json = await res.json();
  const data = json?.data || json?.Data || json;
  return { status: res.status, ok: true, data, text: '' };
}

async function fetchCity(districtId) {
  await ensureValidToken();

  let result = await _doFetch(currentToken, districtId);
  if (result.status === 401) {
    process.stdout.write('\n  HTTP 401 — forcing new token... ');
    applyNewToken(await getToken());
    tokenRefreshCount++;
    process.stdout.write('ok\n  ');
    result = await _doFetch(currentToken, districtId);
    if (result.status === 401) {
      throw new Error('401 after token refresh');
    }
  }
  if (!result.ok) {
    throw new Error(`${result.status}: ${(result.text || '').slice(0, 120)}`);
  }
  return result.data;
}

function save(country, city, districtId, days) {
  const dir = path.join(DATA, country);
  const file = path.join(dir, `${city}.json`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        _meta: {
          country,
          city,
          districtId,
          year: YEAR,
          fetchedAt: new Date().toISOString(),
          totalDays: days.length,
        },
        data: days,
      },
      null,
      2
    )
  );
  return file;
}

function fileExists(country, city) {
  return fs.existsSync(path.join(DATA, country, `${city}.json`));
}

function eta(done, total, startTime) {
  const elapsed = (Date.now() - startTime) / 1000;
  const rate = done / elapsed;
  const left = (total - done) / rate;
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

async function main() {
  if (!EMAIL || !PASS) {
    console.error('Missing DIYANET_EMAIL or DIYANET_PASS.');
    console.error('Add GitHub Actions secrets: Settings → Secrets and variables → Actions.');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('NAMAZ VAKIT — fetch-europe (countries-all / countries.json)');
  if (DRY_RUN) console.log('DRY RUN');
  if (REFETCH) console.log('REFETCH (overwrite existing)');
  console.log('='.repeat(60));

  const countriesData = loadCountriesJson();
  const allCities = buildCityList(countriesData);
  const toFetch = REFETCH ? allCities : allCities.filter(c => !fileExists(c.country, c.city));
  const skipped = allCities.length - toFetch.length;

  const byCountry = {};
  for (const c of toFetch) {
    byCountry[c.country] = (byCountry[c.country] || 0) + 1;
  }

  console.log(`Total cities:     ${allCities.length}`);
  console.log(`Already on disk:  ${skipped}`);
  console.log(`To fetch:         ${toFetch.length}`);
  console.log(`Rough time:       ~${Math.ceil((toFetch.length * DELAY) / 1000 / 60)} min\n`);

  if (toFetch.length > 0) {
    for (const [cc, count] of Object.entries(byCountry).sort()) {
      console.log(`  ${cc.toUpperCase().padEnd(4)} ${count}`);
    }
  }

  if (DRY_RUN || toFetch.length === 0) {
    console.log('\nDone (no fetch).');
    return;
  }

  const logFile = path.join(ROOT, 'europe-errors.log');
  console.log('\nLogging in...');
  applyNewToken(await getToken());
  tokenRefreshCount++;
  console.log(
    `Token OK (proactive refresh before JWT exp, plus retry on 401). Expiry ~${new Date(tokenExpiresAtMs).toISOString()}\n`
  );

  let ok = 0;
  let fail = 0;
  let lastCountry = '';
  const startTime = Date.now();

  for (let i = 0; i < toFetch.length; i++) {
    const c = toFetch[i];
    if (c.country !== lastCountry) {
      const pct = Math.round((i / toFetch.length) * 100);
      console.log(
        `\n${c.country.toUpperCase()} — ${c.countryName} [${pct}% | ETA: ${i > 0 ? eta(i, toFetch.length, startTime) : '?'}]`
      );
      lastCountry = c.country;
    }

    process.stdout.write(`  ${String(i + 1).padStart(5)}/${toFetch.length} ${c.city.padEnd(32)}... `);

    try {
      const days = await fetchCity(c.districtId);
      if (!Array.isArray(days) || days.length === 0) throw new Error('empty response');
      save(c.country, c.city, c.districtId, days);
      console.log(`ok ${days.length}d`);
      ok++;
    } catch (err) {
      console.log(`fail ${err.message.slice(0, 60)}`);
      fail++;
      const line = `${new Date().toISOString()} | ${c.country}/${c.city} (${c.districtId}): ${err.message}\n`;
      fs.appendFileSync(logFile, line);
    }

    if (i < toFetch.length - 1) {
      await new Promise(r => setTimeout(r, DELAY));
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 60000);
  console.log('\n' + '='.repeat(60));
  console.log(`OK: ${ok}  Fail: ${fail}  Token refreshes: ${tokenRefreshCount}  Minutes: ${elapsed}`);
  console.log('='.repeat(60));
  if (fail > 0) console.log(`See ${logFile} for failures.`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
