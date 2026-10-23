import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// All keys, streams, discovery, and media submissions below are local fakes.
process.env.DSH_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'newapi-test-safety-'));
const { ModelTester, pickTestProtocol, requestFor } = await import('../lib/model-test.js');
const { writeCache, readCache } = await import('../lib/util.js');
const FAKE_KEY = 'fake/secret+only-for-tests';
const input = { channelId: 'a', modelId: 'm' };
const event = (value) => `data: ${typeof value === 'string' ? value : JSON.stringify(value)}\n\n`;
const done = event('[DONE]');
const sse = (body) => new Response(body, { headers: { 'content-type': 'text/event-stream' } });
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
function tester(kind = 'chat', endpointTypes = ['openai'], host = {}) {
  return new ModelTester({
    channelFacts: async () => ({ baseURL: 'https://fake.invalid', headers: {}, apiKey: async () => FAKE_KEY }),
    entryFor: async () => ({ kind, endpointTypes }),
    ...host,
  });
}
function fakeFetch(t, callback) {
  return t.mock.method(globalThis, 'fetch', callback);
}
function chunked(chunks, type = 'text/event-stream') {
  let pulled = 0, cancelled = false;
  const stream = new ReadableStream({
    pull(controller) {
      if (pulled === chunks.length) return controller.close();
      const chunk = chunks[pulled++];
      if (chunk instanceof Error) return controller.error(chunk);
      controller.enqueue(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk);
    },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  return { response: new Response(stream, { headers: { 'content-type': type } }), get pulled() { return pulled; }, get cancelled() { return cancelled; } };
}

test('rejects HTML, role-only, truncated, invalid JSON, and disconnected SSE without retry', async (t) => {
  const cases = [
    () => new Response('<html>data: [DONE]</html>', { headers: { 'content-type': 'text/html' } }),
    () => new Response(new TextEncoder().encode(`<html>\n${done}</html>`)),
    () => sse(event({ choices: [{ delta: { role: 'assistant' } }] })),
    () => sse(event({ choices: [{ delta: { content: 'OK' } }] })),
    () => sse('data: [DONE]'),
    () => sse(event('{broken-json}')),
    () => chunked([event({ choices: [{ delta: { content: 'OK' } }] }), new Error('connection closed')]).response,
  ];
  let index = 0;
  const fetch = fakeFetch(t, () => cases[index++]());
  for (const _ of cases) assert.equal((await tester().run(input)).ok, false);
  assert.equal(fetch.mock.callCount(), cases.length);
});

test('requires matching native terminal events; rejects bare DONE for every protocol', async (t) => {
  let body;
  fakeFetch(t, () => sse(body));
  for (const [protocol, terminal] of [
    ['openai', { choices: [{ delta: {}, finish_reason: 'stop' }] }],
    ['anthropic', { type: 'message_stop' }],
    ['openai-response', { type: 'response.completed', response: { status: 'completed' } }],
  ]) {
    body = event(terminal);
    assert.equal((await tester('chat', [protocol]).run(input)).ok, true);
    body = done;
    assert.equal((await tester('chat', [protocol]).run(input)).ok, false);
  }
  body = event({ type: 'message_stop' });
  assert.equal((await tester('chat', ['openai-response']).run(input)).ok, false);
  body = event({ type: 'response.completed' });
  assert.equal((await tester('chat', ['anthropic']).run(input)).ok, false);
});

test('Responses failed/incomplete and Anthropic errors override DONE or completed', async (t) => {
  let body;
  fakeFetch(t, () => sse(body));
  for (const status of ['failed', 'incomplete']) {
    body = event({ type: `response.${status}`, response: { status, error: { message: `failure ${FAKE_KEY}` } } }) + done;
    const result = await tester('chat', ['openai-response']).run(input);
    assert.equal(result.ok, false);
    assert.ok(!JSON.stringify(result).includes(FAKE_KEY));
  }
  for (const status of ['incomplete', 'in_progress']) {
    body = event({ type: 'response.completed', response: { status } }) + done;
    assert.equal((await tester('chat', ['openai-response']).run(input)).ok, false);
  }
  body = event({ type: 'message_stop' }) + event({ type: 'error', error: { message: 'bad stream' } }) + done;
  assert.equal((await tester('chat', ['anthropic']).run(input)).ok, false);
});

test('firstByteMs measures role packet rather than first text token, with split CRLF SSE', async (t) => {
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  let i = 0;
  const chunks = [event({ choices: [{ delta: { role: 'assistant' } }] }), event({ choices: [{ delta: { content: 'OK' }, finish_reason: 'stop' }] })];
  fakeFetch(t, () => sse(new ReadableStream({ pull(c) {
    if (i === 2) return c.close();
    now = i === 0 ? 1010 : 1050;
    c.enqueue(new TextEncoder().encode(chunks[i++].replaceAll('\n', '\r\n')));
  } }, { highWaterMark: 0 })));
  const result = await tester().run(input);
  assert.equal(result.ok, true);
  assert.equal(result.firstByteMs, 10);
  assert.equal(result.latencyMs, 50);
  assert.equal(result.outputPreview, 'OK');
});

test('SSE byte limit rejects even after terminal and cancels before consuming remaining chunks', async (t) => {
  const stream = chunked([done, new Uint8Array(256 * 1024), done]);
  fakeFetch(t, () => stream.response);
  const result = await tester().run(input);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'TOO_LARGE');
  assert.equal(stream.pulled, 2);
  assert.equal(stream.cancelled, true);
});

test('HTTP error and image JSON limits are enforced while reading, never via Response.text', async (t) => {
  t.mock.method(Response.prototype, 'text', () => { throw new Error('unbounded text() forbidden'); });
  let response;
  fakeFetch(t, () => response);
  const errorStream = chunked([new Uint8Array(256 * 1024 + 1), 'unused'], 'application/json');
  response = new Response(errorStream.response.body, { status: 500 });
  assert.equal((await tester().run(input)).code, 'TOO_LARGE');
  assert.equal(errorStream.cancelled, true);
  const megabyte = new Uint8Array(1024 * 1024);
  const imageStream = chunked([...Array(65).fill(megabyte), 'unused'], 'application/json');
  response = imageStream.response;
  const result = await tester('image').run({ ...input, confirmPaid: true });
  assert.equal(result.code, 'TOO_LARGE');
  assert.equal(imageStream.pulled, 65);
  assert.equal(imageStream.cancelled, true);
});

test('redacts output preview, nested usage and exception messages including encoded keys', async (t) => {
  const headerKey = 'fake-header-secret';
  let response = sse(event({ choices: [{ delta: { content: FAKE_KEY }, finish_reason: 'stop' }], usage: { debug: FAKE_KEY, nested: [encodeURIComponent(FAKE_KEY), headerKey] } }));
  fakeFetch(t, () => { if (response instanceof Error) throw response; return response; });
  const host = { channelFacts: async () => ({ baseURL: 'https://fake.invalid', headers: { 'x-api-key': headerKey }, apiKey: async () => FAKE_KEY }) };
  const instance = tester('chat', ['openai'], host);
  const result = await instance.run(input);
  assert.equal(result.ok, true);
  assert.equal(result.outputPreview, '<redacted>');
  for (const secret of [FAKE_KEY, encodeURIComponent(FAKE_KEY), headerKey]) assert.ok(!JSON.stringify(result).includes(secret));
  response = new Error(`network ${FAKE_KEY}`);
  assert.ok(!(await instance.run(input)).error.includes(FAKE_KEY));
  const video = tester('video', [], { ...host, submitVideo: async () => { throw Object.assign(new Error(`video ${FAKE_KEY}`), { status: 400 }); } });
  await assert.rejects(video.run({ ...input, confirmPaid: true }), (e) => !e.message.includes(FAKE_KEY));
  const lookup = tester('chat', [], { ...host, entryFor: async () => { throw new Error(FAKE_KEY); } });
  assert.ok(!(await lookup.run(input)).error.includes(FAKE_KEY));
});

test('invalid channel/model IDs and confirmation reject before discovery', async () => {
  let calls = 0;
  const instance = tester('chat', [], { channelFacts: async () => { calls++; } });
  for (const value of ['', ' ', ' a', 'a\u0000b', 'a\n', '__proto__', 'constructor', 'x'.repeat(513), 42, null]) {
    await assert.rejects(instance.run({ ...input, channelId: value }), (e) => e.code === 'INVALID_REQUEST');
    await assert.rejects(instance.run({ ...input, modelId: value }), (e) => e.code === 'INVALID_REQUEST');
  }
  await assert.rejects(instance.run(null), (e) => e.code === 'INVALID_REQUEST');
  await assert.rejects(instance.run({ ...input, confirmPaid: 'true' }), (e) => e.code === 'INVALID_REQUEST');
  assert.equal(calls, 0);
});

test('reserves three slots before discovery; releases slots on lookup failure', async () => {
  const gate = deferred();
  let calls = 0;
  const instance = tester('chat', [], { channelFacts: async () => { calls++; await gate.promise; throw new Error('offline discovery'); } });
  const running = [0, 1, 2].map((i) => instance.run({ ...input, modelId: `m${i}` }));
  await assert.rejects(instance.run({ ...input, modelId: 'fourth' }), (e) => e.status === 429);
  assert.equal(calls, 3);
  const other = instance.run({ channelId: 'b', modelId: 'm' });
  assert.equal(calls, 4);
  gate.resolve();
  await Promise.all([...running, other]);
  assert.equal(instance.inflight.size, 0);
  await instance.run(input);
  assert.equal(calls, 5);
});

test('duplicate confirmed paid calls reject before discovery/submission; other channels are independent', async () => {
  const gate = deferred();
  let facts = 0, submits = 0;
  const instance = tester('video', [], {
    channelFacts: async () => { facts++; await gate.promise; return { apiKey: async () => FAKE_KEY }; },
    submitVideo: async () => { submits++; return { taskId: 'fake-task' }; },
  });
  const first = instance.run({ ...input, confirmPaid: true });
  await assert.rejects(instance.run({ ...input, confirmPaid: true }), (e) => e.status === 429);
  assert.equal(facts, 1);
  const other = instance.run({ ...input, channelId: 'b', confirmPaid: true });
  gate.resolve();
  const results = await Promise.all([first, other]);
  assert.equal(submits, 2);
  for (const r of results) {
    assert.equal(r.ok, false);
    assert.equal(r.phase, 'accepted');
    assert.equal(r.status, 'accepted');
    assert.equal(r.preview.taskId, 'fake-task');
  }
  assert.equal(instance.paidInflight.size, 0);
});

test('Gemini and unknown protocols are unsupported and never trigger fallback/billing', async (t) => {
  const fetch = fakeFetch(t, () => { throw new Error('must not fetch'); });
  assert.equal(pickTestProtocol(['gemini'], []), 'unsupported');
  assert.equal(pickTestProtocol(['unknown'], []), 'unsupported');
  assert.throws(() => requestFor('gemini', 'https://fake.invalid', 'm', FAKE_KEY), (e) => e.code === 'UNSUPPORTED');
  const result = await tester('chat', ['gemini']).run(input);
  assert.equal(result.code, 'UNSUPPORTED');
  assert.equal(result.ok, false);
  assert.equal(fetch.mock.callCount(), 0);
});

test('images require actual payload; safe HTTP(S) previews only, no token-bearing URLs', async (t) => {
  let payload;
  fakeFetch(t, () => json(payload));
  const instance = tester('image');
  for (const value of [{}, { data: [{}] }, { status: 'completed' }, { data: [{ b64_json: 'garbage' }] },
    ...['javascript:alert(1)', 'file:///etc/passwd', 'data:image/png;base64,abc', 'https://user:pass@example.test/a.png',
      `https://example.test/${encodeURIComponent(FAKE_KEY)}.png`, `https://example.test/a?token=${encodeURIComponent(FAKE_KEY)}`,
      'https://example.test/a?access_token=some-other-token'].map((url) => ({ data: [{ url }] }))]) {
    payload = value;
    const result = await instance.run({ ...input, confirmPaid: true });
    assert.equal(result.ok, false, JSON.stringify(value));
    assert.equal(result.preview, undefined);
    assert.ok(!JSON.stringify(result).includes(FAKE_KEY));
  }
  payload = { data: [{ url: 'https://example.test/image.png' }] };
  const good = await instance.run({ ...input, confirmPaid: true });
  assert.equal(good.ok, true);
  assert.equal(good.phase, 'completed');
  assert.equal(good.preview.src, 'https://example.test/image.png');
  payload = { status: 'processing', id: 'fake-image-task' };
  const pending = await instance.run({ ...input, confirmPaid: true });
  assert.equal(pending.ok, false);
  assert.equal(pending.phase, 'accepted');
  assert.equal(pending.status, 'processing');
});

test('image JSON above chat cap is supported; HTTP 202 never reports final success', async (t) => {
  const bytes = Buffer.alloc(300 * 1024);
  bytes[0] = 0x89; bytes[1] = 0x50;
  const payload = { data: [{ b64_json: bytes.toString('base64') }] };
  let status = 200;
  fakeFetch(t, () => json(payload, status));
  const instance = tester('image');
  const completed = await instance.run({ ...input, confirmPaid: true });
  assert.equal(completed.ok, true);
  assert.equal(completed.phase, 'completed');
  status = 202;
  const pending = await instance.run({ ...input, confirmPaid: true });
  assert.equal(pending.ok, false);
  assert.equal(pending.phase, 'accepted');
  assert.equal(pending.preview, undefined);
});

test('video empty response is not successful and failed paid requests are never retried', async (t) => {
  let calls = 0;
  const video = tester('video', [], { submitVideo: async () => { calls++; return {}; } });
  assert.equal((await video.run({ ...input, confirmPaid: true })).ok, false);
  assert.equal(calls, 1);
  const fetch = fakeFetch(t, () => { throw new Error('fake disconnected paid image request'); });
  assert.equal((await tester('image').run({ ...input, confirmPaid: true })).ok, false);
  assert.equal(fetch.mock.callCount(), 1);
});

test('cache remains bounded at load and insertion, omits previews, refreshes insertion recency', () => {
  writeCache('model-tests.json', { results: Object.fromEntries(Array.from({ length: 1005 }, (_, i) => [`a\u0000m${i}`, { ok: true, preview: 'discard', outputPreview: 'discard' }])) });
  const instance = tester();
  assert.equal(instance.results.size, 1000);
  assert.equal(instance.last('a', 'm0'), undefined);
  assert.equal(instance.last('a', 'm5').preview, undefined);
  instance.record('a', 'm5', { ok: true, preview: 'excluded', outputPreview: 'excluded' });
  instance.record('a', 'new', { ok: true });
  assert.equal(instance.results.size, 1000);
  assert.equal(instance.last('a', 'm6'), undefined);
  assert.equal(instance.last('a', 'm5').outputPreview, undefined);
  assert.equal(Object.keys(readCache('model-tests.json').results).length, 1000);
});
