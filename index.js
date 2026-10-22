/**
 * dsh-newapi-provider — Host half.
 *
 * New API gateways inside DeepSeek Harness:
 *   - several gateway "channels" (address + token); exactly one is active and
 *     serves the LLM provider route, the balance pill and the media tools;
 *   - model list from the active gateway, with context window / output cap /
 *     modalities from models.dev and per-model, per-channel user overrides;
 *   - token and account balance per channel from /api/usage/token/;
 *   - a session-checked JSON API under /newapi-provider/api/ that the Web UI
 *     half reads and writes (channel edits go through the DSH settings service,
 *     tokens through the DSH credential service).
 * Image and video tools register from ./lib/media.js.
 */
import z from '@deepseek-ai/schemastery';
import { LlmError, RetryPolicySchema, assertUsableApiKey, resolveImageAttachmentAccess, resolveRetryPolicy } from '@deepseek-ai/dsh-llm';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { NewApiAdapter, DEFAULT_ENDPOINT_PRIORITY } from './lib/adapter.js';
import { Catalog, chatModels, classify, upstreamModelOf, DEFAULT_CONTEXT_WINDOW, DEFAULT_MAX_TOKENS } from './lib/catalog.js';
import { ModelsDev } from './lib/modelsdev.js';
import { BalanceService } from './lib/balance.js';
import { registerMedia } from './lib/media.js';
import { fetchJson, fingerprint, gatewayRoot, redact } from './lib/util.js';
import { ChannelService, resolveChannels, taskChannel, registerAsyncEffect } from './lib/channels.js';
import { ModelTester } from './lib/model-test.js';
export { resolveChannels } from './lib/channels.js';

export const name = 'newapi-provider';
export const inject = ['llm'];

const ROUTE_PREFIX = '/newapi-provider/api/';
const ENDPOINT_TYPES = ['openai', 'anthropic', 'openai-response', 'gemini'];
const KINDS = ['chat', 'image', 'video', 'audio', 'embedding', 'other'];
const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const MODALITIES = ['text', 'image', 'audio', 'video', 'pdf'];


const ModelOverride = z.object({
  name: z.string().description('Display name in the model picker.'),
  upstreamModel: z.string().default(undefined).description('Upstream wire model id; omitted uses the stable local model id.'),
  kind: z.union(KINDS).description('Force how the model is used: chat models appear in the picker, image/video models are used by the generation tools.'),
  hidden: z.boolean().description('Hide this model everywhere.'),
  contextWindow: z.number().step(1).min(1).description('Context window in tokens (overrides models.dev).'),
  maxTokens: z.number().step(1).min(1).description('Maximum output tokens (overrides models.dev).'),
  input: z.array(z.union(MODALITIES)).default(undefined).description('Input modalities the model accepts.'),
  reasoning: z.boolean().description('Whether the model supports reasoning effort.'),
  reasoningLevels: z.array(z.union(LEVELS)).default(undefined).description('Reasoning effort levels to offer.'),
  protocol: z.union(ENDPOINT_TYPES).description('Force the wire protocol for this model.'),
  custom: z.boolean().description('Add this model even if the gateway does not list it.'),
});

const Channel = z.object({
  id: z.string().required().description('Stable channel id.'),
  name: z.string().description('Display name.'),
  baseURL: z.string().description('Gateway address, with or without /v1.'),
  apiKeyEnv: z.string().role('credential-ref').description('Credential holding this gateway\'s token (sk-…).'),
  headers: z.dict(z.string()).description('Extra HTTP headers for this gateway.'),
  models: z.dict(ModelOverride).description('Per-model overrides keyed by model id.'),
  enabledModels: z.array(z.string()).default(undefined).description('Models enabled on this channel. Unset shows every model the gateway lists.'),
});

