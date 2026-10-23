/**
 * Capability-lookup and model-id edge cases.
 *
 * Two independent failure modes are covered:
 *  1. The models.dev switch must disable lookups, not just refreshes.
 *  2. Gateway model ids that collide with Object.prototype names must stay data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DSH_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'newapi-provider-ids-'));
const { ModelsDev } = await import('../lib/modelsdev.js');
const { Catalog } = await import('../lib/catalog.js');
const { writeCache } = await import('../lib/util.js');

const doc = { anthropic: { models: { 'claude-opus-5-5': { limit: { context: 200000, output: 64000 }, modalities: { input: ['text'], output: ['text'] } } } } };

test('models.dev switch off also disables lookups from the disk cache', () => {
  // Seed a cache exactly as a previous session would have left it.
  const seed = new ModelsDev({ enabled: true });
  seed.index = { 'claude-opus-5-5': [{ provider: 'anthropic', context: 200000, output: 64000, input: ['text'], outputModalities: ['text'], reasoning: false }] };
  writeCache('models-dev-index.json', { version: 1, fetchedAt: Date.now(), index: seed.index });
  const disabled = new ModelsDev({ enabled: false });
  assert.ok(disabled.index, 'the cached index is still loaded, but must not be used');
  assert.equal(disabled.match('claude-opus-5-5'), undefined);
  assert.equal(new ModelsDev({ enabled: true }).match('claude-opus-5-5').context, 200000);
});

test('prototype-named model ids do not crash or leak built-ins', () => {
  const modelsDev = new ModelsDev({ enabled: true });
  modelsDev.index = Object.create(null);
  modelsDev.index.constructor = [{ provider: 'x', context: 1000, output: 100, input: ['text'], outputModalities: ['text'], reasoning: false }];
  assert.equal(modelsDev.match('constructor').context, 1000);
  assert.equal(modelsDev.match('toString'), undefined, 'Object.prototype must not answer');
  assert.equal(modelsDev.match('hasOwnProperty'), undefined);

  const cat = new Catalog({ modelsDev: { match: (id) => modelsDev.match(id), refresh: async () => {} } });
  const built = cat.build(
    { overrides: { toString: { contextWindow: 4321 } }, enabledModels: ['constructor', 'toString', 'valueOf'] },
    { models: { data: [{ id: 'constructor' }] } },
  );
  assert.deepEqual(built.entries.map((e) => e.id), ['constructor', 'toString', 'valueOf']);
  const own = built.entries.find((e) => e.id === 'toString');
  assert.equal(own.contextWindow, 4321, 'the override is read as data');
  assert.equal(typeof own.name, 'string');
  const untouched = built.entries.find((e) => e.id === 'valueOf');
  assert.equal(untouched.contextWindow, undefined, 'no inherited function leaks into the entry');
  // The payload the UI clones in structuredClone must stay cloneable.
  structuredClone(own);
});

test('prototype-named override in automatic mode is only emitted when marked custom', () => {
  const cat = new Catalog({ modelsDev: { match: () => undefined, refresh: async () => {} } });
  const built = cat.build({ overrides: { toString: { custom: true }, valueOf: {} } }, { models: { data: [] } });
  assert.deepEqual(built.entries.map((e) => e.id), ['toString']);
});
