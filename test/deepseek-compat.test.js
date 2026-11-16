/**
 * DeepSeek upstream compatibility.
 *
 * The bug this locks down: a reasoning model sent through a gateway was
 * serialized as an OpenAI request, so the instruction message went out as
 * `role: "developer"`, the output cap as `max_completion_tokens`, and thinking
 * as a bare `reasoning_effort`. DeepSeek's own API rejects the first one
 * outright (`unknown variant 'developer', expected one of system, user,
 * assistant, tool`), so every turn failed before the model ran.
 *
 * pi-ai decides this in `detectCompat()`, which keys on `provider === "deepseek"`
 * or a `*.deepseek.com` base URL — neither survives a gateway host. The fix is to
 * hand pi-ai the compatibility block the harness itself uses for DeepSeek.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DSH_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'newapi-provider-deepseek-'));

/**
 * `lib/adapter.js` imports the harness packages (`@deepseek-ai/dsh-llm`, pi-ai).
 * They are peer dependencies and are not installed in this repo, so load the
 * module through a small linker that maps them to the stubs next to this file.
 * Test files: `../fixtures/stubs/<package>.js`; bare `node --test` gets the same
 * treatment as `npm test`.
 */
async function loadAdapter() {
  // The harness packages are peer dependencies and are not installed in this repo.
  // Copy lib/ next to stubs that answer for them, so the real adapter.js runs
  // unmodified apart from its import specifiers.
  const fixtures = path.join(import.meta.dirname, 'fixtures', 'stubs');
  const lib = path.join(import.meta.dirname, '..', 'lib');
  const stubs = {
    '@deepseek-ai/dsh-llm-pi-ai': 'dsh-llm-pi-ai.js',
    '@deepseek-ai/dsh-llm': 'dsh-llm.js',
    // pi-ai's per-protocol lazy entries all resolve to the same stub.
    '@earendil-works/pi-ai': 'pi-ai.js',
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'newapi-provider-adapter-'));
  test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const name of fs.readdirSync(lib)) fs.copyFileSync(path.join(lib, name), path.join(dir, name));
  for (const stub of Object.values(stubs)) fs.copyFileSync(path.join(fixtures, stub), path.join(dir, stub));
  const source = fs.readFileSync(path.join(lib, 'adapter.js'), 'utf8');
  const rewritten = source.replace(/from '([^']+)';/g, (match, spec) => {
    if (spec.startsWith('./')) return match;
    return `from './${stubs[spec] ?? 'pi-ai.js'}';`;
  });
  fs.writeFileSync(path.join(dir, 'adapter.js'), rewritten);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
  return import(path.join(dir, 'adapter.js'));
}

const { DEEPSEEK_COMPAT, isDeepSeekUpstream, toPiModel } = await loadAdapter();

const conn = { providerId: 'newapi-provider', baseURL: 'http://192.168.58.251:30000' };
const deepseekEntry = {
  id: 'deepseek-flash',
  name: 'deepseek-flash',
  upstreamModel: 'deepseek-flash',
  endpointTypes: ['openai'],
  reasoning: true,
  reasoningLevels: ['off', 'low', 'high', 'max'],
  thinkingLevelMap: { minimal: null, low: 'low', medium: null, high: 'high', max: 'max' },
  input: ['text', 'image'],
  contextWindow: 1048576,
  maxTokens: 393216,
};

test('a DeepSeek model gets the DeepSeek compatibility block', () => {
  const model = toPiModel(deepseekEntry, conn, ['openai']);
  assert.equal(model.compat.supportsDeveloperRole, false, 'the instruction must go out as role system');
  assert.equal(model.compat.maxTokensField, 'max_tokens');
  assert.equal(model.compat.thinkingFormat, 'deepseek');
  assert.equal(model.compat.requiresReasoningContentOnAssistantMessages, true);
  assert.equal(model.compat.supportsStore, false);
  // Everything else about the profile is untouched.
  assert.equal(model.reasoning, true);
  assert.equal(model.api, 'openai-completions');
  assert.deepEqual(model.thinkingLevelMap, deepseekEntry.thinkingLevelMap);
});

test('non-DeepSeek models keep pi-ai auto-detection', () => {
  for (const id of ['gpt-5.6-sol', 'claude-opus-5', 'gemini-4-argon', 'qwen3-235b-a22b', 'grok-5']) {
    const entry = { ...deepseekEntry, id, name: id, upstreamModel: id, thinkingLevelMap: undefined, reasoningLevels: [] };
    assert.equal(toPiModel(entry, conn, ['openai']).compat, undefined, `${id} must not be forced onto DeepSeek compat`);
  }
});

test('the upstream identity is recognised from id, alias, vendor, or base URL', () => {
  assert.equal(isDeepSeekUpstream({ id: 'deepseek-flash' }), true);
  assert.equal(isDeepSeekUpstream({ id: 'DeepSeek-V4.1-Flash' }), true);
  assert.equal(isDeepSeekUpstream({ id: 'relay-alias', upstreamModel: 'deepseek-chat' }), true);
  assert.equal(isDeepSeekUpstream({ id: 'x', vendor: 'DeepSeek' }), true);
  assert.equal(isDeepSeekUpstream({ id: 'x', source: { modelsDev: { provider: 'deepseek' } } }), true);
  assert.equal(isDeepSeekUpstream({ id: 'x' }, { baseURL: 'https://api.deepseek.com' }), true);
  assert.equal(isDeepSeekUpstream({ id: 'claude-opus-5', vendor: 'Anthropic' }, conn), false);
  assert.equal(isDeepSeekUpstream({ id: 'x' }, { baseURL: 'https://openrouter.ai/api' }), false);
  // Degenerate entries never throw.
  assert.equal(isDeepSeekUpstream(undefined, undefined), false);
  assert.equal(isDeepSeekUpstream({}, {}), false);
});

test('the exported block is a fresh copy per model, so callers cannot cross-contaminate', () => {
  const a = toPiModel(deepseekEntry, conn, ['openai']).compat;
  a.maxTokensField = 'mutated';
  assert.equal(DEEPSEEK_COMPAT.maxTokensField, 'max_tokens');
  assert.equal(toPiModel(deepseekEntry, conn, ['openai']).compat.maxTokensField, 'max_tokens');
});
