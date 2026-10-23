import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolated cache and mocked fetch only: never read profile credentials or bill.
process.env.DSH_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'newapi-outcomes-'));
const { ModelTester } = await import('../lib/model-test.js');
const { readCache } = await import('../lib/util.js');
const KEY = 'offline-api-key/never-real';
const input = { channelId: 'outcomes', modelId: 'fake-model', confirmPaid: true };
const event = (value) => `data: ${typeof value === 'string' ? value : JSON.stringify(value)}\n\n`;
const done = event('[DONE]');
function tester(kind = 'chat', protocol = 'openai') {
  return new ModelTester({
    channelFacts: async () => ({ baseURL: 'https://offline.invalid', apiKey: async () => KEY }),
    entryFor: async () => ({ kind, endpointTypes: [protocol] }),
    submitVideo: async () => ({ taskId: 'offline-task' }),
  });
}
function mockSSE(t, body) {
  t.mock.method(globalThis, 'fetch', () => new Response(body(), { headers: { 'content-type': 'text/event-stream' } }));
}
function mockImage(t, payload) {
  t.mock.method(globalThis, 'fetch', () => new Response(JSON.stringify(payload()), { headers: { 'content-type': 'application/json' } }));
}

test('DONE-only and unrelated payloads are not successful protocol results', async (t) => {
  let body;
  mockSSE(t, () => body);
  for (const protocol of ['openai', 'openai-response', 'anthropic']) {
    for (const prefix of ['', event({}), event({ usage: { total_tokens: 1 } }), event({ type: 'unrelated' })]) {
      body = prefix + done;
      const result = await tester('chat', protocol).run(input);
      assert.equal(result.ok, false, protocol);
      assert.equal(result.code, 'INCOMPLETE');
    }
  }
});

test('valid empty-text native terminals and real deltas followed by DONE still succeed', async (t) => {
  let body;
  mockSSE(t, () => body);
  for (const [protocol, terminal, delta] of [
    ['openai', { choices: [{ delta: {}, finish_reason: 'stop' }] }, { choices: [{ delta: { content: 'OK' } }] }],
    ['openai-response', { type: 'response.completed', response: { status: 'completed' } }, { type: 'response.output_text.delta', delta: 'OK' }],
    ['anthropic', { type: 'message_stop' }, { type: 'content_block_delta', delta: { type: 'text_delta', text: 'OK' } }],
  ]) {
    body = event(terminal);
    const empty = await tester('chat', protocol).run(input);
    assert.equal(empty.ok, true);
    assert.equal(empty.outputPreview, '');
    body = event(delta) + done;
    assert.equal((await tester('chat', protocol).run(input)).ok, true);
    for (const error of [{ type: 'error', error: { message: '' } }, { type: 'response.failed', response: { status: 'failed' } }]) {
      for (const failFirst of [true, false]) {
        body = (failFirst ? event(error) + event(terminal) : event(terminal) + event(error)) + done;
        assert.equal((await tester('chat', protocol).run(input)).ok, false);
      }
    }
  }
});

test('S3, OSS, and GCS signed image results succeed without preview or cached URLs', async (t) => {
  let payload;
  mockImage(t, () => payload);
  const instance = tester('image');
  for (const query of [
    'X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=fake-credential&X-Amz-Signature=private-signature&X-Amz-Security-Token=private-session',
    'OSSAccessKeyId=fake-storage-key&Expires=1234567890&Signature=private-signature',
    'x-oss-signature-version=OSS4-HMAC-SHA256&x-oss-credential=fake-credential&x-oss-signature=private-signature',
    'X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=fake-credential&X-Goog-Signature=private-signature',
    'GoogleAccessId=fake-storage-key&Expires=1234567890&Signature=private-signature',
  ]) {
    const url = `https://objects.example.test/image.png?${query}`;
    payload = { data: [{ url }] };
    const result = await instance.run(input);
    assert.equal(result.ok, true, query);
    assert.equal(result.preview, undefined);
    assert.equal(result.previewOmitted, true);
    const serialized = JSON.stringify([result, instance.last(input.channelId, input.modelId), readCache('model-tests.json')]);
    for (const secret of [url, 'private-signature', 'private-session', 'fake-credential', 'fake-storage-key', KEY]) assert.ok(!serialized.includes(secret));
  }
});

test('multiline image base64 normalizes before validation and preview', async (t) => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=';
  let value = png.match(/.{1,12}/g).join('\r\n');
  mockImage(t, () => ({ data: [{ b64_json: value }] }));
  const result = await tester('image').run(input);
  assert.equal(result.ok, true);
  assert.equal(result.preview.src, `data:image/png;base64,${png}`);
  for (const invalid of [png + '=', png.slice(0, -2), png + '!', Buffer.from('not an image').toString('base64'), '']) {
    value = invalid;
    assert.equal((await tester('image').run(input)).ok, false);
  }
});

test('missing images, private token URLs, and credential-bearing URLs remain failures', async (t) => {
  let payload;
  mockImage(t, () => payload);
  for (const value of [{}, { data: [{}] }, ...[
    'https://example.test/image?token=private-token',
    `https://example.test/image?api_key=${encodeURIComponent(KEY)}`,
    `https://example.test/${encodeURIComponent(KEY)}?X-Amz-Signature=private-signature`,
    'https://user:password@example.test/image?X-Amz-Signature=private-signature',
    'javascript:alert(1)',
  ].map((url) => ({ data: [{ url }] }))]) {
    payload = value;
    const result = await tester('image').run(input);
    assert.equal(result.ok, false);
    assert.equal(result.preview, undefined);
    assert.ok(!JSON.stringify(result).includes(KEY));
    assert.ok(!JSON.stringify(result).includes('private-token'));
  }
});

test('secret query URLs and API keys never survive stream result or durable cache', async (t) => {
  const url = 'https://example.test/image.png?X-Amz-Signature=unknown-signature&token=unknown-token';
  let body = event({ choices: [{ delta: { content: `${url} ${KEY}` }, finish_reason: 'stop' }], usage: { debug: url } });
  mockSSE(t, () => body);
  const instance = tester();
  for (const failed of [false, true]) {
    if (failed) body = event({ type: 'error', error: { message: `Failed ${url} ${KEY}` } }) + done;
    const result = await instance.run(input);
    assert.equal(result.ok, !failed);
    const serialized = JSON.stringify([result, readCache('model-tests.json')]);
    for (const secret of [KEY, url, 'unknown-signature', 'unknown-token']) assert.ok(!serialized.includes(secret));
  }
});

test('accepted video tasks remain pending, not successful generations', async (t) => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('unexpected network request'); });
  const result = await tester('video').run(input);
  assert.equal(result.ok, false);
  assert.equal(result.phase, 'accepted');
  assert.equal(result.code, 'PENDING');
});
