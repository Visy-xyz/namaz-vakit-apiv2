import { getQuery } from '../lib/query.js';
import { dayDateKey, coverageRange } from '../lib/dayDate.js';
import { normalizeYearMonth } from '../lib/dateParams.js';
import { displayCityName } from '../lib/cityNormalizations.js';
import { readCityJson, dataBaseUrlHint } from '../lib/readCityData.js';
import { invalidFields } from '../lib/validateCityData.js';
import { checkRateLimit, clientIp } from '../lib/rateLimiter.js';
import { validateLocation, validateMonth } from '../lib/validate.js';
import { cors, handledPreflight, ok, fail } from '../lib/respond.js';
import { resolveCitySlug } from '../lib/citySlugAliases.js';

/**
 * GET /api/monthly?country=al&city=tirana
 * GET /api/monthly?country=al&city=tirana&month=2026-04
 *
 * All prayer times for a full month. Each day includes `detail` — the full
 * Diyanet row (hijri, moon URL, astronomical times, …).
 */
export default async function handler(req, res) {
  cors(res);
  if (handledPreflight(req, res)) return;

  const rl = checkRateLimit(clientIp(req), 'monthly', 300);
  res.setHeader('X-RateLimit-Remaining', rl.remaining);
  if (rl.limited) {
    res.setHeader('Retry-After', Math.ceil((rl.resetAt - Date.now()) / 1000));
    return fail(res, 429, { error: 'Too many requests. Try again in a minute.' });
  }

  const q = getQuery(req);
  const cc = (q.country || '').toLowerCase();
  const requestedSlug = (q.city || '').toLowerCase();

  const locationErr = validateLocation(cc, requestedSlug);
  const slug = resolveCitySlug(cc, requestedSlug);
  if (locationErr) {
    return fail(res, 400, {
      error: locationErr,
      example: '/api/monthly?country=al&city=tirana&month=2026-05',
    });
  }

  const monthErr = validateMonth(q.month);
  if (monthErr) return fail(res, 400, { error: monthErr });

  const cityData = await readCityJson(cc, slug);

  if (!cityData) {
    const hint = dataBaseUrlHint();
    return fail(res, 404, {
      error: `City not found: ${cc}/${slug}`,
      hint: `Try /api/cities?country=${cc}`,
      ...(hint ? { setup: hint } : {}),
    });
  }

  const rows = Array.isArray(cityData.data) ? cityData.data : [];
  const targetMonth = normalizeYearMonth(q.month || currentMonth());

  const days = rows.filter(d => dayDateKey(d)?.startsWith(targetMonth));

  if (days.length === 0) {
    return fail(res, 404, {
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
      qiblaTime: d.qiblaTime ?? null,
      moonPhaseUrl: d.shapeMoonUrl ?? null,
      hijriDate: d.hijriDateLong ?? null,
      detail: d,
    };
  });

  return ok(res, {
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

/** Server-local month is fine here: callers asking for "this month" are not date-critical. */
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
