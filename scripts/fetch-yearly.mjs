#!/usr/bin/env node
/**
 * fetch-yearly.mjs — refreshes every city JSON under data/ that includes _meta.districtId
 * (Diyanet district id). Used when countries-all.json is absent (see yearly-refresh workflow).
 *
 * Env: DIYANET_EMAIL, DIYANET_PASS
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(__dirname, '..', 'data');

const EMAIL = process.env.DIYANET_EMAIL;
const PASS = process.env.DIYANET_PASS;
const BASE = 'https://awqatsalah.diyanet.gov.tr';
const YEAR = new Date().getFullYear();
const DELAY_MS = 1200;

/** @returns {{ country: string, city: string, districtId: string, filePath: string }[]} */
function collectTargets() {
  const targets = [];
  if (!fs.existsSync(DATA)) return targets;

  for (const dirName of fs.readdirSync(DATA)) {
    if (dirName.startsWith('.')) continue;
    const dir = path.join(DATA, dirName);
    if (!fs.statSync(dir).isDirectory()) continue;

    const country = dirName.toLowerCase();
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const slug = f.replace(/\.json$/i, '');
      const filePath = path.join(dir, f);
      let raw;
      try {
        raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch {
        continue;
      }
      const districtId = raw?._meta?.districtId;
      if (districtId == null || String(districtId).trim() === '') continue;
      targets.push({
        country,
        city: slug,
        districtId: String(districtId),
        filePath,
      });
    }
  }

  targets.sort((a, b) =>
    a.country !== b.country ? a.country.localeCompare(b.country) : a.city.localeCompare(b.city)
  );
  return targets;
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

async function fetchYear(token, districtId) {
  const id = /^\d+$/.test(String(districtId)) ? Number(districtId) : districtId;
  const res = await fetch(`${BASE}/api/PrayerTime/DateRange`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      CityId: id,
      StartDate: `${YEAR}-01-01`,
      EndDate: `${YEAR}-12-31`,
    }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 100)}`);
  const data = await res.json();
  return data?.data || data?.Data || data;
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
          districtId: String(districtId),
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
}

async function main() {
  if (!EMAIL || !PASS) {
    console.error('Missing DIYANET_EMAIL or DIYANET_PASS.');
    process.exit(1);
  }

  const targets = collectTargets();
  console.log(`\nNAMAZ VAKIT — yearly refresh from data/ (${YEAR})`);
  console.log(`📋 ${targets.length} files with _meta.districtId\n`);

  if (targets.length === 0) {
    console.error('No city JSON files under data/ contain _meta.districtId. Nothing to refresh.');
    process.exit(1);
  }

  const token = await getToken();
  console.log('✅ Login OK\n');

  let ok = 0;
  let fail = 0;
  let lastCountry = '';

  for (const c of targets) {
    if (c.country !== lastCountry) {
      console.log(`\n── ${c.country.toUpperCase()} ──`);
      lastCountry = c.country;
    }
    process.stdout.write(`  ${c.city.padEnd(22)} `);
    try {
      const days = await fetchYear(token, c.districtId);
      if (!Array.isArray(days) || days.length === 0) throw new Error('empty response');
      save(c.country, c.city, c.districtId, days);
      console.log(`✅ ${days.length} days`);
      ok++;
    } catch (err) {
      console.log(`❌ ${err.message}`);
      fail++;
    }
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  console.log(`\n${'═'.repeat(40)}`);
  console.log(`✅ OK: ${ok}  |  ❌ Failed: ${fail}`);

  if (fail > 0) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
