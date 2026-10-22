import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelService } from '../lib/channels.js';

function schemaFixture({ changeApplied } = {}) {
  let revision = 19;
  let current = { channels: [{ id: 'default', name: 'Local', baseURL: 'https://local.example', apiKeyEnv: 'LOCAL', models: {}, headers: {} }], activeChannel: 'default' };
  const settings = {
    describe: () => [{ ns: 'studio', revision }],
    async mutate(_ns, ops, expected) {
      assert.equal(expected, revision);
      // Settings accepts JSON-shaped data, not parser-materialized undefined.
      const rejectUndefined = (value) => {
        if (value && typeof value === 'object') for (const child of Object.values(value)) { assert.notEqual(child, undefined); rejectUndefined(child); }
      };
      rejectUndefined(ops);
      for (const op of ops) { if (op.op === 'set') current[op.path[0]] = structuredClone(op.value); else delete current[op.path[0]]; }
      // Reproduce schema output: optional properties present but undefined,
      // records with different prototypes, and reordered own properties.
      for (const channel of current.channels) {
        channel.optionalFuture = undefined;
        channel.models = Object.assign(Object.create(null), channel.models);
        for (const id of Object.keys(channel.models)) {
          channel.models[id] = Object.assign(Object.create(null), {
            protocol: undefined, hidden: undefined, name: undefined,
            custom: undefined, reasoningLevels: undefined,
            ...Object.fromEntries(Object.entries(channel.models[id]).reverse()),
          });
        }
      }
      changeApplied?.(current);
      revision++;
    },
  };
  return { current: () => current, service: new ChannelService({ ns: 'studio', current: () => current, settings: () => settings }) };
}

test('live model override accepts schema-filled undefined and prototype differences; next write stays JSON-shaped', async () => {
  const f = schemaFixture();
  const saved = await f.service.run('model_override', { channelId: 'default', modelId: 'codex-auto-review', revision: 19, override: { contextWindow: 131072, hidden: false } });
  assert.equal(saved.ok, true); assert.equal(saved.revision, 20);
  assert.equal(f.current().channels[0].models['codex-auto-review'].hidden, false);
  const again = await f.service.run('model_override', { channelId: 'default', modelId: 'codex-auto-review', revision: 20, override: { maxTokens: 32768 } });
  assert.equal(again.ok, true); assert.equal(again.revision, 21);
  assert.equal(f.current().channels[0].models['codex-auto-review'].contextWindow, 131072);
  assert.equal(f.current().channels[0].models['codex-auto-review'].hidden, false);
});

test('JSON comparison preserves explicit false and null in unchanged unknown fields', async () => {
  const f = schemaFixture();
  f.current().channels[0].models.m = { custom: false, future: { enabled: false, value: null } };
  await f.service.run('model_override', { channelId: 'default', modelId: 'm', revision: 19, override: { contextWindow: 1024 } });
  assert.deepEqual(f.current().channels[0].models.m.future, { enabled: false, value: null });
  assert.equal(f.current().channels[0].models.m.custom, false);
});

for (const [label, changeApplied] of [
  ['false changed to absent', (value) => { delete value.channels[0].models.m.hidden; }],
  ['null changed to absent', (value) => { delete value.channels[0].models.m.future.value; }],
  ['real numeric change', (value) => { value.channels[0].models.m.contextWindow = 2048; }],
]) {
  test(`JSON comparison still rejects ${label}`, async () => {
    const f = schemaFixture({ changeApplied });
    f.current().channels[0].models.m = { hidden: false, future: { value: null } };
    await assert.rejects(f.service.run('model_override', { channelId: 'default', modelId: 'm', revision: 19, override: { contextWindow: 1024 } }), /live channel update was not observed/);
  });
}