export const Config = z.object({
  channels: z.array(Channel).default([]).description('New API gateways. Exactly one is active at a time.'),
  activeChannel: z.string().description('Id of the active channel; the first channel when unset.'),
  baseURL: z.string().description('Single-gateway form (used when `channels` is empty).'),
  apiKeyEnv: z.string().role('credential-ref').description('Single-gateway form: credential holding the token.'),
  models: z.dict(ModelOverride).description('Single-gateway form: per-model overrides.'),
  providerId: z.string().default('newapi-provider').description('Provider route id in the model picker. Changing it orphans sessions that use the old id.'),
  displayName: z.string().default('New API').description('Provider name shown in the model picker.'),
  endpointPriority: z.array(z.union(ENDPOINT_TYPES)).default([...DEFAULT_ENDPOINT_PRIORITY]).description('Preferred wire protocol when a model supports several.'),
  defaultContextWindow: z.number().step(1).min(1).default(DEFAULT_CONTEXT_WINDOW).description('Context window used when neither models.dev nor an override sizes a model.'),
  defaultMaxTokens: z.number().step(1).min(1).default(DEFAULT_MAX_TOKENS).description('Output cap used when neither models.dev nor an override sizes a model.'),
  useModelsDev: z.boolean().default(true).description('Fill context window, output cap and modalities from models.dev.'),
  headers: z.dict(z.string()).default({}).description('Extra HTTP headers sent to every gateway.'),
  streamIdleTimeoutMs: z.number().min(1000).max(2147483647).default(300_000).description('Abort a model stream that stays silent this long.'),
  balanceRefreshSeconds: z.number().step(1).min(0).default(120).description('Refresh the active channel balance this often (0 = only on demand).'),
  retryPolicy: RetryPolicySchema,
}).volatile();

function sendJson(res, status, value) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(value));
}

async function readBody(req, limit = 64 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('request body too large'), { status: 413 });
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw Object.assign(new Error('invalid JSON body'), { status: 400 }); }
}

