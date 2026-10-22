/**
 * Each channel keeps its own model list, even when two channels point at the
 * same gateway with the same token: gateway A may enable DeepSeek while B does not.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DSH_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nas-per-channel-'));
const { Catalog } = await import('../lib/catalog.js');
const { applyModelsSet, resolveChannels } = await import('../lib/channels.js');

const noDev = { match: () => undefined, refresh: async () => {} };
const gateway = { data: [{ id: 'deepseek-v4' }, { id: 'gpt-6' }, { id: 'claude-5' }] };

test('two channels on one gateway build independent model lists', () => {
  const cat = new Catalog({ modelsDev: noDev });
  const a = cat.build({ overrides: {}, enabledModels: ['deepseek-v4', 'gpt-6'] }, { models: gateway });
  const b = cat.build({ overrides: {}, enabledModels: ['claude-5'] }, { models: gateway });
  assert.deepEqual(a.entries.map((e) => e.id), ['deepseek-v4', 'gpt-6']);
  assert.deepEqual(b.entries.map((e) => e.id), ['claude-5']);
  assert.ok(!b.entries.some((e) => e.id === 'deepseek-v4'), 'B must not inherit A\'s DeepSeek');
});

test('catalog cache never serves one channel\'s list to another', () => {
  const cat = new Catalog({ modelsDev: noDev });
  const shared = { baseURL: 'http://g', keyFingerprint: 'same-token', overridesRev: 'r', headers: {} };
  const keyA = cat.key({ ...shared, channelId: 'a', enabledModels: ['deepseek-v4'] });
  const keyB = cat.key({ ...shared, channelId: 'b', enabledModels: ['claude-5'] });
  assert.notEqual(keyA, keyB);
});

test('editing one channel\'s list leaves the other untouched', () => {
  const { list } = resolveChannels({
    channels: [
      { id: 'a', baseURL: 'http://g', apiKeyEnv: 'K', enabledModels: ['deepseek-v4', 'gpt-6'] },
      { id: 'b', baseURL: 'http://g', apiKeyEnv: 'K', enabledModels: ['gpt-6'] },
    ],
  });
  const [a, b] = list;
  applyModelsSet(a, { remove: ['deepseek-v4'] });
  applyModelsSet(b, { add: ['claude-5'] });
  assert.deepEqual(a.enabledModels, ['gpt-6']);
  assert.deepEqual(b.enabledModels, ['gpt-6', 'claude-5']);
});

test('per-channel parameter overrides stay with their channel', () => {
  const cat = new Catalog({ modelsDev: noDev });
  const a = cat.build({ overrides: { 'gpt-6': { contextWindow: 64000 } }, enabledModels: ['gpt-6'] }, { models: gateway });
  const b = cat.build({ overrides: {}, enabledModels: ['gpt-6'] }, { models: gateway });
  assert.equal(a.entries[0].contextWindow, 64000);
  assert.notEqual(b.entries[0].contextWindow, 64000);
});
