/**
 * Reasoning level resolution.
 *
 * The bug this locks down: with no override, every reasoning model used to advertise
 * the same `off/minimal/low/medium/high` set, because no `thinkingLevelMap` reached
 * pi-ai. Vendors differ — Gemini 3 cannot be turned off, DeepSeek has a gap at
 * `medium`, `xhigh`/`max` only exist where they are explicitly mapped.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DSH_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'newapi-provider-levels-'));
const { LevelCatalog, levelsFromMap, mapFromLevels, resolveReasoningLevels, LEVELS } = await import('../lib/levels.js');
const { Catalog } = await import('../lib/catalog.js');

/** No pi-ai catalogs: exercise the family defaults only. */
const familyOnly = () => new LevelCatalog({ providers: [] });

test('a map decides which levels exist; xhigh and max need an explicit mapping', () => {
  assert.deepEqual(levelsFromMap(undefined), ['off', 'minimal', 'low', 'medium', 'high']);
  // Claude adaptive: exactly what pi-ai ships — off hidden, minimal still offered,
  // xhigh/max appear because they are mapped.
  assert.deepEqual(levelsFromMap({ off: null, xhigh: 'xhigh', max: 'max' }), ['minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
  // Gemini 3 pro: two step levers.
  assert.deepEqual(levelsFromMap({ off: null, minimal: null, low: 'LOW', medium: null, high: 'HIGH' }), ['low', 'high']);
  // DeepSeek v4: gap at medium.
  assert.deepEqual(levelsFromMap({ minimal: null, low: 'low', medium: null, high: 'high', max: 'max' }), ['off', 'low', 'high', 'max']);
});

test('mapFromLevels keeps upstream strings and hides everything else', () => {
  const map = mapFromLevels(['low', 'high'], { low: 'LOW', high: 'HIGH', off: 'none' });
  assert.deepEqual(map, { off: null, minimal: null, low: 'LOW', medium: null, high: 'HIGH', xhigh: null, max: null });
  // Without a base the level id is the wire value.
  assert.equal(mapFromLevels(['medium']).medium, 'medium');
  assert.equal(mapFromLevels([]), undefined);
});

test('family defaults differ by vendor instead of one global set', async () => {
  const catalog = familyOnly();
  const levels = async (id) => (await resolveReasoningLevels({ id, catalog })).levels;
  // Anthropic effort has no "minimal": low/medium/high/xhigh/max.
  assert.deepEqual(await levels('claude-opus-5-5'), ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.deepEqual(await levels('claude-3-7-sonnet'), ['off', 'minimal', 'low', 'medium', 'high']);
  assert.deepEqual(await levels('gpt-5'), ['minimal', 'low', 'medium', 'high']);
  assert.deepEqual(await levels('gpt-5.6-luna'), ['off', 'low', 'medium', 'high', 'xhigh', 'max']);
  assert.deepEqual(await levels('o3'), ['low', 'medium', 'high']);
  // Gemini 3 thinking_level: MINIMAL/LOW/MEDIUM/HIGH, never off.
  assert.deepEqual(await levels('gemini-3-pro'), ['minimal', 'low', 'medium', 'high']);
  assert.deepEqual(await levels('deepseek-v4.1-flash'), ['off', 'low', 'high', 'max']);
  // GLM-5.3 rejects `disabled`, so off must not be offered; it also has no medium.
  assert.deepEqual(await levels('glm-5.3'), ['low', 'high', 'max']);
  assert.deepEqual(await levels('gpt-5-pro'), ['high']);
  assert.deepEqual(await levels('kimi-k3'), ['low', 'high', 'max']);
  // Nothing recognised: pi-ai's own default, never a made-up set.
  assert.deepEqual(await levels('totally-unknown-model'), ['off', 'minimal', 'low', 'medium', 'high']);
});

test('shipped catalog wins over the family default; the user override wins over both', async () => {
  const catalog = new LevelCatalog({ providers: [] });
  // Stand in for pi-ai's shipped entry for this id.
  catalog.index = new Map([['gemini-2-5-flash', { id: 'gemini-2.5-flash', thinkingLevelMap: { off: '0', minimal: null, low: null, medium: null, high: null } }]]);
  catalog.loading = Promise.resolve(catalog.index);

  const shipped = await resolveReasoningLevels({ id: 'gemini-2.5-flash', catalog });
  assert.equal(shipped.source, 'catalog');
  assert.deepEqual(shipped.levels, ['off']);

  const mine = await resolveReasoningLevels({ id: 'gemini-2.5-flash', override: ['high'], catalog });
  assert.equal(mine.source, 'override');
  assert.deepEqual(mine.levels, ['high']);
  assert.equal(mine.map.low, null, 'levels outside the override are hidden');

  // An override on an unknown model still yields a valid map.
  const custom = await resolveReasoningLevels({ id: 'private-model', override: ['medium'], catalog });
  assert.deepEqual(custom.levels, ['medium']);
  assert.equal(custom.map.max, null);
});

test('one relay gateway produces different level sets per model', async () => {
  // Capability source marks these as reasoning models, as current models.dev data does.
  const modelsDev = { refresh: async () => {}, status: () => ({}), match: () => ({ reasoning: true, context: 200000, output: 64000, provider: 'x', match: 'exact' }) };
  const cat = new Catalog({ modelsDev, logger: { warn() {} }, levels: familyOnly() });
  const conn = { channelId: 'c1', baseURL: 'https://gw.example.com', providerId: 'newapi-provider', keyFingerprint: 'k', overridesRev: '1', headers: {}, defaultContextWindow: 128000, defaultMaxTokens: 32768, overrides: { 'claude-opus-5-5': { reasoningLevels: ['low', 'max'] } } };
  const ids = ['claude-opus-5-5', 'gemini-3-pro', 'gpt-5.6-luna', 'deepseek-v4.1-flash'];
  const info = await cat.resolveLevels(conn, { models: { data: ids.map((id) => ({ id })) } });
  const built = cat.build(conn, { models: { data: ids.map((id) => ({ id })) } }, info);
  const byId = Object.fromEntries(built.entries.map((e) => [e.id, e]));

  assert.deepEqual(byId['gemini-3-pro'].reasoningLevels, ['minimal', 'low', 'medium', 'high']);
  assert.deepEqual(byId['deepseek-v4.1-flash'].reasoningLevels, ['off', 'low', 'high', 'max']);
  assert.deepEqual(byId['gpt-5.6-luna'].reasoningLevels, ['off', 'low', 'medium', 'high', 'xhigh', 'max']);
  // Overridden model keeps its declared set and remembers what the default would be.
  assert.deepEqual(byId['claude-opus-5-5'].reasoningLevels, ['low', 'max']);
  assert.deepEqual(byId['claude-opus-5-5'].automaticReasoningLevels, ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(byId['claude-opus-5-5'].reasoningLevelsSource, 'override');
  assert.equal(byId['gemini-3-pro'].reasoningLevelsSource, 'family');
  // The advertised list and the map must agree: pi-ai derives its selector from the
  // map, DSH rejects any effort we did not advertise, so a mismatch is a 400 waiting.
  for (const entry of built.entries) {
    if (!entry.reasoning) continue;
    assert.deepEqual(levelsFromMap(entry.thinkingLevelMap), entry.reasoningLevels, `levels disagree with the map for ${entry.id}`);
  }
});

test('a user-supplied level map decides both the selector and the wire value', async () => {
  const catalog = familyOnly();
  // Exactly what the editor table stores: level → API value, blank meaning "send nothing".
  const overrideMap = { off: null, minimal: null, low: 'low', medium: null, high: 'high', xhigh: null, max: 'max' };
  const resolved = await resolveReasoningLevels({ id: 'claude-opus-5-5', overrideMap, catalog });
  assert.equal(resolved.source, 'override');
  assert.deepEqual(resolved.levels, ['low', 'high', 'max']);
  assert.deepEqual(resolved.map, overrideMap);

  // A level mapped to a vendor-specific string is passed through untouched.
  const gemini = await resolveReasoningLevels({ id: 'gemini-3-pro', overrideMap: { low: 'LOW', high: 'HIGH' }, catalog });
  assert.deepEqual(gemini.levels, ['low', 'high']);
  assert.equal(gemini.map.low, 'LOW');
});

test('custom level names work when they carry a wire value', async () => {
  const catalog = familyOnly();
  const overrideMap = { low: 'low', high: 'high', ultra: 'ULTRA', bogus: null };
  const resolved = await resolveReasoningLevels({ id: 'claude-opus-5-5', overrideMap, catalog });
  // Preset levels first, then the custom one; a custom name without a value is not offered.
  assert.deepEqual(resolved.levels, ['low', 'high', 'ultra']);
  assert.equal(resolved.map.ultra, 'ULTRA');
  assert.equal(resolved.map.bogus, undefined);

  // A custom name that is not a safe id never becomes a level.
  const rejected = await resolveReasoningLevels({ id: 'x', overrideMap: { 'Not An Id': 'x' }, catalog });
  assert.deepEqual(rejected.levels, ['off', 'minimal', 'low', 'medium', 'high']);
});
