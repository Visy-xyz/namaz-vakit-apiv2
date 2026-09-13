import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import handler from '../api/prayer.js';
import { _resetRateLimiter } from '../lib/rateLimiter.js';

/**
 * Discovered rather than hard-coded so this file stays identical between the
 * v1 and v2 repos, which ship completely different country catalogs.
 */
const { COUNTRY, CITY } = (() => {
  const dataDir = path.join(process.cwd(), 'data');
  for (const entry of fs.readdirSync(dataDir).sort()) {
    const dir = path.join(dataDir, entry);
    if (!fs.statSync(dir).isDirectory()) continue;
    const city = fs.readdirSync(dir).find(f => f.endsWith('.json'));
    if (city) return { COUNTRY: entry.toLowerCase(), CITY: city.replace(/\.json$/i, '') };
  }
  throw new Error('no city fixtures found under data/');
})();

/** A date we know is inside the shipped data, whatever year it was built for. */
function aCoveredDate() {
  const file = path.join(process.cwd(), 'data', COUNTRY, `${CITY}.json`);
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const short = parsed.data[0].gregorianDateShort; // DD.MM.YYYY
  const [dd, mm, yyyy] = short.split('.');
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

function mockRes() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = String(v); },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

async function call(query) {
  _resetRateLimiter();
  const qs = new URLSearchParams(query).toString();
  const res = mockRes();
  await handler({ method: 'GET', url: `/api/prayer?${qs}`, headers: {}, socket: {} }, res);
  return res;
}

test('returns times for a covered date', async () => {
  const res = await call({ country: COUNTRY, city: CITY, date: aCoveredDate() });
  assert.equal(res.statusCode, 200);
  assert.match(res.body.times.fajr, /^\d{2}:\d{2}$/);
  assert.match(res.body.times.maghrib, /^\d{2}:\d{2}$/);
  assert.equal(res.headers['cache-control'], 'public, max-age=3600');
});

test('always includes detail — released app builds read hijri/moon from it', async () => {
  const res = await call({ country: COUNTRY, city: CITY, date: aCoveredDate() });
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.detail, 'detail must be present without ?detail=true');
  assert.ok(res.body.detail.hijriDateLong);
  assert.equal(res.body.hijriDate, res.body.detail.hijriDateLong);
});

test('an uncovered date 404s instead of serving the previous year', async () => {
  // The old v1 handler silently returned the same calendar day a year earlier.
  // Prayer times drift by minutes and the hijri date by ~11 days, so stale data
  // must never be presented as current.
  const covered = aCoveredDate();
  const nextYear = `${Number(covered.slice(0, 4)) + 1}${covered.slice(4)}`;

  const res = await call({ country: COUNTRY, city: CITY, date: nextYear });

  assert.equal(res.statusCode, 404);
  assert.match(res.body.error, /No data for/);
  assert.ok(res.body.coverage, 'the 404 should say what range is available');
  assert.equal(res.body.approximate, undefined, 'must not return approximate times');
  assert.equal(res.body.times, undefined, 'must not return times at all');
});

test('error responses are not cached', async () => {
  const res = await call({ country: COUNTRY, city: CITY, date: '1999-01-01' });
  assert.equal(res.statusCode, 404);
  assert.equal(res.headers['cache-control'], 'no-store');
});

test('unknown city 404s without caching', async () => {
  const res = await call({ country: COUNTRY, city: 'nosuchcity' });
  assert.equal(res.statusCode, 404);
  assert.match(res.body.error, /City not found/);
  assert.equal(res.headers['cache-control'], 'no-store');
});

test('a traversal attempt is rejected as a bad request', async () => {
  const res = await call({ country: COUNTRY, city: '../../../etc/passwd' });
  assert.equal(res.statusCode, 400);
  assert.equal(res.headers['cache-control'], 'no-store');
});

test('OPTIONS preflight returns 204 with CORS headers', async () => {
  _resetRateLimiter();
  const res = mockRes();
  await handler({ method: 'OPTIONS', url: '/api/prayer', headers: {}, socket: {} }, res);
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['access-control-allow-origin'], '*');
});

test('omitting date resolves against the city timezone, not server UTC', async () => {
  const res = await call({ country: COUNTRY, city: CITY });
  // Data may have expired (then 404 is correct); when it has not, the resolved
  // date must be today UTC or one day either side — never further adrift.
  if (res.statusCode === 200) {
    const utcToday = new Date().toISOString().slice(0, 10);
    const diffDays = Math.abs(
      (Date.parse(`${res.body.date}T00:00:00Z`) - Date.parse(`${utcToday}T00:00:00Z`)) / 86400000
    );
    assert.ok(diffDays <= 1, `resolved ${res.body.date} against UTC ${utcToday}`);
  } else {
    assert.equal(res.statusCode, 404);
  }
});
