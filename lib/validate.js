/**
 * Shared request validation. Identical in namaz-vakit-api and namaz-vakit-apiv2.
 *
 * City slugs on disk are `[a-z0-9_-]` (a few countries use hyphens), so the
 * pattern must allow hyphens — a stricter rule silently 400s real cities.
 * Country codes are the `data/` folder names: mostly ISO-2, plus a handful of
 * territory codes like `ua_crm` and `kudus`.
 */
const COUNTRY_RE = /^[a-z][a-z0-9_]{1,15}$/;
const CITY_RE = /^[a-z0-9][a-z0-9_-]{0,59}$/;
const DATE_RE = /^\d{4}-\d{1,2}-\d{1,2}$/;
const MONTH_RE = /^\d{4}-\d{1,2}$/;

export function validateLocation(country, city) {
  if (!country || !COUNTRY_RE.test(String(country).toLowerCase())) {
    return 'Invalid country code — use the folder name from /api/cities (e.g. al, de, us)';
  }
  if (!city || !CITY_RE.test(String(city).toLowerCase())) {
    return 'Invalid city slug — lowercase letters, digits, hyphens or underscores (e.g. tirana, new_york)';
  }
  return null;
}

export function validateDate(date) {
  if (date && !DATE_RE.test(String(date))) {
    return 'Invalid date — use YYYY-MM-DD (e.g. 2026-05-13)';
  }
  return null;
}

export function validateMonth(month) {
  if (month && !MONTH_RE.test(String(month))) {
    return 'Invalid month — use YYYY-MM (e.g. 2026-05)';
  }
  return null;
}
