import { getQuery } from '../lib/query.js';
import { dayDateKey, coverageRange } from '../lib/dayDate.js';
import { normalizeYmd } from '../lib/dateParams.js';
import { displayCityName } from '../lib/cityNormalizations.js';
import { readCityJson, dataBaseUrlHint } from '../lib/readCityData.js';
import { invalidFields } from '../lib/validateCityData.js';
import { checkRateLimit, clientIp } from '../lib/rateLimiter.js';
import { validateLocation, validateDate } from '../lib/validate.js';
import { cors, handledPreflight, ok, fail } from '../lib/respond.js';
import { resolveCitySlug } from '../lib/citySlugAliases.js';

/**
 * GET /api/prayer?country=al&city=tirana
 * GET /api/prayer?country=al&city=tirana&date=2026-04-25
 *
 * Prayer times for one city and date. Reads from cached JSON — ZERO calls to
 * Diyanet at request time. On Vercel the JSON comes from DATA_BASE_URL.
 *
 * `detail` (the full Diyanet row: hijri date, moon phase, astronomical times)
 * is ALWAYS included — released app builds read those fields from it.
 *
 * When a date is not covered this returns 404. It deliberately does NOT fall
 * back to the same date a year earlier: prayer times drift by minutes and the
 * hijri date drifts by ~11 days, so stale data would be shown as if correct.
 */
export default async function handler(req, res) {
  cors(res);
  if (handledPreflight(req, res)) return;

  const rl = checkRateLimit(clientIp(req), 'prayer', 300);
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
      example: '/api/prayer?country=al&city=tirana',
      hint: 'List cities: GET /api/cities or /api/cities?country=al',
    });
  }

  const dateErr = validateDate(q.date);
  if (dateErr) return fail(res, 400, { error: dateErr });

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
  const target = normalizeYmd(q.date || localToday(rows));

  const day = rows.find(d => dayDateKey(d) === target);

  if (!day) {
    return fail(res, 404, {
      error: `No data for ${target}`,
      coverage: coverageRange(rows),
    });
  }

  const bad = invalidFields(day);
  if (bad.length) {
    return fail(res, 503, {
      error: `Corrupt data for ${target}`,
      invalidFields: bad,
    });
  }

  return ok(res, {
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
    qiblaTime: day.qiblaTime ?? null,
    moonPhaseUrl: day.shapeMoonUrl ?? null,
    hijriDate: day.hijriDateLong ?? null,
    astronomicalSunrise: day.astronomicalSunrise ?? null,
    astronomicalSunset: day.astronomicalSunset ?? null,
    timezoneOffset: day.greenwichMeanTimeZone ?? null,
    detail: day,
    fileMeta: cityData._meta ?? null,
    fetchedAt: cityData._meta?.fetchedAt,
  });
}

/**
 * "Today" belongs to the city, not the server. Using the server's UTC date
 * showed yesterday's times to users east of UTC just after midnight local.
 *
 * The per-day `greenwichMeanTimeZone` from Diyanet is already DST-adjusted, so
 * anchor on the row for the current UTC date to learn the city's live offset,
 * then re-derive the local date from it.
 */
function localToday(rows) {
  const utcDate = new Date().toISOString().slice(0, 10);
  const anchor = rows.find(d => dayDateKey(d) === utcDate);
  const offsetHours = Number(anchor?.greenwichMeanTimeZone);
  if (!Number.isFinite(offsetHours)) return utcDate;
  return new Date(Date.now() + offsetHours * 3_600_000).toISOString().slice(0, 10);
}
