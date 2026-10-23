import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchJson } from '../lib/util.js';

test('HTTP errors redact echoed channel credential headers', async (t) => {
  const secret = 'custom-proxy-credential-91234';
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { message: `Proxy rejected ${secret}` } }, { status: 403 }));
  await assert.rejects(fetchJson('http://offline.invalid/v1/models', { headers: { 'X-Api-Key': secret } }), (e) => {
    assert.equal(e.code, 'AUTH');
    assert.equal(e.message.includes(secret), false);
    return true;
  });
});
