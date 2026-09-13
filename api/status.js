import { catalogStats, catalogCoverage } from '../lib/prayerCatalog.js';
import { checkRateLimit, clientIp } from '../lib/rateLimiter.js';
import { cors, handledPreflight, ok, fail } from '../lib/respond.js';

/** Warn while there is still time to run the yearly refresh by hand. */
const EXPIRY_WARNING_DAYS = 45;

/**
 * GET /api/status
 *
 * Catalog health plus how much prayer-time data is left. `daysRemaining` is the
 * number that matters: the data is a fixed yearly snapshot, so when it reaches
 * zero every city starts returning 404 until the refresh workflow runs.
 * The yearly-refresh and expiry-canary workflows both read this endpoint.
 */
export default function handler(req, res) {
  cors(res);
  if (handledPreflight(req, res)) return;

  const rl = checkRateLimit(clientIp(req), 'status', 60);
  res.setHeader('X-RateLimit-Remaining', rl.remaining);
  if (rl.limited) {
    res.setHeader('Retry-After', Math.ceil((rl.resetAt - Date.now()) / 1000));
    return fail(res, 429, { error: 'Too many requests. Try again in a minute.' });
  }

  const stats = catalogStats();
  const coverage = catalogCoverage();
  const daysRemaining = daysUntil(coverage?.lastDate);

  const status = !stats
    ? 'degraded'
    : daysRemaining == null
      ? 'unknown'
      : daysRemaining < 0
        ? 'expired'
        : daysRemaining <= EXPIRY_WARNING_DAYS
          ? 'expiring'
          : 'ok';

  return ok(
    res,
    {
      status,
      catalog: stats
        ? { loaded: true, ...stats }
        : { loaded: false, countries: 0, cities: 0, builtAt: null },
      coverage: coverage
        ? { ...coverage, daysRemaining }
        : { years: [], firstDate: null, lastDate: null, daysRemaining: null },
      serverTime: new Date().toISOString(),
    },
    60
  );
}

/** Whole days from today (UTC) until `ymd` inclusive; negative once past. */
function daysUntil(ymd) {
  if (typeof ymd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const end = Date.parse(`${ymd}T00:00:00Z`);
  if (Number.isNaN(end)) return null;
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.round((end - today) / 86_400_000);
}
