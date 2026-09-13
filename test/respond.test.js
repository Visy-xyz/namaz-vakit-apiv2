import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cors, handledPreflight, ok, fail } from '../lib/respond.js';

function mockRes() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    ended: false,
    setHeader(k, v) { this.headers[k.toLowerCase()] = String(v); },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { this.ended = true; return this; },
  };
}

test('ok: caches successful responses', () => {
  const res = mockRes();
  ok(res, { fine: true });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'public, max-age=3600');
});

test('ok: honours a custom max-age', () => {
  const res = mockRes();
  ok(res, {}, 86400);
  assert.equal(res.headers['cache-control'], 'public, max-age=86400');
});

test('fail: errors are never cached', () => {
  // Regression: Cache-Control was set before the error branches, so a transient
  // 404/503 was cached by the CDN for an hour.
  for (const status of [400, 404, 429, 503]) {
    const res = mockRes();
    fail(res, status, { error: 'nope' });
    assert.equal(res.statusCode, status);
    assert.equal(res.headers['cache-control'], 'no-store');
  }
});

test('fail: overrides a previously set caching header', () => {
  const res = mockRes();
  ok(res, {});
  fail(res, 404, { error: 'nope' });
  assert.equal(res.headers['cache-control'], 'no-store');
});

test('handledPreflight: answers OPTIONS with 204 and reports true', () => {
  const res = mockRes();
  assert.equal(handledPreflight({ method: 'OPTIONS' }, res), true);
  assert.equal(res.statusCode, 204);
  assert.equal(res.ended, true);
});

test('handledPreflight: leaves GET alone', () => {
  const res = mockRes();
  assert.equal(handledPreflight({ method: 'GET' }, res), false);
  assert.equal(res.statusCode, null);
});

test('cors: sets permissive origin and methods', () => {
  const res = mockRes();
  cors(res);
  assert.equal(res.headers['access-control-allow-origin'], '*');
  assert.equal(res.headers['access-control-allow-methods'], 'GET, OPTIONS');
});
