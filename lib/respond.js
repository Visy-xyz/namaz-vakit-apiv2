/**
 * Centralised response headers. Identical in namaz-vakit-api and namaz-vakit-apiv2.
 *
 * Success responses are cached hard (the underlying data only changes once a
 * year). Errors must NOT inherit that: setting `max-age=3600` before the error
 * branches meant a single transient 404/503 was cached by the CDN for an hour,
 * turning a blip into an outage for that URL.
 */
export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
}

/** True when the request was a preflight and has already been answered. */
export function handledPreflight(req, res) {
  if (req.method !== 'OPTIONS') return false;
  res.status(204).end();
  return true;
}

export function ok(res, body, maxAgeSeconds = 3600) {
  res.setHeader('Cache-Control', `public, max-age=${maxAgeSeconds}`);
  return res.status(200).json(body);
}

export function fail(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}
