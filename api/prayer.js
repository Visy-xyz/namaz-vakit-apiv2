import { getQuery } from '../lib/query.js';
import { dayDateKey, coverageRange } from '../lib/dayDate.js';
import { normalizeYmd } from '../lib/dateParams.js';
import { displayCityName } from '../lib/cityNormalizations.js';
import { readCityJson, dataBaseUrlHint } from '../lib/readCityData.js';
import { invalidFields } from '../lib/validateCityData.js';
import { checkRateLimit, clientIp } from '../lib/rateLimiter.js';

/**
 * GET /api/prayer?country=af&city=calalabad
 * GET /api/prayer?country=af&city=calalabad&date=2026-04-25
 *
 * Returns prayer times for a specific city and date.
 * `times` is a short subset; `detail` is the full Diyanet row from the JSON file.
 * `fileMeta` is the file’s `_meta` object (country, year, totalDays, fetchedAt, …).
 * Reads from cached JSON — ZERO calls to Diyanet. On Vercel, JSON is loaded from DATA_BASE_URL.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    return res.status(204).end();
  }

  const rl = checkRateLimit(clientIp(req), 'prayer', 300);
  res.setHeader('X-RateLimit-Remaining', rl.remaining);
  if (rl.limited) {
    res.setHeader('Retry-After', Math.ceil((rl.resetAt - Date.now()) / 1000));
    return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
  }

  const q = getQuery(req);
  const cc = (q.country || '').toLowerCase();
  const slug = (q.city || '').toLowerCase();
  const date = q.date;
  const withDetail = q.detail === 'true';

  if (!cc || !slug) {
    return res.status(400).json({
      error: 'Missing params',
      example: '/api/prayer?country=af&city=calalabad',
      hint: 'List cities: GET /api/cities or /api/cities?country=us',
    });
  }

  if (!/^[a-z]{2}$/.test(cc)) {
    return res.status(400).json({ error: 'Invalid country code. Expected 2-letter ISO code, e.g. "af".' });
  }

  if (!/^[a-z0-9_-]+$/.test(slug)) {
    return res.status(400).json({ error: 'Invalid city slug. Use lowercase letters, digits, hyphens, or underscores.' });
  }

  const cityData = await readCityJson(cc, slug);

  if (!cityData) {
    const hint = dataBaseUrlHint();
    return res.status(404).json({
      error: `City not found: ${cc}/${slug}`,
      hint: `Try /api/cities?country=${cc}`,
      ...(hint ? { setup: hint } : {}),
    });
  }

  const rows = Array.isArray(cityData.data) ? cityData.data : [];
  const target = normalizeYmd(date || today());

  const day = rows.find(d => dayDateKey(d) === target);

  if (!day) {
    return res.status(404).json({
      error: `No data for ${target}`,
      coverage: coverageRange(rows),
    });
  }

  const bad = invalidFields(day);
  if (bad.length) {
    return res.status(503).json({
      error: `Corrupt data for ${target}`,
      invalidFields: bad,
    });
  }

  return res.status(200).json({
    country: cc,
    city: slug,
    cityDisplayName: displayCityName(cc, slug),
    date: target,
    times: {
      fajr: day.fajr,
      sunrise: day.sunrise,
      dhuhr: day.dhuhr,
      asr: day.asr,
      maghrib: day.maghrib,
      isha: day.isha,
    },
    ...(withDetail ? { detail: day } : {}),
    fileMeta: cityData._meta ?? null,
    fetchedAt: cityData._meta?.fetchedAt,
  });
}

function today() {
  return new Date().toISOString().split('T')[0];
}
