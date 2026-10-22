import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Exercise the real plugin with SDK seams, without installing runtime packages.
async function loadAdapter() {
  const source = (await fs.readFile(new URL('../lib/adapter.js', import.meta.url), 'utf8')).replace(/^import .*;\n/gm, '');
  const catalogURL = new URL('../lib/catalog.js', import.meta.url).href;
  const utilURL = new URL('../lib/util.js', import.meta.url).href;
  const prefix = `import { chatModels, DEFAULT_CONTEXT_WINDOW, DEFAULT_MAX_TOKENS } from '${catalogURL}';
import { gatewayRoot, openaiBase } from '${utilURL}';
class LlmAdapter {} class LlmError extends Error {} const ReasoningEffortId = x => x;
const createProvider = x => x;
const nativeApi = () => ({
 async *stream(model, context, options) {
  const payload = { model: model.id, messages: context.messages };
  const wire = await options?.onPayload?.(payload, model) ?? payload;
  yield { wire, nativeId: model.id, history: context.messages, replayState: { response: { model: model.id } } };
 },
 streamSimple(model, context, options) { return this.stream(model, context, options); }
});
const openAICompletionsApi = nativeApi, openAIResponsesApi = nativeApi, anthropicMessagesApi = nativeApi, googleGenerativeAIApi = nativeApi;
class PiAiAdapter {
 constructor(host) { this.host = host; }
 async resolveModel(provider, model) { return { provider, id: model }; }
 async prepareCall(provider, model) { return { stream: options => this.stream(options) }; }
 async *stream(options) {
  const provider = this.host.profiles().get(options.provider).piProvider;
  const model = provider.models.find(m => m.id === options.model);
  yield* provider.api[model.api].streamSimple(model, { messages: options.messages }, {});
 }
}
`;
  return import(`data:text/javascript;base64,${Buffer.from(prefix + source).toString('base64')}`);
}

for (const endpoint of ['openai', 'openai-response', 'anthropic', 'gemini']) test(`adapter ${endpoint}: wire mapping preserves prepared identity and durable local replay`, async () => {
  const { NewApiAdapter } = await loadAdapter();
  let target = 'remote-one';
  const adapter = new NewApiAdapter({ capture() {
    const upstreamModel = target;
    return { connection: { providerId: 'studio', baseURL: 'https://offline.invalid', displayName: 'Test', headers: {} }, requireApiKey: async () => 'fake', catalog: async () => ({ entries: [{ id: 'local', upstreamModel, name: 'Display only', kind: 'chat', input: ['text'], endpointTypes: [endpoint], source: { overridden: [] } }] }) };
  } });
  const prepared = await adapter.prepareCall('studio', 'local');
  assert.equal(prepared.model.id, 'local');
  target = 'remote-two';
  const history = Object.freeze([Object.freeze({ role: 'assistant', source: Object.freeze({ model: 'local', replayState: { response: { model: 'local' } } }), content: [] })]);
  const options = Object.freeze({ provider: 'studio', model: 'local', messages: history });
  const chunks = []; for await (const c of prepared.stream(options)) chunks.push(c);
  assert.equal(chunks[0].wire.model, 'remote-one'); assert.equal(chunks[0].nativeId, 'local');
  assert.equal(chunks[0].replayState.response.model, 'local');
  assert.strictEqual(chunks[0].history, history); assert.strictEqual(chunks[0].wire.messages, history);
  assert.equal(JSON.parse(JSON.stringify({ source: { model: 'local', replayState: chunks[0].replayState } })).source.replayState.response.model, 'local');
  const next = []; for await (const c of adapter.stream(options)) next.push(c);
  assert.equal(next[0].wire.model, 'remote-two');
});

test('protocol wrapper composes payload hooks and leaves old no-mapping calls completely untouched', async () => {
  const { withUpstreamModels } = await loadAdapter();
  const model = Object.freeze({ id: 'local' }), context = Object.freeze({ messages: [] });
  const options = { onPayload: async payload => ({ ...payload, model: 'ignored', extra: true }) };
  const seen = [];
  const api = Object.fromEntries(['stream', 'streamSimple'].map(method => [method, (...args) => { seen.push(args); return args[2]; }]));
  const mapped = withUpstreamModels(api, new Map([['local', 'remote']]));
  for (const method of ['stream', 'streamSimple']) {
    const opts = mapped[method](model, context, options);
    assert.deepEqual(await opts.onPayload({ model: 'local' }, model), { model: 'remote', extra: true });
    assert.strictEqual(seen.at(-1)[0], model); assert.strictEqual(seen.at(-1)[1], context);
  }
  const legacy = withUpstreamModels(api, new Map());
  assert.strictEqual(legacy.streamSimple(model, context, options), options);
});