export function apply(ctx, config) {
  const settingsNs = ctx.fiber.entry?.options.id ?? 'newapi-provider';
  const current = () => (typeof config?.get === 'function' ? config.get() : config) ?? {};
  const errors = new Map();
  const reportError = (scope, error) => {
    errors.set(scope, { at: Date.now(), code: error?.code ?? 'ERROR', message: String(error?.message ?? error) });
  };

  // This plugin draws its own settings page; hide the generated form.
  ctx.inject(['settings'], (sctx) => {
    sctx.effect(() => sctx.settings.configure({ auto: false }, ctx.fiber));
  });

  let channelsMemo;
  const channels = () => {
    const raw = current();
    if (channelsMemo?.raw !== raw) channelsMemo = { raw, value: resolveChannels(raw) };
    return channelsMemo.value;
  };

  const connFor = (ch) => {
    const raw = current();
    const overrides = ch.models ?? {};
    return {
      channelId: ch.id,
      channelName: ch.name,
      providerId: raw.providerId || 'newapi-provider',
      displayName: raw.displayName || 'New API',
      baseURL: ch.baseURL,
      apiKeyRef: credentialRef(ch.apiKeyEnv),
      apiKeyName: ch.apiKeyEnv,
      overrides,
      enabledModels: Array.isArray(ch.enabledModels) ? ch.enabledModels : undefined,
      overridesRev: fingerprint(`${ch.id}|${JSON.stringify(overrides)}|${JSON.stringify(ch.enabledModels ?? null)}`),
      endpointPriority: raw.endpointPriority?.length ? raw.endpointPriority : DEFAULT_ENDPOINT_PRIORITY,
      defaultContextWindow: raw.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW,
      defaultMaxTokens: raw.defaultMaxTokens ?? DEFAULT_MAX_TOKENS,
      headers: { ...(raw.headers ?? {}), ...(ch.headers ?? {}) },
      streamIdleTimeoutMs: raw.streamIdleTimeoutMs ?? 300_000,
      retryPolicy: resolveRetryPolicy(raw.retryPolicy, 'newapi-provider retryPolicy'),
      balanceRefreshSeconds: raw.balanceRefreshSeconds ?? 120,
    };
  };

  let connectionMemo;
  /** Connection facts of the active channel. */
  const connection = () => {
    const { active } = channels();
    const raw = current();
    if (connectionMemo?.raw === raw && connectionMemo.id === active.id) return connectionMemo.value;
    const value = connFor(active);
    connectionMemo = { raw, id: active.id, value };
    return value;
  };

  const keyFor = async (ch) => {
    const credentials = ctx.get('credentials');
    const ref = credentialRef(ch.apiKeyEnv);
    const hit = credentials ? (await credentials.resolve(ref))?.value : process.env[ch.apiKeyEnv];
    if (!hit) {
      throw new LlmError(`newapi-provider: no token stored for channel "${ch.name}" (credential ${ch.apiKeyEnv}); add it in Settings → New API Provider`, 'MISSING_CREDENTIAL');
    }
    return assertUsableApiKey(hit, 'newapi-provider', ref);
  };

  const modelsDev = new ModelsDev({ enabled: current().useModelsDev !== false, logger: ctx.logger });
  const catalogs = new Catalog({ modelsDev, logger: ctx.logger });

  const catalogFor = async (ch, { signal, force = false } = {}, captured = connFor(ch)) => {
    const apiKey = await keyFor(ch);
    const conn = { ...captured, keyFingerprint: fingerprint(apiKey) };
    try {
      return await catalogs.get(conn, apiKey, { signal, force });
    } catch (error) {
      const stale = catalogs.peek(conn);
      if (stale) return stale;
      throw new LlmError(redact(`newapi-provider: cannot read the model list from ${gatewayRoot(conn.baseURL)}: ${error.message}`, apiKey), error.code === 'AUTH' ? 'AUTH' : 'TRANSPORT', { cause: error });
    }
  };

  const catalog = async (opts = {}) => {
    try {
      const value = await catalogFor(channels().active, opts);
      errors.delete('catalog');
      return value;
    } catch (error) {
      reportError('catalog', error);
      throw error;
    }
  };

  // Capture channel, URL, headers, overrides and credential reference before any await.
  const capture = (id) => {
    const ch = structuredClone(id ? channels().list.find((c) => c.id === id) : channels().active);
    if (!ch) throw Object.assign(new Error(`unknown channel "${id}"; list channel ids with newapi_channels`), { status: 404 });
    const conn = connFor(ch);
    let key;
    const requireApiKey = () => key ??= keyFor(ch);
    return {
      connection: conn, requireApiKey,
      catalog: async (opts) => catalogs.get({ ...conn, keyFingerprint: fingerprint(await requireApiKey()) }, await requireApiKey(), opts),
    };
  };
  const adapter = new NewApiAdapter({
    connection,
    capture,
    reportError,
    logger: ctx.logger,
    piAuth: undefined,
    resolveAttachments: () => ctx.get('attachments'),
    resolveImageAccess: (attachments, ref) => resolveImageAttachmentAccess(attachments, (hostPath) => ctx.get('fs')?.processPathFromHostPath(hostPath), ref),
  });

  // Provider route registration. A route still held by another adapter is
  // retried whenever the provider topology changes, instead of failing.
  let registration;
  let registeredRoute;
  let directory;
  let directoryKey;
  const routeState = { status: 'pending', route: null, error: null };
  const ensureRegistration = () => {
    const conn = connection();
    const entries = [{
      provider: conn.providerId,
      displayName: conn.displayName,
      settingsNs,
      settingsPath: [],
      declared: true,
      defaultBaseURL: gatewayRoot(conn.baseURL),
    }];
    const key = JSON.stringify(entries);
    try {
      if (directoryKey !== key) {
        if (directory) directory.replace(entries); else directory = ctx.llm.registerConfigurableProviders(entries);
        directoryKey = key;
      }
    } catch (error) {
      routeState.error = `directory: ${error.message}`;
    }
    if (registeredRoute === conn.providerId) return;
    try {
      if (registration) registration.replace([conn.providerId]); else registration = ctx.llm.registerAdapter([conn.providerId], adapter);
      registeredRoute = conn.providerId;
      Object.assign(routeState, { status: 'registered', route: conn.providerId, error: null });
    } catch (error) {
      Object.assign(routeState, { status: 'waiting', route: conn.providerId, error: String(error?.message ?? error) });
      ctx.logger.warn(`newapi-provider: provider route "${conn.providerId}" is not available yet (${error.code ?? error.message}); will retry when it is released`);
    }
  };
  ensureRegistration();
  ctx.on('llm/adapters-updated', () => {
    if (registeredRoute !== connection().providerId) ensureRegistration();
  });
  ctx.llm.registerModelDiscovery(settingsNs, async (request, signal) => {
    const ch = channels().active;
    const captured = connFor(ch);
    if (request.baseURL && gatewayRoot(request.baseURL) !== gatewayRoot(ch.baseURL) && !request.apiKey) throw new Error('a draft gateway requires its own token');
    const apiKey = request.apiKey || await keyFor(ch);
    const conn = { ...captured, ...(request.baseURL ? { baseURL: request.baseURL } : {}), keyFingerprint: fingerprint(apiKey) };
    const value = await catalogs.get(conn, apiKey, { signal, force: true });
    return chatModels(value).map((e) => ({
      id: e.id,
      name: e.name,
      ...(e.contextWindow ? { contextWindow: e.contextWindow } : {}),
      ...(e.maxTokens ? { maxTokens: e.maxTokens } : {}),
      inputModalities: e.input.filter((m) => m === 'text' || m === 'image'),
    }));
  });

  // One balance service per channel, created on demand.
  const balances = new Map();
  const balanceOf = (id) => {
    let svc = balances.get(id);
    if (!svc) {
      const ch = structuredClone(channels().list.find((c) => c.id === id));
      if (!ch) throw new Error('channel removed');
      const conn = connFor(ch);
      svc = new BalanceService({ capture: () => ({ connection: conn, requireApiKey: () => keyFor(ch) }), logger: ctx.logger });
      balances.set(id, svc);
    }
    return svc;
  };
  const balance = { get state() { return balanceOf(channels().active.id).state; }, refresh: (o) => balanceOf(channels().active.id).refresh(o) };

  let lastActive = channels().active.id;
  ctx.on('loader/volatile-update', () => {
    catalogs.invalidate();
    modelsDev.enabled = current().useModelsDev !== false;
    // Old services may finish, but are no longer observable after an edit/rotation.
    balances.clear();
    try { ensureRegistration(); } catch (error) { ctx.logger.error(error); }
    const now = channels().active.id;
    if (now !== lastActive) { lastActive = now; errors.clear(); }
    void balance.refresh({ force: true });
  });
  void balance.refresh();
  void modelsDev.refresh();
  ctx.effect(() => {
    let timer;
    let stopped = false;
    const schedule = () => {
      if (stopped) return;
      const seconds = connection().balanceRefreshSeconds;
      if (!(seconds > 0)) return;
      timer = setTimeout(() => {
        balance.refresh().catch(() => {}).finally(schedule);
      }, Math.max(15, seconds) * 1000);
    };
    schedule();
    return () => { stopped = true; clearTimeout(timer); };
  });

  const media = registerMedia(ctx, {
    capture, reportError,
    captureTask: (task) => {
      const ch = taskChannel(task, channels().list);
      return { connection: connFor(ch), requireApiKey: () => keyFor(ch) };
    },
  });

  // ------------------------------------------------------------ model list & tests

  const channelById = (id) => {
    const ch = channels().list.find((c) => c.id === id);
    if (!ch) throw Object.assign(new Error('unknown channel'), { status: 404 });
    return ch;
  };

  /** Gateway catalog for one channel, ignoring its saved list (what the gateway offers). */
  const gatewayCatalog = async (ch, opts = {}) => {
    const snapshotCh = structuredClone(ch);
    const conn = { ...connFor(snapshotCh), enabledModels: undefined, channelId: `${snapshotCh.id}#gateway` };
    const apiKey = await keyFor(snapshotCh);
    return catalogs.get({ ...conn, keyFingerprint: fingerprint(apiKey) }, apiKey, opts);
  };

  const tester = new ModelTester({
    channelFacts: async (channelId) => {
      const bound = capture(channelId);
      const conn = bound.connection;
      return {
        baseURL: conn.baseURL, headers: conn.headers, endpointPriority: conn.endpointPriority,
        apiKey: bound.requireApiKey,
        entryFor: async (modelId) => (await bound.catalog()).entries.find((e) => e.id === modelId),
        submitVideo: (modelId) => media.submitTestVideo(channelId, modelId, bound),
      };
    },
  });

  const discoverModels = async ({ channelId }) => {
    const ch = channelById(channelId);
    const value = await gatewayCatalog(ch, { force: true });
    const enabled = Array.isArray(ch.enabledModels) ? new Set(ch.enabledModels) : undefined;
    const gatewayIds = new Set(value.gatewayIds ?? value.entries.filter((e) => e.source?.gateway).map((e) => e.id));
    return {
      channelId: ch.id,
      fetchedAt: value.fetchedAt,
      listMode: enabled ? 'list' : 'auto',
      models: value.entries.filter((e) => gatewayIds.has(e.id)).map((e) => ({
        id: e.id, kind: e.kind, vendor: e.vendor, input: e.input,
        contextWindow: e.contextWindow ?? null, maxTokens: e.maxTokens ?? null,
        reasoning: e.reasoning, pricing: e.pricing,
        status: !enabled || enabled.has(e.id) ? 'enabled' : 'new',
      })),
      missing: enabled
        ? [...enabled].filter((id) => !gatewayIds.has(upstreamModelOf({ id, upstreamModel: ch.models?.[id]?.upstreamModel }))).map((id) => ({ id, custom: ch.models?.[id]?.custom === true }))
        : [],
    };
  };

  // ------------------------------------------------------------ config writes

  const storeKey = async (keyName, apiKey) => {
    const credentials = ctx.get('credentials');
    if (!credentials) throw Object.assign(new Error('the DSH credential service is unavailable'), { status: 503 });
    const value = String(apiKey ?? '').trim();
    if (!value || /\s/.test(value)) throw Object.assign(new Error('the token must be a single non-empty string'), { status: 400 });
    await credentials.set(credentialRef(keyName), value);
  };

  const keyConfigured = async (ch) => {
    try { await keyFor(ch); return true; } catch { return false; }
  };

  /** Probe a gateway without saving anything: version, model counts, token quota. */
  const testGateway = async ({ baseURL, apiKey }) => {
    const root = gatewayRoot(baseURL);
    const out = { ok: false, baseURL: root };
    const started = Date.now();
    try {
      const status = await fetchJson(`${root}/api/status`, { timeoutMs: 8_000 }).catch(() => undefined);
      const st = status?.data ?? status;
      out.version = st?.version ?? null;
      out.systemName = st?.system_name ?? null;
      const models = await fetchJson(`${root}/v1/models`, { apiKey, timeoutMs: 10_000 });
      const counts = { total: 0, chat: 0, image: 0, video: 0, other: 0 };
      for (const m of models?.data ?? []) {
        counts.total++;
        const k = classify(m.id, modelsDev.match(m.id));
        if (k === 'chat' || k === 'image' || k === 'video') counts[k]++; else counts.other++;
      }
      out.models = counts;
      out.latencyMs = Date.now() - started;
      out.ok = true;
    } catch (error) {
      out.error = redact(String(error?.message ?? error), apiKey);
      out.code = error?.code ?? 'ERROR';
    }
    return out;
  };

  const channelService = new ChannelService({
    ns: settingsNs, current, settings: () => ctx.get('settings'), keyFor, keyConfigured,
    storeKey, unsetKey: async (name) => ctx.get('credentials')?.unset(credentialRef(name)), testGateway,
    // First list edit on an automatic-mode channel starts from what the gateway lists now.
    gatewayModelIds: async (ch) => (await gatewayCatalog(ch, { force: true })).entries.map((e) => e.id),
    changed: () => {
      channelsMemo = undefined; connectionMemo = undefined; catalogs.invalidate(); balances.clear(); ensureRegistration();
      const ids = new Set(channels().list.map((c) => c.id));
      for (const id of new Set([...tester.results.keys()].map((k) => k.split('\u0000')[0]))) if (!ids.has(id)) tester.forget(id);
    },
  });

  // ---------------------------------------------------------------- snapshot

  const withTimeout = async (p, ms) => {
    let timer;
    try { return await Promise.race([p, new Promise((r) => { timer = setTimeout(r, ms); })]); }
    finally { clearTimeout(timer); }
  };

  /**
   * One channel's own model list, with its own overrides and test results.
   * Every channel is maintained independently: what gateway A lists (and what
   * the user enabled there) never leaks into gateway B.
   */
  const modelsOf = async (ch, { force = false } = {}) => {
    const captured = structuredClone(ch);
    const conn = connFor(captured);
    const value = await catalogFor(captured, { force }, conn);
    return {
      channelId: captured.id,
      listMode: Array.isArray(captured.enabledModels) ? 'list' : 'auto',
      fetchedAt: value.fetchedAt,
      pricingAvailable: value.pricingAvailable,
      pricingError: value.pricingError,
      entries: value.entries.map((e) => ({
        ...e,
        override: structuredClone(captured.models?.[e.id] ?? {}),
        automaticContextWindow: e.automaticContextWindow ?? conn.defaultContextWindow,
        automaticMaxTokens: e.automaticMaxTokens ?? conn.defaultMaxTokens,
        lastTest: tester.last(captured.id, e.id) ?? null,
        effectiveContextWindow: e.contextWindow ?? conn.defaultContextWindow,
        effectiveMaxTokens: e.maxTokens ?? conn.defaultMaxTokens,
      })),
    };
  };

  const snapshot = async ({ force = false } = {}) => {
    const conn = connection();
    const state = channels();
    const revision = channelService.revision();
    const services = new Map(state.list.map((c) => [c.id, balanceOf(c.id)]));
    let models = null;
    try {
      models = await modelsOf(state.active, { force });
    } catch (error) {
      reportError('catalog', error);
    }
    // Load balances for channels not yet queried, without blocking the page for long.
    await withTimeout(Promise.allSettled(state.list.map((c) => {
      const svc = services.get(c.id);
      return svc.state.status === 'idle' || force ? svc.refresh({ force }) : undefined;
    })), 5_000);
    const list = await Promise.all(state.list.map(async (c) => ({
      id: c.id,
      name: c.name,
      baseURL: gatewayRoot(c.baseURL),
      keyName: c.apiKeyEnv,
      keyConfigured: await keyConfigured(c),
      overrideCount: Object.keys(c.models ?? {}).length,
      // Saved list size; null in automatic mode (count comes from the gateway on demand).
      enabledCount: Array.isArray(c.enabledModels) ? c.enabledModels.length : null,
      active: c.id === state.active.id,
      balance: services.get(c.id).state,
    })));
    return {
      plugin: 'dsh-newapi-provider',
      revision,
      channels: list,
      activeChannel: state.active.id,
      listMode: Array.isArray(state.active.enabledModels) ? 'list' : 'auto',
      route: { ...routeState, displayName: conn.displayName },
      defaults: { contextWindow: conn.defaultContextWindow, maxTokens: conn.defaultMaxTokens },
      balance: services.get(state.active.id).state,
      modelsDev: modelsDev.status(),
      models,
      media: media.status(),
      errors: Object.fromEntries(errors),
    };
  };

  // ------------------------------------------------------------- agent tools

  ctx.inject(['tools'], (tctx) => {
    registerAsyncEffect(tctx, () => tctx.tools.register({
      name: 'newapi_channels',
      description: 'Manage New API channels: list, test a free connection, save, activate one channel, delete, edit model overrides, read the gateway model list, edit the channel\'s enabled-model list, or test one model. Writes persist shared settings; deleting keeps credentials. List returns bounded metadata and revision, never tokens.',
      parameters: {
        type: 'object', properties: {
          action: { type: 'string', enum: ['list', 'test', 'save', 'activate', 'delete', 'model_override', 'models_discover', 'models_set', 'model_test'] },
          revision: { type: 'integer', description: 'Required for writes (save, activate, delete, model_override, models_set); use revision from list/state. Stale writes fail.' },
          id: { type: 'string', description: 'Channel for test/save/activate/delete. Omit for a new save.' },
          channelId: { type: 'string', description: 'Required for model_override, models_discover, models_set and model_test; never inferred from the active channel.' },
          add: { type: 'array', items: { type: 'string' }, description: 'models_set: local model ids to enable on the channel.' },
          remove: { type: 'array', items: { type: 'string' }, description: 'models_set: model ids to remove from the channel list.' },
          clearOverrides: { type: 'boolean', description: 'models_set: also delete overrides of removed models (kept by default).' },
          overrides: { type: 'object', description: 'models_set: per-model override patches keyed by model id, e.g. {"id":{"custom":true}} for a model the gateway does not list.' },
          confirmPaid: { type: 'boolean', description: 'model_test: required for image and video models, whose test is a real billed generation. Chat tests send one tiny billed request.' },
          name: { type: 'string' },
          baseURL: { type: 'string', description: 'HTTP(S) gateway. Changing an address requires an explicit token.' },
          apiKey: { type: 'string', description: 'Token for save/test; omit to keep the token on an unchanged gateway.' },
          activate: { type: 'boolean', description: 'Activate after save.' },
          modelId: { type: 'string', description: 'Stable local model id, not its upstreamModel mapping.' },
          override: { type: 'object', description: 'Partial override: name (display only), upstreamModel (wire id; local id stays unchanged), kind, hidden, contextWindow, maxTokens, input, reasoning, reasoningLevels, protocol, custom. Null removes a field; omitted fields are preserved.' },
          reset: { type: 'boolean', description: 'Remove all overrides for this model.' },
          offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 100 },
        }, required: ['action'], additionalProperties: false,
      },
      isConcurrencySafe: (args) => ['list', 'test', 'models_discover'].includes(args?.action),
      output: { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 1) }] },
      async execute(args) {
        if (args.action === 'models_discover') return JSON.parse(JSON.stringify(await discoverModels(args)));
        if (args.action === 'model_test') {
          const { preview, ...rest } = await tester.run(args);
          return JSON.parse(JSON.stringify({ ...rest, ...(preview?.type === 'video-task' ? { preview } : {}) }));
        }
        return channelService.run(args.action, args);
      },
    }));
    registerAsyncEffect(tctx, () => tctx.tools.register({
      name: 'newapi_balance',
      description: 'Show the remaining balance and usage of the active New API channel\'s token (and of the account, when the token allows user-quota queries). Read-only and free.',
      parameters: { type: 'object', properties: { refresh: { type: 'boolean', description: 'Query the gateway now instead of using the last cached value.' } }, additionalProperties: false },
      isConcurrencySafe: () => true,
      output: {
        schema: { type: 'object' },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 1) }],
      },
      async execute(args) {
        const ch = channels().active;
        const svc = balanceOf(ch.id);
        const state = args?.refresh || svc.state.status === 'idle' ? await svc.refresh({ force: Boolean(args?.refresh) }) : svc.state;
        return JSON.parse(JSON.stringify({ channel: { id: ch.id, name: ch.name, baseURL: gatewayRoot(ch.baseURL) }, ...state }));
      },
    }));
    registerAsyncEffect(tctx, () => tctx.tools.register({
      name: 'newapi_models',
      description: 'List local model ids and upstreamModel mappings on a New API channel (the active one unless channelId is given) with their kind (chat, image, video, …), context window, output cap, input modalities (text, image, audio, video, pdf), reasoning support and pricing ratios. Each channel keeps its own model list. Read-only and free.',
      parameters: {
        type: 'object',
        properties: {
          channelId: { type: 'string', description: 'Channel to list; defaults to the active channel. Ids come from newapi_channels list.' },
          kind: { type: 'string', enum: KINDS, description: 'Only list models of this kind.' },
          refresh: { type: 'boolean', description: 'Re-read the gateway model list now.' },
        },
        additionalProperties: false,
      },
      isConcurrencySafe: () => true,
      output: {
        schema: { type: 'object' },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 1) }],
      },
      async execute(args) {
        const bound = capture(args?.channelId);
        const conn = bound.connection;
        const value = await bound.catalog({ force: Boolean(args?.refresh) });
        const entries = value.entries.filter((e) => !args?.kind || e.kind === args.kind);
        return JSON.parse(JSON.stringify({
          channel: { id: conn.channelId, name: conn.channelName },
          gateway: gatewayRoot(conn.baseURL),
          route: routeState.route,
          routeStatus: routeState.status,
          modelsDev: modelsDev.status(),
          pricingAvailable: value.pricingAvailable,
          models: entries.map((e) => ({
            id: e.id,
            upstreamModel: e.upstreamModel ?? e.id,
            kind: e.kind,
            hidden: e.hidden,
            contextWindow: e.contextWindow ?? null,
            effectiveContextWindow: e.contextWindow ?? conn.defaultContextWindow,
            maxTokens: e.maxTokens ?? null,
            input: e.input,
            output: e.outputModalities,
            reasoning: e.reasoning,
            endpointTypes: e.endpointTypes,
            vendor: e.vendor,
            pricing: e.pricing,
            capabilitySource: e.source.modelsDev ? `models.dev ${e.source.modelsDev.provider} (${e.source.modelsDev.match})` : 'none',
            overridden: e.source.overridden,
          })),
        }));
      },
    }));
  });

  // ----------------------------------------------------------------- web API

  const routes = {
    'GET state': async () => snapshot(),
    'GET balance': async () => (balance.state.status === 'idle' ? balance.refresh() : balance.state),
    'POST refresh': async () => {
      catalogs.invalidate();
      await modelsDev.refresh({ force: true });
      return snapshot({ force: true });
    },
    ...Object.fromEntries([
      ['channel/activate', 'activate'], ['channel/test', 'test'], ['channel/save', 'save'],
      ['channel/delete', 'delete'], ['model/override', 'model_override'], ['models/set', 'models_set'],
    ].map(([route, action]) => [`POST ${route}`, async (body) => {
      const result = await channelService.run(action, body);
      return action === 'test' ? result : snapshot();
    }])),
    'POST models/discover': async (body) => discoverModels(body),
    // Any channel's own list, active or not, so each gateway is managed independently.
    'POST models/list': async (body) => {
      if (typeof body?.channelId !== 'string' || !body.channelId) throw Object.assign(new Error('channelId is required'), { status: 400 });
      return modelsOf(channelById(body.channelId), { force: body.force === true });
    },
    'POST model/test': async (body) => tester.run(body),
  };

  // `inject` waits for the service: on a cold start the HTTP server may be created
  // after this plugin applies, and reading it once here would silently skip routing
  // (the settings page then fails with 404 until the plugin is reloaded).
  ctx.inject(['webServer'], (wctx) => {
    wctx.effect(() => wctx.webServer.register({
      kind: 'prefix',
      path: ROUTE_PREFIX.slice(0, -1),
      async handler(req, res) {
        // `/api/` belongs to DSH itself, so this plugin uses its own prefix and
        // applies the same session check the Web UI's own requests pass.
        const conn = ctx.get('connection');
        if (!conn || conn.requestRejection(req) !== undefined) return sendJson(res, 403, { error: 'forbidden' });
        const url = new URL(req.url ?? '/', 'http://local');
        try {
          if (url.pathname.startsWith(ROUTE_PREFIX)) {
            const sub = url.pathname.slice(ROUTE_PREFIX.length);
            const route = routes[`${req.method} ${sub}`];
            if (route) {
              let body = {};
              if (req.method === 'POST') {
                // A JSON content type forces a CORS preflight for cross-site callers.
                if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) return sendJson(res, 415, { error: 'expected application/json' });
                body = await readBody(req);
              }
              return sendJson(res, 200, await route(body));
            }
          }
          if (await media.handle(req, res, url)) return;
          return sendJson(res, 404, { error: 'not found' });
        } catch (error) {
          return sendJson(res, error?.status ?? 500, { error: String(error?.message ?? error) });
        }
      },
    }));
  });
}
