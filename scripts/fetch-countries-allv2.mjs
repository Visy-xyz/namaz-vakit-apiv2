#!/usr/bin/env node
/**
 * Fetches yearly prayer times from Diyanet for countries-allv2.json.
 *
 * Reads country/city/district IDs from a combined location file and writes:
 *   data/{countryCode}/{districtSlug}.json
 *
 * Safe/resumable behavior:
 *   - skips files that already exist unless --refetch is passed
 *   - fetches serially with a delay between requests
 *   - refreshes the auth token proactively and on HTTP 401
 *   - logs failures to countries-allv2-errors.log
 *
 * Required env:
 *   DIYANET_EMAIL
 *   DIYANET_PASS
 *
 * Usage:
 *   node scripts/fetch-countries-allv2.mjs
 *   node scripts/fetch-countries-allv2.mjs --file countries-allv2.json
 *   node scripts/fetch-countries-allv2.mjs --country af
 *   node scripts/fetch-countries-allv2.mjs --dry-run
 *   node scripts/fetch-countries-allv2.mjs --refetch
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

const BASE = 'https://awqatsalah.diyanet.gov.tr';
const EMAIL = process.env.DIYANET_EMAIL;
const PASS = process.env.DIYANET_PASS;

const args = process.argv.slice(2);
const INPUT_FILE = path.resolve(ROOT, argValue('--file') || 'countries-allv2.json');
const DRY_RUN = args.includes('--dry-run');
const REFETCH = args.includes('--refetch');
const ONLY_COUNTRY = argValue('--country');
const DELAY_MS = Number(argValue('--delay-ms') || 1200);
const YEAR = Number(argValue('--year') || new Date().getFullYear());
const LOG_FILE = path.join(ROOT, 'countries-allv2-errors.log');

let currentToken = null;
let tokenRefreshCount = 0;
let tokenExpiresAtMs = 0;

function argValue(name) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50);
}

function loadCountries() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Missing input JSON: ${INPUT_FILE}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  if (!Array.isArray(raw)) {
    console.error('Input JSON must be an array of countries.');
    process.exit(1);
  }

  return raw;
}

function buildTargets(countries) {
  const targets = [];
  const seenByCountry = new Map();

  for (const country of countries) {
    const countryCode = String(country.countryCode || '').toLowerCase();
    if (!countryCode) {
      console.warn(`Skipping country without countryCode: ${country.countryName} (${country.countryId})`);
      continue;
    }
    if (ONLY_COUNTRY && countryCode !== ONLY_COUNTRY.toLowerCase()) continue;

    const seenSlugs = seenByCountry.get(countryCode) || new Set();
    seenByCountry.set(countryCode, seenSlugs);

    for (const city of country.cities || []) {
      for (const district of city.districts || []) {
        const districtId = String(district.districtId || '').trim();
        if (!districtId) continue;

        const baseSlug = slugify(district.districtName || district.districtNameTr || districtId);
        let slug = baseSlug || `district_${districtId}`;
        if (seenSlugs.has(slug)) slug = `${slug}_${districtId}`;
        seenSlugs.add(slug);

        targets.push({
          country: countryCode,
          countryName: country.countryName,
          countryNameTr: country.countryNameTr,
          countryId: String(country.countryId || ''),
          cityGroup: city.cityName,
          cityGroupTr: city.cityNameTr,
          cityId: String(city.cityId || ''),
          city: slug,
          cityName: district.districtName || district.districtNameTr || slug,
          cityNameTr: district.districtNameTr || district.districtName || slug,
          districtId,
        });
      }
    }
  }

  return targets.sort((a, b) =>
    a.country !== b.country ? a.country.localeCompare(b.country) : a.city.localeCompare(b.city)
  );
}

function filePathFor(target) {
  return path.join(DATA, target.country, `${target.city}.json`);
}

function fileExists(target) {
  return fs.existsSync(filePathFor(target));
}

function readJwtExpMs(token) {
  try {
    const parts = String(token).split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (typeof payload.exp === 'number') return payload.exp * 1000;
  } catch {
    return null;
  }
  return null;
}

function applyNewToken(token) {
  currentToken = token;
  tokenRefreshCount++;
  tokenExpiresAtMs = readJwtExpMs(token) || Date.now() + 40 * 60 * 1000;
}

async function getToken() {
  const res = await fetch(`${BASE}/Auth/Login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Email: EMAIL, Password: PASS }),
  });

  const body = await res.json().catch(() => null);
  const token = body?.data?.accessToken || body?.Data?.AccessToken;
  if (!token) throw new Error(`Login failed: ${JSON.stringify(body).slice(0, 200)}`);
  return token;
}

async function ensureValidToken() {
  const refreshBeforeMs = 2 * 60 * 1000;
  if (!currentToken || Date.now() >= tokenExpiresAtMs - refreshBeforeMs) {
    process.stdout.write('\n  Refreshing token... ');
    applyNewToken(await getToken());
    process.stdout.write('ok\n  ');
  }
}

async function doFetch(districtId) {
  const cityId = /^\d+$/.test(String(districtId)) ? Number(districtId) : districtId;
  let res;

  try {
    res = await fetch(`${BASE}/api/PrayerTime/DateRange`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${currentToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        CityId: cityId,
        StartDate: `${YEAR}-01-01`,
        EndDate: `${YEAR}-12-31`,
      }),
    });
  } catch (err) {
    throw new Error(`Network: ${err.message}`);
  }

  if (res.status === 401) return { status: 401, ok: false, data: null, text: '' };
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { status: res.status, ok: false, data: null, text };
  }

  const json = await res.json();
  return {
    status: res.status,
    ok: true,
    data: json?.data || json?.Data || json,
    text: '',
  };
}

async function fetchYear(districtId) {
  await ensureValidToken();

  let result = await doFetch(districtId);
  if (result.status === 401) {
    process.stdout.write('\n  Token expired (401), refreshing... ');
    applyNewToken(await getToken());
    process.stdout.write('ok\n  ');
    result = await doFetch(districtId);
    if (result.status === 401) throw new Error('401 after token refresh');
  }

  if (!result.ok) throw new Error(`${result.status}: ${(result.text || '').slice(0, 120)}`);
  return result.data;
}

function saveTarget(target, days) {
  const file = filePathFor(target);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        _meta: {
          country: target.country,
          countryName: target.countryName,
          countryNameTr: target.countryNameTr,
          countryId: target.countryId,
          city: target.city,
          cityName: target.cityName,
          cityNameTr: target.cityNameTr,
          cityGroup: target.cityGroup,
          cityGroupTr: target.cityGroupTr,
          cityId: target.cityId,
          districtId: target.districtId,
          year: YEAR,
          fetchedAt: new Date().toISOString(),
          totalDays: days.length,
          source: 'countries-allv2.json',
        },
        data: days,
      },
      null,
      2
    )
  );
}

function eta(done, total, startTime) {
  if (done <= 0) return '?';
  const elapsed = (Date.now() - startTime) / 1000;
  const rate = done / elapsed;
  const left = (total - done) / rate;
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

async function main() {
  console.log('='.repeat(60));
  console.log(`NAMAZ VAKIT - countries-allv2 fetch (${YEAR})`);
  console.log(`Input: ${INPUT_FILE}`);
  console.log(`Output: ${DATA}`);
  if (DRY_RUN) console.log('DRY RUN');
  if (REFETCH) console.log('REFETCH: existing files will be overwritten');
  if (ONLY_COUNTRY) console.log(`Country filter: ${ONLY_COUNTRY.toLowerCase()}`);
  console.log('='.repeat(60));

  const countries = loadCountries();
  const targets = buildTargets(countries);
  const toFetch = REFETCH ? targets : targets.filter(target => !fileExists(target));
  const skipped = targets.length - toFetch.length;

  const byCountry = {};
  for (const target of toFetch) {
    byCountry[target.country] = (byCountry[target.country] || 0) + 1;
  }

  console.log(`Total districts: ${targets.length}`);
  console.log(`Existing skip:   ${skipped}`);
  console.log(`To fetch:        ${toFetch.length}`);
  console.log(`Delay:           ${DELAY_MS}ms`);
  console.log(`Rough time:      ~${Math.ceil((toFetch.length * DELAY_MS) / 1000 / 60)} min\n`);

  for (const [country, count] of Object.entries(byCountry).sort()) {
    console.log(`  ${country.toUpperCase().padEnd(8)} ${count}`);
  }

  if (DRY_RUN || toFetch.length === 0) {
    console.log('\nDone. No fetch performed.');
    return;
  }

  if (!EMAIL || !PASS) {
    console.error('\nMissing DIYANET_EMAIL or DIYANET_PASS environment variables.');
    process.exit(1);
  }

  console.log('\nLogging in...');
  applyNewToken(await getToken());
  console.log('Token OK\n');

  let ok = 0;
  let fail = 0;
  let lastCountry = '';
  const startTime = Date.now();

  for (let i = 0; i < toFetch.length; i++) {
    const target = toFetch[i];
    if (target.country !== lastCountry) {
      const pct = Math.round((i / toFetch.length) * 100);
      console.log(
        `\n${target.country.toUpperCase()} - ${target.countryName} [${pct}% | ETA: ${eta(i, toFetch.length, startTime)}]`
      );
      lastCountry = target.country;
    }

    process.stdout.write(
      `  ${String(i + 1).padStart(5)}/${toFetch.length} ${target.city.padEnd(34)} `
    );

    try {
      const days = await fetchYear(target.districtId);
      if (!Array.isArray(days) || days.length === 0) throw new Error('empty response');
      saveTarget(target, days);
      console.log(`ok ${days.length}d`);
      ok++;
    } catch (err) {
      console.log(`fail ${err.message.slice(0, 80)}`);
      fail++;
      fs.appendFileSync(
        LOG_FILE,
        `${new Date().toISOString()} | ${target.country}/${target.city} (${target.districtId}): ${err.message}\n`
      );
    }

    if (i < toFetch.length - 1) await sleep(DELAY_MS);
  }

  const elapsed = Math.round((Date.now() - startTime) / 60000);
  console.log('\n' + '='.repeat(60));
  console.log(`OK: ${ok}`);
  console.log(`Failed: ${fail}${fail > 0 ? ` (see ${LOG_FILE})` : ''}`);
  console.log(`Token refreshes: ${tokenRefreshCount}`);
  console.log(`Minutes: ${elapsed}`);
  console.log('='.repeat(60));

  if (fail > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
