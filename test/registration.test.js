/**
 * Registration-order guards.
 *
 * A cold start applies this plugin before the HTTP server service exists. Reading
 * it once with `ctx.get('webServer')` silently skipped route registration, so the
 * settings page answered HTTP 404 after every restart while still working after a
 * hot reload. These checks fail if that pattern comes back.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(import.meta.dirname, '..', 'index.js'), 'utf8');

test('web routes wait for the webServer service instead of reading it once', () => {
  assert.match(source, /ctx\.inject\(\['webServer'\]/, 'route registration must use ctx.inject');
  assert.doesNotMatch(source, /ctx\.get\('webServer'\)/, 'ctx.get(\'webServer\') races the cold start');
});

test('other optional services are not read eagerly at apply time', () => {
  // Services used per request may be read lazily; the eager ones must be injected.
  for (const name of ['settings', 'tools', 'webServer']) {
    assert.match(source, new RegExp(`ctx\\.inject\\(\\['${name}'\\]`), `${name} must be injected`);
  }
});

test('the route prefix stays outside the DSH-owned /api/ namespace', () => {
  const prefix = source.match(/const ROUTE_PREFIX = '([^']+)'/)?.[1];
  assert.equal(prefix, '/newapi-studio/api/');
  assert.ok(!prefix.startsWith('/api/'), 'DSH owns /api/');
  // Registered path must not end with a slash, or child paths never match.
  assert.match(source, /path: ROUTE_PREFIX\.slice\(0, -1\)/);
});
