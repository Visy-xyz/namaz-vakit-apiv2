import { getQuery } from '../lib/query.js';
import { dayDateKey, coverageRange } from '../lib/dayDate.js';
import { normalizeYearMonth } from '../lib/dateParams.js';
import { displayCityName } from '../lib/cityNormalizations.js';
import { readCityJson, dataBaseUrlHint } from '../lib/readCityData.js';
import { invalidFields } from '../lib/validateCityData.js';
import { checkRateLimit, clientIp } from '../lib/rateLimiter.js';

/**
 * GET /api/monthly?country=af&city=calalabad
 * GET /api/monthly?country=af&city=calalabad&month=2026-04
 *
 * Returns all prayer times for a full month.
 * Each day includes `detail` — the full Diyanet row (hijri, moon URL, astronomical times, …).
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    return res.status(204).end();
  }

  const rl = checkRateLimit(clientIp(req), 'monthly', 300);
  res.setHeader('X-RateLimit-Remaining', rl.remaining);
  if (rl.limited) {
    res.setHeader('Retry-After', Math.ceil((rl.resetAt - Date.now()) / 1000));
    return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
  }

  const q = getQuery(req);
  const cc = (q.country || '').toLowerCase();
  const slug = (q.city || '').toLowerCase();
  const month = q.month;
  const withDetail = q.detail === 'true';

  if (!cc || !slug) {
    return res.status(400).json({
      error: 'Missing params',
      example: '/api/monthly?country=af&city=calalabad&month=2026-05',
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
      ...(hint ? { setup: hint } : {}),
    });
  }

  const rows = Array.isArray(cityData.data) ? cityData.data : [];

  const targetMonth = normalizeYearMonth(month || currentMonth());

  const days = rows.filter(d => {
    const key = dayDateKey(d);
    return key?.startsWith(targetMonth);
  });

  if (days.length === 0) {
    return res.status(404).json({
      error: `No data for month ${targetMonth}`,
      coverage: coverageRange(rows),
    });
  }

  const warnings = [];
  const data = days.map(d => {
    const date = dayDateKey(d);
    const bad = invalidFields(d);
    if (bad.length) warnings.push({ date, invalidFields: bad });
    return {
      date,
      times: {
        fajr: d.fajr,
        sunrise: d.sunrise,
        dhuhr: d.dhuhr,
        asr: d.asr,
        maghrib: d.maghrib,
        isha: d.isha,
      },
      ...(withDetail ? { detail: d } : {}),
    };
  });

  return res.status(200).json({
    country: cc,
    city: slug,
    cityDisplayName: displayCityName(cc, slug),
    month: targetMonth,
    days: days.length,
    fileMeta: cityData._meta ?? null,
    ...(warnings.length ? { warnings } : {}),
    data,
    fetchedAt: cityData._meta?.fetchedAt,
  });
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
