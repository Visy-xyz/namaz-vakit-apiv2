#!/usr/bin/env node
/**
 * verify.mjs — data integrity check for all city JSON files
 *
 * Usage:
 *   node scripts/verify.mjs               → checks all data/{country}/{city}.json
 *   node scripts/verify.mjs --country al  → single country
 *   node scripts/verify.mjs --verbose     → print every issue, not just summaries
 *   node scripts/verify.mjs --fail-fast   → stop after first failing city
 *   node scripts/verify.mjs --year 2027   → also assert every file covers 2027
 *   node scripts/verify.mjs --quiet       → print failures and the summary only
 *
 * --year is what makes the yearly refresh trustworthy: without it a run that
 * fetched nothing still "passes", because last year's data is perfectly valid
 * data — just for the wrong year.
 *
 * Exit code 0 = all clean, 1 = one or more failures.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.join(__dirname, '..');
const DATA_DIR  = path.join(ROOT, 'data');

const args        = process.argv.slice(2);
const VERBOSE     = args.includes('--verbose');
const FAIL_FAST   = args.includes('--fail-fast');
const ONLY_COUNTRY = (() => { const i = args.indexOf('--country'); return i !== -1 ? args[i + 1] : null; })();
const QUIET       = args.includes('--quiet');
const EXPECT_YEAR = (() => {
  const i = args.indexOf('--year');
  if (i === -1) return null;
  const n = Number(args[i + 1]);
  if (!Number.isInteger(n) || n < 2000 || n > 2100) {
    console.error(`--year needs a 4-digit year, got "${args[i + 1]}"`);
    process.exit(1);
  }
  return n;
})();

const TIME_RE = /^\d{2}:\d{2}$/;
const PRAYER_FIELDS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

// Countries at extreme latitudes where prayer ordering rules break down (Fajr/Isha may not exist)
const EXTREME_LATITUDE = new Set(['fi', 'no', 'se', 'dk', 'is', 'sj']);

// Diyanet's marker for "the sun does not set today" (polar summer), seen as
// `maghrib: "1.00:"` from May to July in Inuvik, Galena and the like. The
// winter counterpart is `sunrise: "00:00"`, handled in checkOrder. Neither is
// corrupt data; both simply mean the prayer has no astronomical time that day.
const POLAR_NO_SUNSET_RE = /^\d+\.\d{2}:$/;

// ─── helpers ──────────────────────────────────────────────────────────────────

function dayDateKey(day) {
  if (!day || typeof day !== 'object') return null;

  const raw = typeof day.date === 'string' ? day.date.trim() : '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

  const longIso = day.gregorianDateLongIso8601;
  if (typeof longIso === 'string') {
    const m = longIso.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }

  const ddmmyyyy = (s) => {
    if (typeof s !== 'string' || !/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(s)) return null;
    const [dd, mm, yyyy] = s.split('.');
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  };

  return ddmmyyyy(day.gregorianDateShortIso8601) || ddmmyyyy(day.gregorianDateShort) || null;
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function checkOrder(day, country) {
  if (EXTREME_LATITUDE.has(country)) return [];

  // Diyanet encodes "no sunrise" (polar winter) as "00:00" — skip ordering for this row
  if (day.sunrise === '00:00') return [];

  const issues = [];

  // Fajr and Isha can cross midnight at high latitudes in summer — allow midnight wrap for both
  const tSunrise = toMinutes(day.sunrise);
  let tFajr = toMinutes(day.fajr);
  if (tFajr > tSunrise) tFajr -= 1440; // fajr is "previous night", before sunrise
  if (tFajr >= tSunrise) issues.push(`fajr(${day.fajr}) >= sunrise(${day.sunrise})`);

  const pairs = [
    ['sunrise', 'dhuhr'],
    ['dhuhr', 'asr'],
    ['asr', 'maghrib'],
  ];
  for (const [a, b] of pairs) {
    const ta = toMinutes(day[a]);
    const tb = toMinutes(day[b]);
    // Equality is tolerated only for dhuhr -> asr: in polar winter the sun
    // barely clears the horizon and asr legitimately falls in the same minute
    // as dhuhr (Murmansk, Norilsk, Salekhard). Anywhere else, equal is wrong.
    const equalAllowed = a === 'dhuhr' && b === 'asr';
    if (ta > tb || (ta === tb && !equalAllowed)) {
      issues.push(`${a}(${day[a]}) >= ${b}(${day[b]})`);
    }
  }

  // Isha vs Maghrib: allow midnight wrap
  const tMaghrib = toMinutes(day.maghrib);
  let tIsha = toMinutes(day.isha);
  if (tIsha < tMaghrib) tIsha += 1440;
  if (tMaghrib >= tIsha) issues.push(`maghrib(${day.maghrib}) >= isha(${day.isha})`);

  return issues;
}

// ─── per-file check ───────────────────────────────────────────────────────────

function checkFile(filePath, country) {
  const issues = [];
  let parsed;

  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return { issues: [`PARSE ERROR: ${e.message}`], quality: [] };
  }

  // _meta
  const meta = parsed._meta;
  if (!meta || typeof meta !== 'object') {
    issues.push('missing _meta');
  } else {
    for (const f of ['country', 'city', 'year', 'fetchedAt', 'totalDays']) {
      if (meta[f] == null) issues.push(`_meta.${f} missing`);
    }
    if (EXPECT_YEAR != null) {
      // Assert the year is actually in the rows. Trusting `_meta.year` alone
      // would pass a file whose metadata was updated but whose days were not.
      const yearsPresent = new Set(
        (Array.isArray(parsed.data) ? parsed.data : [])
          .map(d => dayDateKey(d))
          .filter(Boolean)
          .map(k => Number(k.slice(0, 4)))
      );
      if (!yearsPresent.has(EXPECT_YEAR)) {
        issues.push(
          `STALE: no ${EXPECT_YEAR} days in this file (has: ${[...yearsPresent].sort().join(', ') || 'none'}) — it was not refreshed`
        );
      }
    }
  }

  // data array
  const rows = parsed.data;
  if (!Array.isArray(rows) || rows.length === 0) {
    issues.push('data array missing or empty');
    return { issues, quality: [] };
  }

  // totalDays matches
  if (meta?.totalDays != null && meta.totalDays !== rows.length) {
    issues.push(`_meta.totalDays=${meta.totalDays} but data has ${rows.length} rows`);
  }

  // Files carry the current calendar year and anything newer, so the total is a
  // multiple of a year rather than a fixed 365. Check each year individually.
  const daysPerYear = new Map();
  for (const row of rows) {
    const key = dayDateKey(row);
    if (!key) continue;
    const y = Number(key.slice(0, 4));
    daysPerYear.set(y, (daysPerYear.get(y) || 0) + 1);
  }
  if (daysPerYear.size === 0) {
    issues.push('no dateable rows');
  } else if (daysPerYear.size > 2) {
    issues.push(`covers ${daysPerYear.size} years (${[...daysPerYear.keys()].sort().join(', ')}) — expected at most 2`);
  }
  for (const [year, count] of [...daysPerYear.entries()].sort()) {
    if (count < 365 || count > 366) {
      issues.push(`year ${year} has ${count} days (expected 365 or 366)`);
    }
  }

  // per-row checks
  const seenDates = new Map();
  const sortedDates = [];
  let nullTimeCount = 0;
  let badFormatCount = 0;
  let orderIssueCount = 0;
  let polarDayCount = 0;
  const isPolar = rows.some(r =>
    POLAR_NO_SUNSET_RE.test(String(r?.maghrib ?? '')) || r?.sunrise === '00:00'
  );
  let undateableCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const dateKey = dayDateKey(row);

    if (!dateKey) {
      undateableCount++;
      if (VERBOSE) issues.push(`row[${i}]: cannot parse date`);
      continue;
    }

    if (seenDates.has(dateKey)) {
      issues.push(`duplicate date ${dateKey} at rows ${seenDates.get(dateKey)} and ${i}`);
    } else {
      seenDates.set(dateKey, i);
      sortedDates.push(dateKey);
    }

    // prayer time fields
    let rowBad = false;
    for (const f of PRAYER_FIELDS) {
      const v = row[f];
      if (v == null || v === '') {
        nullTimeCount++;
        rowBad = true;
        if (VERBOSE) issues.push(`row[${i}] ${dateKey}: ${f} is null/empty`);
      } else if (POLAR_NO_SUNSET_RE.test(String(v))) {
        // No sunset that day: not a format error, but ordering is meaningless.
        polarDayCount++;
        rowBad = true;
      } else if (!TIME_RE.test(String(v))) {
        badFormatCount++;
        rowBad = true;
        if (VERBOSE) issues.push(`row[${i}] ${dateKey}: ${f}="${v}" not HH:MM`);
      }
    }

    // ordering — a city with midnight sun anywhere in the year is extreme
    // latitude by definition, so its ordering near those dates is unreliable
    // (isha past midnight etc.), exactly like the Scandinavian countries above.
    if (!rowBad && !isPolar) {
      const orderIssues = checkOrder(row, country);
      if (orderIssues.length) {
        orderIssueCount++;
        if (VERBOSE) issues.push(`row[${i}] ${dateKey}: order violation — ${orderIssues.join(', ')}`);
      }
    }
  }

  // Row-level defects are reported separately from blocking problems. A few
  // bad rows in one city are an upstream (Diyanet) data bug the API already
  // contains — it answers 503 for that day only — and must not stop the
  // yearly refresh for every other city. They only fail the run in bulk,
  // which would mean the upstream format changed.
  const quality = [];
  if (undateableCount)   quality.push(`${undateableCount} rows with unparseable date`);
  if (nullTimeCount)     quality.push(`${nullTimeCount} null/empty prayer time values`);
  if (badFormatCount)    quality.push(`${badFormatCount} prayer times not in HH:MM format`);
  // polarDayCount is deliberately not reported: it is expected for arctic cities.
  if (orderIssueCount)   quality.push(`${orderIssueCount} rows with prayer time ordering violations`);

  // date gap check (are dates consecutive?)
  if (sortedDates.length > 1) {
    sortedDates.sort();
    let gaps = 0;
    for (let i = 1; i < sortedDates.length; i++) {
      const prev = new Date(sortedDates[i - 1]);
      const curr = new Date(sortedDates[i]);
      const diffDays = (curr - prev) / 86400000;
      if (diffDays !== 1) {
        gaps++;
        if (VERBOSE || gaps <= 3) issues.push(`gap between ${sortedDates[i - 1]} and ${sortedDates[i]} (${diffDays} days)`);
      }
    }
    if (!VERBOSE && gaps > 3) issues.push(`... and ${gaps - 3} more date gaps`);
  }

  return { issues, quality };
}

// ─── main ─────────────────────────────────────────────────────────────────────

function collectFiles() {
  const files = [];
  const countries = fs.readdirSync(DATA_DIR).filter(n => {
    if (ONLY_COUNTRY && n !== ONLY_COUNTRY) return false;
    const full = path.join(DATA_DIR, n);
    return fs.statSync(full).isDirectory();
  });

  for (const country of countries.sort()) {
    const dir = path.join(DATA_DIR, country);
    const cityFiles = fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .sort()
      .map(f => ({ filePath: path.join(dir, f), country, city: f.replace('.json', '') }));
    files.push(...cityFiles);
  }
  return files;
}

function main() {
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`data/ directory not found at ${DATA_DIR}`);
    process.exit(1);
  }

  const files = collectFiles();
  if (files.length === 0) {
    console.error('No city JSON files found' + (ONLY_COUNTRY ? ` for country "${ONLY_COUNTRY}"` : ''));
    process.exit(1);
  }

  console.log(`\nNAMAZ VAKIT — DATA INTEGRITY CHECK`);
  console.log(`Checking ${files.length} city files across ${new Set(files.map(f => f.country)).size} countries\n`);

  let passed = 0;
  let failed = 0;
  let degraded = 0;
  let lastCountry = '';
  const failedFiles = [];
  const degradedFiles = [];

  for (const { filePath, country, city } of files) {
    if (country !== lastCountry) {
      if (!QUIET) {
        if (lastCountry) console.log('');
        console.log(`  [${country.toUpperCase()}]`);
      }
      lastCountry = country;
    }

    const { issues, quality } = checkFile(filePath, country);

    if (issues.length === 0 && quality.length === 0) {
      if (!QUIET) process.stdout.write(`    ✓ ${city}\n`);
      passed++;
    } else if (issues.length === 0) {
      process.stdout.write(`    △ ${city}\n`);
      for (const q of quality) process.stdout.write(`        ~ ${q}\n`);
      degraded++;
      degradedFiles.push(`${country}/${city}`);
    } else {
      process.stdout.write(`    ✗ ${city}\n`);
      for (const issue of issues) {
        process.stdout.write(`        ! ${issue}\n`);
      }
      failed++;
      failedFiles.push(`${country}/${city}`);
      if (FAIL_FAST) break;
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  // Blocking failures always fail the run. Row-level defects fail it only in
  // bulk: more than 1% of files (min 5) points at an upstream format change.
  const degradedLimit = Math.max(5, Math.ceil(files.length * 0.01));
  const tooManyDegraded = degraded > degradedLimit;

  console.log(`  Checked  : ${files.length}`);
  console.log(`  Passed   : ${passed}`);
  console.log(`  Degraded : ${degraded}  (upstream data defects; limit ${degradedLimit})`);
  console.log(`  Failed   : ${failed}`);

  if (degradedFiles.length) {
    console.log(`\n  Degraded files (bad rows; the API answers 503 for those days only):`);
    for (const f of degradedFiles) console.log(`    ~ ${f}`);
  }

  if (failedFiles.length) {
    console.log(`\n  Failed files:`);
    for (const f of failedFiles) console.log(`    • ${f}`);
  }

  console.log('');
  process.exit(failed > 0 || tooManyDegraded ? 1 : 0);
}

main();
