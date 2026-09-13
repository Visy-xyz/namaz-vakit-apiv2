const WINDOW_MS = 60_000;

/**
 * Best-effort, per-instance limiter. Vercel runs many instances, so this is a
 * politeness guard against a single client hammering one instance — not a
 * security control. Anything stronger belongs at the edge (WAF / Vercel
 * firewall), not in module memory.
 */
const MAX_TRACKED_KEYS = 5000;

// ip:endpoint -> { count, resetAt }
const store = new Map();

function key(ip, endpoint) {
  return `${ip}:${endpoint}`;
}

/** Drop windows that have already closed so the Map cannot grow without bound. */
function evictExpired(now) {
  for (const [k, entry] of store) {
    if (now >= entry.resetAt) store.delete(k);
  }
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

  if (store.size >= MAX_TRACKED_KEYS) {
    evictExpired(now);
    // Still full of live windows: fail open rather than block real users.
    if (store.size >= MAX_TRACKED_KEYS) {
      return { limited: false, remaining: max, resetAt: now + WINDOW_MS };
    }
  }

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

/** Test seam. */
export function _resetRateLimiter() {
  store.clear();
}
