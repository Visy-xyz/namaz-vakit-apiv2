import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRateLimit, clientIp } from '../lib/rateLimiter.js';

// Use unique IPs per test so they don't share state
let counter = 0;
const fakeIp = () => `10.0.0.${counter++}`;

test('checkRateLimit: first request is not limited', () => {
  const result = checkRateLimit(fakeIp(), 'prayer', 10);
  assert.equal(result.limited, false);
});

test('checkRateLimit: remaining decrements on each call', () => {
  const ip = fakeIp();
  const r1 = checkRateLimit(ip, 'prayer', 10);
  const r2 = checkRateLimit(ip, 'prayer', 10);
  assert.equal(r1.remaining, 9);
  assert.equal(r2.remaining, 8);
});

test('checkRateLimit: blocks after max requests', () => {
  const ip = fakeIp();
  for (let i = 0; i < 5; i++) checkRateLimit(ip, 'prayer', 5);
  const result = checkRateLimit(ip, 'prayer', 5);
  assert.equal(result.limited, true);
  assert.equal(result.remaining, 0);
});

test('checkRateLimit: different endpoints have independent counters', () => {
  const ip = fakeIp();
  for (let i = 0; i < 3; i++) checkRateLimit(ip, 'cities', 3);
  const blocked = checkRateLimit(ip, 'cities', 3);
  const prayer = checkRateLimit(ip, 'prayer', 3);
  assert.equal(blocked.limited, true);
  assert.equal(prayer.limited, false);
});

test('checkRateLimit: different IPs have independent counters', () => {
  const ip1 = fakeIp();
  const ip2 = fakeIp();
  for (let i = 0; i < 3; i++) checkRateLimit(ip1, 'prayer', 3);
  const blocked = checkRateLimit(ip1, 'prayer', 3);
  const other = checkRateLimit(ip2, 'prayer', 3);
  assert.equal(blocked.limited, true);
  assert.equal(other.limited, false);
});

test('checkRateLimit: resetAt is approximately one minute from now', () => {
  const before = Date.now();
  const result = checkRateLimit(fakeIp(), 'prayer', 10);
  const after = Date.now();
  assert.ok(result.resetAt >= before + 59_000, 'resetAt should be ~60s from now');
  assert.ok(result.resetAt <= after + 61_000, 'resetAt should not exceed 61s');
});

// clientIp
test('clientIp: reads x-forwarded-for header', () => {
  const req = { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } };
  assert.equal(clientIp(req), '1.2.3.4');
});

test('clientIp: returns unknown when no headers or socket', () => {
  assert.equal(clientIp({ headers: {} }), 'unknown');
});

test('clientIp: falls back to socket.remoteAddress', () => {
  const req = { headers: {}, socket: { remoteAddress: '9.9.9.9' } };
  assert.equal(clientIp(req), '9.9.9.9');
});
