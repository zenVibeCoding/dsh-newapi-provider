/**
 * Enabled-model list, gateway catalog marking, and single-model tests.
 * Offline: a fake gateway on localhost, no DSH imports, no real billing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DSH_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'newapi-provider-list-'));
const { applyModelsSet, resolveChannels } = await import('../lib/channels.js');
const { Catalog } = await import('../lib/catalog.js');
const { ModelTester, classifyTestError, pickTestProtocol, requestFor } = await import('../lib/model-test.js');

const noDev = { match: () => undefined, refresh: async () => {} };

// ------------------------------------------------------------------ list edits

test('first edit materializes the automatic list from the gateway baseline', () => {
  const ch = resolveChannels({ channels: [{ id: 'a', baseURL: 'http://g', apiKeyEnv: 'K' }] }).list[0];
  assert.equal(ch.enabledModels, undefined, 'legacy channel is in automatic mode');
  applyModelsSet(ch, { remove: ['m2'] }, ['m1', 'm2', 'm3']);
  assert.deepEqual(ch.enabledModels, ['m1', 'm3']);
});

test('automatic channel without a readable baseline refuses instead of emptying the list', () => {
  const ch = { id: 'a', models: {} };
  assert.throws(() => applyModelsSet(ch, { add: ['x'] }, undefined), /cannot read the gateway model list/);
});

test('add keeps order and ignores duplicates; remove keeps overrides unless asked', () => {
  const ch = { id: 'a', enabledModels: ['m1'], models: { m1: { contextWindow: 9000 } } };
  applyModelsSet(ch, { add: ['m2', 'm1', 'm2'] });
  assert.deepEqual(ch.enabledModels, ['m1', 'm2']);
  applyModelsSet(ch, { remove: ['m1'] });
  assert.deepEqual(ch.enabledModels, ['m2']);
  assert.deepEqual(ch.models.m1, { contextWindow: 9000 }, 'override kept for a later re-add');
  applyModelsSet(ch, { add: ['m1'] });
  applyModelsSet(ch, { remove: ['m1'], clearOverrides: true });
  assert.equal(ch.models.m1, undefined);
});

test('undo restores the model and its parameters through overrides', () => {
  const ch = { id: 'a', enabledModels: ['m2'], models: {} };
  applyModelsSet(ch, { add: ['m1'], overrides: { m1: { contextWindow: 9000, input: ['text', 'image'] } } });
  assert.deepEqual(ch.enabledModels, ['m2', 'm1']);
  assert.deepEqual(ch.models.m1, { contextWindow: 9000, input: ['text', 'image'] });
});

test('manual add marks custom and validates ids and payloads', () => {
  const ch = { id: 'a', enabledModels: [], models: {} };
  applyModelsSet(ch, { add: ['private-model'], overrides: { 'private-model': { custom: true, kind: 'chat' } } });
  assert.equal(ch.models['private-model'].custom, true);
  assert.throws(() => applyModelsSet(ch, { add: ['__proto__'] }), /invalid modelId/);
  assert.throws(() => applyModelsSet(ch, { add: '' }), /must be an array/);
  assert.throws(() => applyModelsSet(ch, {}), /nothing to change/);
  assert.throws(() => applyModelsSet(ch, { add: Array.from({ length: 1001 }, (_, i) => `m${i}`) }), /at most 1000/);
  assert.throws(() => applyModelsSet(ch, { overrides: { x: { contextWindow: -1 } } }), /invalid override field/);
});

// ------------------------------------------------------------------ catalog

const gatewayDoc = { data: [{ id: 'm1', supported_endpoint_types: ['openai'] }, { id: 'm2' }, { id: 'gpt-image-2' }] };

test('list mode shows exactly the saved list and marks gone/custom models', () => {
  const cat = new Catalog({ modelsDev: noDev });
  const conn = { overrides: { 'private-x': { custom: true } }, enabledModels: ['m2', 'gone', 'private-x', 'gpt-image-2'] };
  const built = cat.build(conn, { models: gatewayDoc });
  assert.equal(built.listMode, 'list');
  assert.deepEqual(built.entries.map((e) => [e.id, e.availability]), [['m2', 'listed'], ['gone', 'missing'], ['private-x', 'custom'], ['gpt-image-2', 'listed']]);
  assert.deepEqual(built.gatewayIds, ['m1', 'm2', 'gpt-image-2']);
  assert.equal(built.entries.find((e) => e.id === 'gpt-image-2').kind, 'image');
});

test('automatic mode keeps showing every gateway model (no change for existing users)', () => {
  const built = new Catalog({ modelsDev: noDev }).build({ overrides: {} }, { models: gatewayDoc });
  assert.equal(built.listMode, 'auto');
  assert.deepEqual(built.entries.map((e) => e.id), ['m1', 'm2', 'gpt-image-2']);
});

test('catalog cache key changes when the enabled list changes', () => {
  const cat = new Catalog({ modelsDev: noDev });
  const base = { channelId: 'a', baseURL: 'http://g', keyFingerprint: 'k', overridesRev: 'r', headers: {} };
  assert.notEqual(cat.key({ ...base, enabledModels: ['m1'] }), cat.key({ ...base, enabledModels: ['m1', 'm2'] }));
});

// ------------------------------------------------------------------ model tests

test('protocol choice and request shapes', () => {
  assert.equal(pickTestProtocol(['openai'], ['openai', 'anthropic']), 'openai');
  assert.equal(pickTestProtocol(['openai-response', 'anthropic'], ['openai', 'anthropic', 'openai-response']), 'anthropic');
  assert.equal(pickTestProtocol(['gemini'], []), 'unsupported');
  const a = requestFor('anthropic', 'http://g', 'm', 'sk-x');
  assert.equal(a.url, 'http://g/v1/messages');
  assert.equal(a.headers['x-api-key'], 'sk-x');
  assert.equal(a.body.max_tokens, 16);
  const r = requestFor('responses', 'http://g', 'm', 'sk-x');
  assert.equal(r.url, 'http://g/v1/responses');
  assert.equal(r.body.max_output_tokens, 16);
  assert.equal(requestFor('openai', 'http://g', 'm', 'sk-x').url, 'http://g/v1/chat/completions');
});

test('New API "no channel" errors are classified for the UI', () => {
  assert.equal(classifyTestError(503, 'No available channel for model gpt-image-2 under group default'), 'NO_CHANNEL');
  assert.equal(classifyTestError(400, 'unknown provider for model gpt-5.6-luna'), 'NO_CHANNEL');
  assert.equal(classifyTestError(401, 'invalid token'), 'AUTH');
  assert.equal(classifyTestError(429, 'slow down'), 'RATE_LIMIT');
  assert.equal(classifyTestError(500, 'boom'), 'HTTP');
});

function fakeGateway() {
  const calls = [];
  let delayMs = 0;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      calls.push({ url: req.url, auth: req.headers.authorization, xKey: req.headers['x-api-key'], body: body ? JSON.parse(body) : undefined });
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      const model = calls.at(-1).body?.model;
      if (model === 'broken') {
        res.writeHead(503, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: { message: 'No available channel for model broken under group default', type: 'new_api_error' } }));
      }
      if (req.url === '/v1/images/generations') {
        res.writeHead(200, { 'content-type': 'application/json' });
        const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
        return res.end(JSON.stringify({ data: [{ b64_json: png }] }));
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      if (req.url === '/v1/messages') {
        res.write('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"OK"}}\n\n');
      } else if (req.url === '/v1/responses') {
        res.write('data: {"type":"response.output_text.delta","delta":"OK"}\n\n');
      } else {
        res.write('data: {"choices":[{"delta":{"content":"OK"}}]}\n\n');
      }
      setTimeout(() => res.end('data: [DONE]\n\n'), 20);
    });
  });
  return {
    calls,
    setDelay: (ms) => { delayMs = ms; },
    listen: () => new Promise((r) => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}`))),
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }),
  };
}

function tester(base, entries, extra = {}) {
  return new ModelTester({
    channelFacts: async (id) => {
      if (id !== 'a' && id !== 'b') throw Object.assign(new Error('unknown channel'), { status: 404 });
      return { baseURL: base, headers: {}, endpointPriority: ['openai', 'anthropic', 'openai-response'], apiKey: async () => (id === 'a' ? 'sk-a' : 'sk-b') };
    },
    entryFor: async (_id, modelId) => entries[modelId],
    ...extra,
  });
}

test('chat test over each protocol reports latency and first packet, using the channel key', async () => {
  const gw = fakeGateway();
  const base = await gw.listen();
  const t = tester(base, {
    oa: { kind: 'chat', endpointTypes: ['openai'] },
    an: { kind: 'chat', endpointTypes: ['anthropic'] },
    rs: { kind: 'chat', endpointTypes: ['openai-response'] },
  });
  for (const [model, url] of [['oa', '/v1/chat/completions'], ['an', '/v1/messages'], ['rs', '/v1/responses']]) {
    const r = await t.run({ channelId: 'b', modelId: model });
    assert.equal(r.ok, true, `${model}: ${r.error}`);
    assert.ok(r.firstByteMs >= 0 && r.latencyMs >= r.firstByteMs);
    assert.equal(r.outputPreview, 'OK');
    const call = gw.calls.at(-1);
    assert.equal(call.url, url);
    assert.equal(call.auth, 'Bearer sk-b', 'uses the tested channel\'s key, not the active one');
  }
  assert.equal(t.last('b', 'oa').ok, true, 'result remembered for the settings page');
  assert.equal(t.last('b', 'oa').outputPreview, undefined, 'stored result omits preview text');
  await gw.close();
});

test('failed chat test keeps the gateway message and a NO_CHANNEL code', async () => {
  const gw = fakeGateway();
  const t = tester(await gw.listen(), { broken: { kind: 'chat', endpointTypes: ['openai'] } });
  const r = await t.run({ channelId: 'a', modelId: 'broken' });
  assert.equal(r.ok, false);
  assert.equal(r.status, 503);
  assert.equal(r.code, 'NO_CHANNEL');
  assert.match(r.error, /No available channel/);
  await gw.close();
});

test('image and video tests require confirmPaid and send nothing without it', async () => {
  const gw = fakeGateway();
  let videoSubmits = 0;
  const t = tester(await gw.listen(), { img: { kind: 'image' }, vid: { kind: 'video' }, emb: { kind: 'embedding' } }, {
    submitVideo: async () => { videoSubmits++; return { taskId: 'nv-1' }; },
  });
  await assert.rejects(t.run({ channelId: 'a', modelId: 'img' }), /requires confirmation/);
  await assert.rejects(t.run({ channelId: 'a', modelId: 'vid' }), /requires confirmation/);
  await assert.rejects(t.run({ channelId: 'a', modelId: 'emb', confirmPaid: true }), /not supported/);
  assert.equal(gw.calls.length, 0);
  assert.equal(videoSubmits, 0);
  const img = await t.run({ channelId: 'a', modelId: 'img', confirmPaid: true });
  assert.equal(img.ok, true);
  assert.match(img.preview.src, /^data:image\/png;base64,/);
  const vid = await t.run({ channelId: 'a', modelId: 'vid', confirmPaid: true });
  assert.deepEqual(vid.preview, { type: 'video-task', taskId: 'nv-1' });
  assert.equal(videoSubmits, 1);
  await gw.close();
});

test('at most 3 concurrent tests per channel', async () => {
  const gw = fakeGateway();
  gw.setDelay(300);
  const t = tester(await gw.listen(), { m: { kind: 'chat', endpointTypes: ['openai'] } });
  const running = [1, 2, 3].map(() => t.run({ channelId: 'a', modelId: 'm' }));
  await new Promise((r) => setTimeout(r, 50));
  await assert.rejects(t.run({ channelId: 'a', modelId: 'm' }), (e) => e.status === 429);
  const otherChannel = t.run({ channelId: 'b', modelId: 'm' });
  await Promise.all([...running, otherChannel]);
  await gw.close();
});

test('results persist across restarts and are dropped with their channel', async () => {
  const gw = fakeGateway();
  const base = await gw.listen();
  const first = tester(base, { m: { kind: 'chat', endpointTypes: ['openai'] } });
  await first.run({ channelId: 'a', modelId: 'm' });
  const second = tester(base, {});
  assert.equal(second.last('a', 'm').ok, true);
  second.forget('a');
  assert.equal(tester(base, {}).last('a', 'm'), undefined);
  await gw.close();
});
