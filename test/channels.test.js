import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelService, resolveChannels, mergeModelOverride, taskChannel, registerAsyncEffect } from '../lib/channels.js';

function fixture(raw = { channels: [{ id: 'a', name: 'A', baseURL: 'https://a.example', apiKeyEnv: 'A', models: {} }, { id: 'b', name: 'B', baseURL: 'https://b.example', apiKeyEnv: 'B', models: {} }], activeChannel: 'a', providerId: 'newapi-studio', unrelated: { keep: true } }) {
  let value = structuredClone(raw), revision = 7;
  const keys = new Map([['A', 'secret-a'], ['B', 'secret-b']]);
  const calls = [];
  let fail = false, noop = false;
  const settings = {
    describe: () => [{ ns: 'studio', revision }],
    async mutate(ns, ops, expected) {
      calls.push({ ns, ops, expected });
      assert.equal(expected, revision);
      if (fail) throw new Error('persist failed');
      if (noop) return;
      value = structuredClone(value);
      for (const op of ops) { if (op.op === 'set') value[op.path[0]] = structuredClone(op.value); else delete value[op.path[0]]; }
      revision++;
    },
  };
  const host = {
    ns: 'studio', settings: () => settings, current: () => value,
    keyConfigured: async (c) => keys.has(c.apiKeyEnv), keyFor: async (c) => keys.get(c.apiKeyEnv),
    storeKey: async (name, key) => { keys.set(name, key); }, unsetKey: async (name) => keys.delete(name),
    testGateway: async (args) => { calls.push(args); return { ok: true, baseURL: args.baseURL }; },
  };
  return { service: new ChannelService(host), keys, calls, current: () => value, setFail: () => { fail = true; }, setNoop: () => { noop = true; } };
}

test('legacy resolver preserves local token, headers and model overrides; exactly one active', () => {
  const state = resolveChannels({ baseURL: 'http://127.0.0.1:3300/v1', apiKeyEnv: 'MY_LOCAL_TOKEN', headers: { x: 'keep' }, models: { m: { custom: true, protocol: 'anthropic' } } });
  assert.equal(state.active.id, 'default');
  assert.equal(state.active.apiKeyEnv, 'MY_LOCAL_TOKEN');
  assert.equal(state.active.models.m.protocol, 'anthropic');
  assert.equal(resolveChannels({ channels: [{ id: 'a' }, { id: 'b' }], activeChannel: 'missing' }).active.id, 'a');
  assert.throws(() => resolveChannels({ channels: [{ id: 'a' }, { id: 'a' }] }), /duplicate/);
});

test('list is bounded, credential-free and supplies CAS revision', async () => {
  const f = fixture(); const result = await f.service.run('list', { limit: 1 });
  assert.equal(result.channels.length, 1); assert.equal(result.nextOffset, 1); assert.equal(result.total, 2);
  assert.equal(result.revision, 7); assert.equal(result.channels[0].keyConfigured, true);
  assert.ok(!JSON.stringify(result).includes('secret-'));
  assert.equal((await f.service.run('list', { offset: 1 })).channels[0].id, 'b');
});

test('writes require revision and serialize competing stale updates', async () => {
  const f = fixture();
  await assert.rejects(f.service.run('activate', { id: 'b' }), /revision/);
  const outcomes = await Promise.allSettled([
    f.service.run('activate', { id: 'b', revision: 7 }),
    f.service.run('delete', { id: 'a', revision: 7 }),
  ]);
  assert.equal(outcomes[0].status, 'fulfilled'); assert.equal(outcomes[1].reason.status, 409);
  assert.equal(f.current().activeChannel, 'b'); assert.equal(f.current().channels.length, 2);
  assert.equal(f.current().providerId, 'newapi-studio'); assert.deepEqual(f.current().unrelated, { keep: true });
  assert.equal(f.calls[0].expected, 7);
});

test('legacy migration preserves settings and never deletes ambient credential', async () => {
  const f = fixture({ baseURL: 'https://a.example', apiKeyEnv: 'A', models: { m: { custom: true } }, headers: { 'x-local': 'keep' }, providerId: 'newapi-studio' });
  await f.service.run('save', { id: 'default', revision: 7, name: 'Local', baseURL: 'https://a.example' });
  assert.equal(f.current().channels[0].apiKeyEnv, 'A');
  assert.deepEqual(f.current().channels[0].models, { m: { custom: true } });
  assert.equal(f.current().headers['x-local'], 'keep');
  assert.equal(f.current().baseURL, undefined); assert.equal(f.keys.get('A'), 'secret-a');
});

