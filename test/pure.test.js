import test from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../lib/catalog.js';
import { displayOf } from '../lib/balance.js';
import { normalizeStatus } from '../lib/media.js';
import { gatewayRoot, openaiBase, redact } from '../lib/util.js';

test('gateway URL normalization', () => {
  assert.equal(gatewayRoot('http://127.0.0.1:3300/v1/'), 'http://127.0.0.1:3300');
  assert.equal(gatewayRoot('https://g.example.com'), 'https://g.example.com');
  assert.equal(openaiBase('http://h:1/v1'), 'http://h:1/v1');
  assert.equal(openaiBase('http://h:1'), 'http://h:1/v1');
});

test('classify by models.dev output modality, then by name', () => {
  assert.equal(classify('gpt-image-2', { outputModalities: ['image'] }), 'image');
  assert.equal(classify('gpt-image-2.5', undefined), 'image');
  assert.equal(classify('sora-2', undefined), 'video');
  assert.equal(classify('kling-v2-master', undefined), 'video');
  assert.equal(classify('doubao-seedance-1-0-pro', undefined), 'video');
  assert.equal(classify('claude-opus-5-5', { outputModalities: ['text'] }), 'chat');
  assert.equal(classify('codex-auto-review', undefined), 'chat');
  assert.equal(classify('text-embedding-3-large', undefined), 'embedding');
  assert.equal(classify('gemini-3-pro', { outputModalities: ['text', 'image'] }), 'chat');
});

test('balance display follows quota_display_type, never price', () => {
  const usd = displayOf({ quota_per_unit: 500000, quota_display_type: 'USD', usd_exchange_rate: 7.3, price: 99 });
  assert.equal(usd.unit, 'USD');
  assert.equal(2179899419 * usd.factor, 4359.798838);
  const cny = displayOf({ quota_per_unit: 500000, quota_display_type: 'CNY', usd_exchange_rate: 7.2, price: 99 });
  assert.equal(cny.unit, 'CNY');
  assert.ok(Math.abs(500000 * cny.factor - 7.2) < 1e-9);
  const fallback = displayOf(undefined);
  assert.equal(fallback.unit, 'USD');
  assert.equal(fallback.estimated, true);
});

test('video status normalization', () => {
  assert.equal(normalizeStatus('SUCCESS'), 'completed');
  assert.equal(normalizeStatus('succeeded'), 'completed');
  assert.equal(normalizeStatus('FAILURE'), 'failed');
  assert.equal(normalizeStatus('queued'), 'queued');
  assert.equal(normalizeStatus('IN_PROGRESS'), 'in_progress');
  assert.equal(normalizeStatus(undefined), 'in_progress');
});

test('redaction hides the key and key-shaped strings', () => {
  const key = 'sk-abcdefghijklmnopqrstuvwx';
  assert.equal(redact(`bad key ${key}`, key), 'bad key <redacted>');
  assert.equal(redact('token sk-ZZZZZZZZZZZZZZZZZZZZ leaked'), 'token sk-<redacted> leaked');
});
