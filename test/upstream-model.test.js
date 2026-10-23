import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Catalog, upstreamModelOf } from '../lib/catalog.js';
import { ChannelService, mergeModelOverride } from '../lib/channels.js';
process.env.DSH_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nas-upstream-'));
const { ModelTester } = await import('../lib/model-test.js');

test('upstream override validates, persists under local id, and null clears', async () => {
  for (const bad of ['', '  ', 'x\ny', 'x\u0000y', 'x\u0085y', 'x'.repeat(501), 123, false]) {
    assert.throws(() => mergeModelOverride({}, { upstreamModel: bad }), /invalid override/);
  }
  assert.equal(upstreamModelOf({ id: 'local', upstreamModel: '' }), 'local');
  let raw = { channels: [{ id: 'a', baseURL: 'https://offline.invalid', models: {}, enabledModels: [] }] }, revision = 1;
  const settings = { describe: () => [{ ns: 'test', revision }], mutate: async (_ns, ops, rev) => {
    assert.equal(rev, revision++);
    for (const op of ops) if (op.op === 'set') raw[op.path[0]] = structuredClone(op.value);
  } };
  const svc = new ChannelService({ current: () => raw, ns: 'test', settings: () => settings });
  await svc.run('models_set', { channelId: 'a', revision: 1, add: ['local'], overrides: { local: { upstreamModel: ' remote ', custom: true } } });
  assert.deepEqual(raw.channels[0].enabledModels, ['local']);
  assert.deepEqual(raw.channels[0].models, { local: { upstreamModel: 'remote', custom: true } });
  await svc.run('model_override', { channelId: 'a', revision: 2, modelId: 'local', override: { name: 'Display' } });
  assert.equal(raw.channels[0].models.local.upstreamModel, 'remote');
  await svc.run('model_override', { channelId: 'a', revision: 3, modelId: 'local', override: { upstreamModel: null } });
  assert.deepEqual(raw.channels[0].models, { local: { custom: true, name: 'Display' } });
});

test('catalog maps one hop, prefers target facts, and keeps local identity and source', () => {
  const dev = { local: { context: 10, output: 2, input: ['text'], outputModalities: ['text'], provider: 'local', match: 'exact' }, remote: { context: 100, output: 20, input: ['image'], outputModalities: ['image'], reasoning: true, provider: 'remote', match: 'exact' } };
  const cat = new Catalog({ modelsDev: { match: id => dev[id] } });
  const raw = { models: { data: [{ id: 'local', supported_endpoint_types: ['openai'] }, { id: 'remote', supported_endpoint_types: ['anthropic'] }] }, pricing: { vendors: [{ id: 1, name: 'Target Vendor' }], data: [{ model_name: 'remote', vendor_id: 1, model_ratio: 3 }] } };
  const conn = { enabledModels: ['local'], overrides: { local: { upstreamModel: 'remote', name: 'Display', maxTokens: 9, input: ['text'], reasoning: false }, remote: { upstreamModel: 'third' } } };
  const [e] = cat.build(conn, raw).entries;
  assert.equal(e.id, 'local'); assert.equal(e.name, 'Display'); assert.equal(e.upstreamModel, 'remote');
  assert.equal(e.kind, 'image'); assert.equal(e.contextWindow, 100); assert.equal(e.maxTokens, 9);
  assert.equal(e.automaticMaxTokens, 20); assert.deepEqual(e.automaticInput, ['image']); assert.equal(e.automaticReasoning, true);
  assert.deepEqual(e.endpointTypes, ['anthropic']); assert.equal(e.vendor, 'Target Vendor'); assert.equal(e.pricing.modelRatio, 3);
  assert.equal(e.availability, 'listed'); assert.equal(e.source.metadataModel, 'remote'); assert.equal(e.source.pricingModel, 'remote');
  const alias = cat.build({ ...conn, enabledModels: ['alias'], overrides: { alias: { upstreamModel: 'remote' } } }, raw).entries[0];
  assert.equal(alias.availability, 'listed'); assert.equal(alias.source.gateway, false); assert.equal(alias.source.upstreamGateway, true);
  const fallback = cat.build({ ...conn, overrides: { local: { upstreamModel: 'unknown' } } }, raw).entries[0];
  assert.equal(fallback.contextWindow, 10); assert.equal(fallback.source.metadataModel, 'local'); assert.equal(fallback.availability, 'missing');
  const custom = cat.build({ enabledModels: ['alias'], defaultContextWindow: 456, defaultMaxTokens: 78, overrides: { alias: { upstreamModel: 'unknown', custom: true } } }, raw).entries[0];
  assert.equal(custom.availability, 'custom'); assert.equal(custom.automaticContextWindow, 456); assert.equal(custom.automaticMaxTokens, 78);
  const legacy = cat.build({ overrides: {} }, raw).entries[0];
  assert.equal(legacy.id, 'local'); assert.equal(legacy.upstreamModel, 'local'); assert.equal(legacy.contextWindow, 10); assert.equal(legacy.availability, 'listed');
});

for (const protocol of ['openai', 'openai-response', 'anthropic']) test(`tester ${protocol} sends remote but persists local lastTest`, async (t) => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  let body;
  const terminal = protocol === 'openai' ? { choices: [{ delta: {}, finish_reason: 'stop' }] }
    : protocol === 'anthropic' ? { type: 'message_stop' }
    : { type: 'response.completed', response: { status: 'completed' } };
  globalThis.fetch = async (_url, options) => { body = JSON.parse(options.body); return new Response(`data: ${JSON.stringify(terminal)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } }); };
  const tester = new ModelTester({ channelFacts: async () => ({ baseURL: 'https://offline.invalid', apiKey: async () => 'fake', entryFor: async () => ({ id: 'local', kind: 'chat', upstreamModel: 'remote', endpointTypes: [protocol] }) }) });
  const result = await tester.run({ channelId: 'a', modelId: 'local' });
  assert.equal(body.model, 'remote'); assert.equal(result.ok, true); assert.equal(result.modelId, 'local'); assert.equal(result.upstreamModel, 'remote');
  assert.equal(tester.last('a', 'local').upstreamModel, 'remote'); assert.equal(tester.last('a', 'remote'), undefined);
  assert.equal(new ModelTester({}).last('a', 'local').modelId, 'local');
});

test('image tester sends mapped id; video tester delegates local id to bound media', async (t) => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  let body, videoId;
  globalThis.fetch = async (_url, options) => { body = JSON.parse(options.body); return Response.json({ data: [{ b64_json: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64') }] }); };
  const tester = new ModelTester({ channelFacts: async () => ({ baseURL: 'https://offline.invalid', apiKey: async () => 'fake', entryFor: async id => ({ id, kind: id === 'local-image' ? 'image' : 'video', upstreamModel: 'remote' }), submitVideo: async id => { videoId = id; return { taskId: 'offline-task' }; } }) });
  const image = await tester.run({ channelId: 'a', modelId: 'local-image', confirmPaid: true });
  assert.equal(body.model, 'remote'); assert.equal(image.modelId, 'local-image'); assert.equal(image.upstreamModel, 'remote');
  const video = await tester.run({ channelId: 'a', modelId: 'local-video', confirmPaid: true });
  assert.equal(videoId, 'local-video'); assert.equal(video.upstreamModel, 'remote'); assert.equal(video.phase, 'accepted');
});
