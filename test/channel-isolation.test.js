import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { Catalog } from '../lib/catalog.js';
import { BalanceService } from '../lib/balance.js';

const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const modelsDev = { refresh: async () => {}, match: () => undefined };
const conn = (id, name) => ({ channelId: id, baseURL: 'https://same.example', keyFingerprint: 'same', overridesRev: id, headers: {}, overrides: { m: { name } } });

test('catalog cache partitions channels and override generations even on the same gateway/token', async () => {
  const cat = new Catalog({ modelsDev });
  let calls = 0;
  cat.fetchGateway = async () => { calls++; return { models: { data: [{ id: 'm' }] } }; };
  const a = conn('a', 'Model A'), b = conn('b', 'Model B');
  assert.equal((await cat.get(a, 'fake')).entries[0].name, 'Model A');
  assert.equal((await cat.get(b, 'fake')).entries[0].name, 'Model B');
  assert.equal(calls, 2);
  assert.equal(cat.peek(a).entries[0].name, 'Model A');
  assert.equal(cat.peek({ ...a, overridesRev: 'new' }), undefined);
});

test('invalidated in-flight catalog cannot repopulate a newer cache', async () => {
  const cat = new Catalog({ modelsDev }); const gate = deferred();
  cat.fetchGateway = () => gate.promise;
  const a = conn('a', 'A'); const pending = cat.get(a, 'fake');
  cat.invalidate(); gate.resolve({ models: { data: [{ id: 'm' }] } });
  assert.equal((await pending).entries[0].name, 'A'); assert.equal(cat.peek(a), undefined);
});

test('balance captures base and credential together before awaiting credential resolution', async (t) => {
  const originalFetch = globalThis.fetch; t.after(() => { globalThis.fetch = originalFetch; });
  const gate = deferred(); let active = 'a'; const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, key: options.headers.authorization });
    const data = url.endsWith('/api/status') ? { quota_per_unit: 1, quota_display_type: 'TOKENS' } : { total_available: 12, total_used: 3, total_granted: 15 };
    return new Response(JSON.stringify({ data }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const svc = new BalanceService({ capture: () => {
    const captured = active;
    return { connection: { baseURL: `https://${captured}.example` }, requireApiKey: async () => { await gate.promise; return `key-${captured}`; } };
  } });
  const pending = svc.refresh(); active = 'b'; gate.resolve();
  const value = await pending;
  assert.equal(value.token.remaining, 12);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, 'https://a.example/api/usage/token/'); assert.equal(calls[1].key, 'Bearer key-a');
});

// Load our adapter source with small SDK spies: no DSH imports, paid requests,
// copied official implementation, or runtime modifications are needed.
async function adapterUnderTest() {
  let source = await fs.readFile(new URL('../lib/adapter.js', import.meta.url), 'utf8');
  source = source.replace(/^import .*;\n/gm, '');
  const catalogURL = new URL('../lib/catalog.js', import.meta.url).href;
  const utilURL = new URL('../lib/util.js', import.meta.url).href;
  const prefix = `import { chatModels, DEFAULT_CONTEXT_WINDOW, DEFAULT_MAX_TOKENS } from '${catalogURL}';
import { gatewayRoot, openaiBase } from '${utilURL}';
class LlmAdapter {}
class LlmError extends Error {}
const ReasoningEffortId = x => x;
const createProvider = x => x;
const openAICompletionsApi = () => ({}), openAIResponsesApi = () => ({}), anthropicMessagesApi = () => ({}), googleGenerativeAIApi = () => ({});
class PiAiAdapter {
 constructor(host) { this.host = host; }
 async resolveModel(provider, model) { return { provider, id: model }; }
 async prepareCall(provider, model) { return { stream: options => this.stream(options) }; }
 async *stream(options) {
  const profile = this.host.profiles().get(options.provider);
  yield { url: profile.piProvider.models[0].baseUrl, key: await this.host.resolveApiKey(), name: profile.piProvider.models[0].name };
 }
}
`;
  return (await import(`data:text/javascript;base64,${Buffer.from(prefix + source).toString('base64')}`)).NewApiAdapter;
}

test('adapter prepared stream stays on original channel after activation switch; concurrent call uses new channel', async () => {
  const Adapter = await adapterUnderTest(); let active = 'a'; const gate = deferred();
  const host = { connection: () => ({ displayName: active }), capture: () => {
    const id = active;
    return {
      connection: { channelId: id, providerId: 'newapi-provider', displayName: id, baseURL: `https://${id}.example`, endpointPriority: ['openai'], headers: {}, apiKeyRef: id },
      requireApiKey: async () => { if (id === 'a') await gate.promise; return `key-${id}`; },
      catalog: async () => ({ entries: [{ id: 'm', name: id, kind: 'chat', input: ['text'], endpointTypes: ['openai'], source: { overridden: [] } }] }),
    };
  } };
  const adapter = new Adapter(host);
  const preparing = adapter.prepareCall('newapi-provider', 'm');
  active = 'b';
  const next = await adapter.prepareCall('newapi-provider', 'm');
  gate.resolve(); const original = await preparing;
  const collect = async (call) => { const result = []; for await (const item of call.stream({ provider: 'newapi-provider', model: 'm' })) result.push(item); return result[0]; };
  assert.deepEqual(await collect(original), { url: 'https://a.example/v1', key: 'key-a', name: 'a' });
  assert.deepEqual(await collect(next), { url: 'https://b.example/v1', key: 'key-b', name: 'b' });
});
