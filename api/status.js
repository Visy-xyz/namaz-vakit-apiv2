import { catalogStats } from '../lib/prayerCatalog.js';
import { checkRateLimit, clientIp } from '../lib/rateLimiter.js';

/**
 * GET /api/status
 *
 * Returns catalog health: whether it loaded, how many countries/cities are covered,
 * and when the data was last built. Useful for monitoring after yearly refresh runs.
 */
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=60');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    return res.status(204).end();
  }

  const rl = checkRateLimit(clientIp(req), 'status', 60);
  res.setHeader('X-RateLimit-Remaining', rl.remaining);
  if (rl.limited) {
    res.setHeader('Retry-After', Math.ceil((rl.resetAt - Date.now()) / 1000));
    return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
  }

  const stats = catalogStats();

  return res.status(200).json({
    status: stats ? 'ok' : 'degraded',
    catalog: stats
      ? { loaded: true, ...stats }
      : { loaded: false, countries: 0, cities: 0, builtAt: null },
    serverTime: new Date().toISOString(),
  });
}
