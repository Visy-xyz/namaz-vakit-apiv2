const WINDOW_MS = 60_000;

// ip:endpoint -> { count, resetAt }
const store = new Map();

function key(ip, endpoint) {
  return `${ip}:${endpoint}`;
}

/**
 * @param {string} ip
 * @param {string} endpoint  e.g. 'prayer'
 * @param {number} max       requests allowed per minute
 * @returns {{ limited: boolean, remaining: number, resetAt: number }}
 */
export function checkRateLimit(ip, endpoint, max) {
  const k = key(ip, endpoint);
  const now = Date.now();
  const entry = store.get(k);

  if (!entry || now >= entry.resetAt) {
    store.set(k, { count: 1, resetAt: now + WINDOW_MS });
    return { limited: false, remaining: max - 1, resetAt: now + WINDOW_MS };
  }

  entry.count += 1;

  if (entry.count > max) {
    return { limited: true, remaining: 0, resetAt: entry.resetAt };
  }

  return { limited: false, remaining: max - entry.count, resetAt: entry.resetAt };
}

export function clientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}