test('save stages a unique credential; failed persistence cannot rotate a live key', async () => {
  const f = fixture(); f.setFail();
  await assert.rejects(f.service.run('save', { id: 'a', revision: 7, name: 'A', baseURL: 'https://a.example', apiKey: 'new-secret' }), /persist failed/);
  assert.equal(f.keys.size, 2); assert.equal(f.keys.get('A'), 'secret-a');
  assert.equal(f.current().channels[0].apiKeyEnv, 'A');
});

test('save new channel preserves active; activation and deletion keep one active and at least one channel', async () => {
  const f = fixture();
  const saved = await f.service.run('save', { revision: 7, name: 'C', baseURL: 'https://c.example/v1', apiKey: 'secret-c' });
  assert.equal(f.current().activeChannel, 'a'); assert.equal(f.current().channels[2].baseURL, 'https://c.example');
  assert.ok(!JSON.stringify(saved).includes('secret-c'));
  await f.service.run('activate', { id: saved.channelId, revision: 8 });
  await f.service.run('delete', { id: saved.channelId, revision: 9 });
  assert.equal(f.current().activeChannel, 'a');
  await f.service.run('delete', { id: 'a', revision: 10 });
  assert.equal(f.current().activeChannel, 'b');
  await assert.rejects(f.service.run('delete', { id: 'b', revision: 11 }), /at least one/);
  assert.equal(f.keys.get('A'), 'secret-a');
});

test('settings mutation must update live config before reporting success', async () => {
  const f = fixture(); f.setNoop();
  await assert.rejects(f.service.run('activate', { id: 'b', revision: 7 }), /live channel update/);
});

test('model edits target channelId and preserve protocol, custom, unknown fields and explicit false', async () => {
  const f = fixture();
  f.current().channels[0].models.m = { protocol: 'anthropic', custom: true, hidden: true, reasoningLevels: ['high'], future: { keep: true }, maxTokens: 10 };
  await f.service.run('activate', { id: 'b', revision: 7 });
  await assert.rejects(f.service.run('model_override', { modelId: 'm', revision: 8, override: {} }), /channelId/);
  await f.service.run('model_override', { channelId: 'a', modelId: 'm', revision: 8, override: { maxTokens: 20, hidden: false, contextWindow: null, future: { keep: true } } });
  assert.deepEqual(f.current().channels[0].models.m, { protocol: 'anthropic', custom: true, hidden: false, reasoningLevels: ['high'], future: { keep: true }, maxTokens: 20 });
  assert.deepEqual(f.current().channels[1].models, {});
  await f.service.run('model_override', { channelId: 'a', modelId: 'm', revision: 9, reset: true });
  assert.deepEqual(f.current().channels[0].models, {});
  assert.throws(() => mergeModelOverride({}, { maxTokens: -1 }), /invalid/);
  assert.throws(() => mergeModelOverride({}, { future: true }), /unsupported/);
});

test('test is read-only and never forwards a saved key to changed or invalid gateway', async () => {
  const f = fixture();
  await assert.rejects(f.service.run('test', { id: 'a', baseURL: 'https://other.example' }), /changed gateway/);
  await assert.rejects(f.service.run('test', { apiKey: 'secret', baseURL: 'https://user:password@example.com' }), /without credentials/);
  const result = await f.service.run('test', { id: 'a' }); assert.equal(result.ok, true);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].apiKey, 'secret-a');
  assert.equal(f.current().activeChannel, 'a'); assert.equal(f.service.revision(), 7);
});

test('video task lookup binds origin and fails closed for legacy, deleted or moved gateways', () => {
  const state = resolveChannels({ channels: [{ id: 'a', baseURL: 'https://a.example', apiKeyEnv: 'ROTATED' }, { id: 'b', baseURL: 'https://b.example', apiKeyEnv: 'B' }], activeChannel: 'b' });
  const task = { origin: { channelId: 'a', baseURL: 'https://a.example', keyName: 'ORIGINAL_A' } };
  assert.equal(taskChannel(task, state.list).apiKeyEnv, 'ORIGINAL_A');
  assert.equal(taskChannel(task, state.list).baseURL, 'https://a.example');
  assert.throws(() => taskChannel({}, state.list), /legacy/);
  assert.throws(() => taskChannel(task, state.list.slice(1)), /removed/);
  assert.throws(() => taskChannel(task, [{ ...state.list[0], baseURL: 'https://other.example' }]), /changed/);
});

test('late async tool registration is disposed even after plugin unload', async () => {
  let cleanup, complete, removed = 0;
  const pending = new Promise((r) => { complete = r; });
  registerAsyncEffect({ effect: (fn) => { cleanup = fn(); } }, () => pending);
  const disposing = cleanup();
  complete(() => { removed++; });
  await disposing;
  assert.equal(removed, 1);
});
