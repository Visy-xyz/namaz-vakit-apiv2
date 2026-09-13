#!/usr/bin/env node
/**
 * probe-year.mjs — does Diyanet serve a given year yet?
 *
 *   node scripts/probe-year.mjs --year 2027
 *   node scripts/probe-year.mjs --year 2027 --control
 *
 * The yearly refresh is scheduled in December, which assumes Diyanet publishes
 * the next year before it starts. That is not documented anywhere, so check it
 * rather than find out on 1 January.
 *
 * Spends ONE DateRange request (two with --control, which also probes the
 * current year to prove the credentials and district are good). Prints day
 * counts and dates only — never the credentials or the token.
 *
 * Credentials come from DIYANET_EMAIL / DIYANET_PASS in the environment, or
 * from .env.local (git-ignored) if they are not already set.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const BASE = 'https://awqatsalah.diyanet.gov.tr';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const WITH_CONTROL = args.includes('--control');
const YEAR = (() => {
  const i = args.indexOf('--year');
  const n = Number(i === -1 ? NaN : args[i + 1]);
  if (!Number.isInteger(n) || n < 2000 || n > 2100) {
    console.error('Usage: node scripts/probe-year.mjs --year 2027 [--control]');
    process.exit(1);
  }
  return n;
})();

/** Fills process.env from .env.local without echoing any value. */
function loadEnvLocal() {
  const file = path.join(ROOT, '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    if (process.env[key]) continue;
    process.env[key] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

/** Any real districtId, so the probe does not depend on a hard-coded city. */
function findDistrictId() {
  for (const name of ['countries-allv2.json', 'countries-all.json', 'countries.json']) {
    const file = path.join(ROOT, name);
    if (!fs.existsSync(file)) continue;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const list = Array.isArray(parsed) ? parsed : parsed?.countries || [];
    for (const country of list) {
      for (const city of country.cities || []) {
        for (const district of city.districts || []) {
          if (district.districtId) {
            return { id: Number(district.districtId), label: `${district.districtName} (${country.countryName})`, from: name };
          }
        }
      }
    }
  }

  // Fall back to a districtId recorded in an already-fetched city file.
  const dataDir = path.join(ROOT, 'data');
  for (const entry of fs.readdirSync(dataDir).sort()) {
    const dir = path.join(dataDir, entry);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir).slice(0, 1)) {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))._meta;
      if (meta?.districtId) {
        return { id: Number(meta.districtId), label: `${meta.cityName || meta.city} (${meta.country})`, from: `data/${entry}/${f}` };
      }
    }
  }
  throw new Error('could not find any districtId to probe with');
}

async function login(email, pass) {
  const res = await fetch(`${BASE}/Auth/Login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Email: email, Password: pass }),
  });
  const body = await res.json().catch(() => null);
  const token = body?.data?.accessToken || body?.Data?.AccessToken;
  if (!token) throw new Error(`login failed (HTTP ${res.status})`);
  return token;
}

async function probe(token, districtId, year) {
  const res = await fetch(`${BASE}/api/PrayerTime/DateRange`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ CityId: districtId, StartDate: `${year}-01-01`, EndDate: `${year}-12-31` }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, status: res.status, detail: text.slice(0, 300) };
  }

  const body = await res.json().catch(() => null);
  const days = body?.data || body?.Data || [];
  if (!Array.isArray(days) || days.length === 0) {
    return { ok: false, status: res.status, detail: 'empty data array' };
  }
  const dateOf = d => String(d.gregorianDateShort || d.GregorianDateShort || '');
  return { ok: true, days: days.length, first: dateOf(days[0]), last: dateOf(days[days.length - 1]) };
}

async function reportQuota(token) {
  try {
    const res = await fetch(`${BASE}/api/Quota/My`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const body = await res.json().catch(() => null);
    if (body) console.log('Quota:', JSON.stringify(body?.data ?? body).slice(0, 400));
  } catch {
    /* informational only */
  }
}

async function main() {
  loadEnvLocal();
  const email = process.env.DIYANET_EMAIL;
  const pass = process.env.DIYANET_PASS;
  if (!email || !pass) {
    console.error('Missing DIYANET_EMAIL / DIYANET_PASS.');
    console.error('Set them in the environment, or add them to .env.local (git-ignored).');
    process.exit(1);
  }

  const district = findDistrictId();
  console.log(`Probing district ${district.id} — ${district.label}  [via ${district.from}]\n`);

  const token = await login(email, pass);
  console.log('Login OK\n');

  if (WITH_CONTROL) {
    const control = new Date().getFullYear();
    const r = await probe(token, district.id, control);
    console.log(
      r.ok
        ? `CONTROL ${control}: ${r.days} days (${r.first} -> ${r.last})`
        : `CONTROL ${control}: FAILED (HTTP ${r.status}) ${r.detail}`
    );
  }

  const result = await probe(token, district.id, YEAR);
  console.log(
    result.ok
      ? `TARGET  ${YEAR}: ${result.days} days (${result.first} -> ${result.last})`
      : `TARGET  ${YEAR}: NOT AVAILABLE (HTTP ${result.status}) ${result.detail}`
  );

  await reportQuota(token);

  console.log(
    result.ok && result.days >= 365
      ? `\n=> Diyanet already serves ${YEAR}. The December refresh will work.`
      : `\n=> Diyanet does NOT serve ${YEAR} yet. The December run will fail and the 20 Dec / 2 Jan retries will pick it up.`
  );
  process.exit(result.ok ? 0 : 2);
}

main().catch(err => {
  console.error('Probe failed:', err.message);
  process.exit(1);
});
