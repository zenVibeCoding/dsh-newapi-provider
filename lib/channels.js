/** Channel configuration operations, independent of DSH imports for regression tests. */
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { gatewayRoot } from './util.js';

const KINDS = ['chat', 'image', 'video', 'audio', 'embedding', 'other'];
const MODALITIES = ['text', 'image', 'audio', 'video', 'pdf'];
const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const PROTOCOLS = ['openai', 'anthropic', 'openai-response', 'gemini'];
// Schemastery may materialize absent optional fields as own undefined values.
// Persist/compare JSON configuration, not parser-specific prototypes or absent fields.
// JSON serialization preserves explicit false/null (and normalizes array holes to null).
const jsonConfig = (value) => JSON.parse(JSON.stringify(value));
export const channelError = (status, message) => Object.assign(new Error(message), { status });
export function hostLabel(url) {
  try { return new URL(gatewayRoot(url)).host; } catch { return 'New API'; }
}
export function keyNameFor(id) {
  return `NEWAPI_PROVIDER_${String(id).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
}
export function validateBaseURL(value) {
  let url;
  if (typeof value !== 'string' || value.length > 2048) throw channelError(400, 'invalid gateway address');
  try { url = new URL(value.trim()); } catch { throw channelError(400, 'invalid gateway address'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw channelError(400, 'use an http(s) gateway address without credentials, query or fragment');
  }
  return gatewayRoot(url.href);
}
export function resolveChannels(raw = {}) {
  let list = (Array.isArray(raw.channels) ? raw.channels : []).filter((c) => c && typeof c.id === 'string' && c.id.length);
  const legacy = list.length === 0;
  if (legacy) list = [{ id: 'default', name: raw.baseURL ? hostLabel(raw.baseURL) : 'New API', baseURL: raw.baseURL || 'http://127.0.0.1:3000', apiKeyEnv: raw.apiKeyEnv || 'NEWAPI_API_KEY', models: raw.models ?? {} }];
  if (new Set(list.map((c) => c.id)).size !== list.length) throw channelError(400, 'duplicate channel ids');
  list = list.map((c) => ({
    ...c,
    name: c.name || hostLabel(c.baseURL),
    baseURL: c.baseURL || 'http://127.0.0.1:3000',
    apiKeyEnv: c.apiKeyEnv || keyNameFor(c.id),
    headers: c.headers ?? {},
    models: c.models ?? {},
    enabledModels: Array.isArray(c.enabledModels) ? [...c.enabledModels] : undefined,
  }));
  return { list, active: list.find((c) => c.id === raw.activeChannel) ?? list[0], legacy };
}

/** Merge only supplied fields; null removes one override, reset removes the whole override. */
/** A level map may only key known levels, and each value is a wire string or null. */
function isValidLevelMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  if (!entries.length) return false;
  return entries.every(([level, mapped]) => {
    const known = LEVELS.includes(level);
    // Custom names must be a safe id and must carry a value: that value is the whole point.
    if (!known && !/^[a-z0-9][a-z0-9_-]{0,23}$/.test(level)) return false;
    if (mapped === null) return known;
    return typeof mapped === 'string' && mapped.length > 0 && mapped.length <= 64 && !/[\u0000-\u001f\u007f-\u009f]/.test(mapped);
  });
}

export function mergeModelOverride(previous, patch, reset = false) {
  if (reset) return undefined;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw channelError(400, 'override must be an object');
  const next = { ...previous };
  for (const [key, value] of Object.entries(patch)) {
    if (!['name', 'upstreamModel', 'kind', 'hidden', 'contextWindow', 'maxTokens', 'input', 'reasoning', 'reasoningLevels', 'thinkingLevelMap', 'protocol', 'custom'].includes(key)) {
      if (Object.hasOwn(previous ?? {}, key) && JSON.stringify(value) === JSON.stringify(previous[key])) continue;
      throw channelError(400, `unsupported override field: ${key}`);
    }
    if (value === null) { delete next[key]; continue; }
    let valid = false;
    if (['contextWindow', 'maxTokens'].includes(key)) valid = Number.isSafeInteger(value) && value > 0;
    else if (['hidden', 'reasoning', 'custom'].includes(key)) valid = typeof value === 'boolean';
    else if (key === 'name') valid = typeof value === 'string' && value.trim().length > 0 && value.length <= 500;
    else if (key === 'upstreamModel') valid = typeof value === 'string' && value.trim().length > 0 && value.length <= 500 && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
    else if (key === 'kind') valid = KINDS.includes(value);
    else if (key === 'protocol') valid = PROTOCOLS.includes(value);
    else if (key === 'thinkingLevelMap') valid = isValidLevelMap(value);
    else valid = Array.isArray(value) && value.every((v) => (key === 'input' ? MODALITIES : LEVELS).includes(v));
    if (!valid) throw channelError(400, `invalid override field: ${key}`);
    next[key] = ['name', 'upstreamModel'].includes(key) ? value.trim() : value;
  }
  return Object.keys(next).length ? next : undefined;
}

/** Persist via CAS. UI and newapi_channels call this exact same operation. */
export class ChannelService {
  constructor(host) { this.host = host; this.queue = Promise.resolve(); }
  descriptor() {
    const descriptor = this.host.settings()?.describe().find((d) => d.ns === this.host.ns);
    if (!descriptor || !Number.isInteger(descriptor.revision)) throw channelError(503, 'channel settings are unavailable');
    return descriptor;
  }
  revision() { return this.descriptor().revision; }
  async list({ offset = 0, limit = 25 } = {}) {
    offset = Math.max(0, Math.floor(Number(offset) || 0));
    limit = Math.min(100, Math.max(1, Math.floor(Number(limit) || 25)));
    const state = resolveChannels(this.host.current());
    const revision = this.revision();
    const channels = await Promise.all(state.list.slice(offset, offset + limit).map(async (ch) => ({
      id: ch.id, name: ch.name, baseURL: ch.baseURL, keyName: ch.apiKeyEnv,
      keyConfigured: await this.host.keyConfigured(ch), active: ch.id === state.active.id,
      overrideCount: Object.keys(ch.models).length,
    })));
    return { revision, activeChannel: state.active.id, channels, total: state.list.length, nextOffset: offset + channels.length < state.list.length ? offset + channels.length : null };
  }
  run(action, args = {}) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) return Promise.reject(channelError(400, 'request must be an object'));
    if (action === 'list') return this.list(args);
    if (action === 'test') return this.test(args);
    if (!['save', 'activate', 'delete', 'model_override', 'models_set'].includes(action)) return Promise.reject(channelError(400, 'unknown channel action'));
    const result = this.queue.then(() => this.write(action, args));
    this.queue = result.catch(() => {});
    return result;
  }
  async test(args) {
    if (args.apiKey !== undefined && typeof args.apiKey !== 'string') throw channelError(400, 'apiKey must be a string');
    const state = resolveChannels(this.host.current());
    const ch = args.id ? state.list.find((c) => c.id === args.id) : undefined;
    if (args.id && !ch) throw channelError(404, 'unknown channel');
    const baseURL = validateBaseURL(args.baseURL ?? ch?.baseURL);
    // Never send a saved credential to a different, unsaved gateway address.
    if (!args.apiKey?.trim() && ch && gatewayRoot(ch.baseURL) !== baseURL) throw channelError(400, 'enter a token to test a changed gateway address');
    const apiKey = args.apiKey?.trim() || (ch ? await this.host.keyFor(ch) : undefined);
    if (!apiKey) throw channelError(400, 'enter a token to test');
    // Channel-scoped headers only when the address is the saved one; a draft
    // gateway is a different host and must not receive this channel's secrets.
    const headers = this.host.headersFor?.(ch, baseURL) ?? {};
    return this.host.testGateway({ baseURL, apiKey, headers });
  }
  async write(action, args) {
    const revision = this.revision();
    if (!Number.isInteger(args.revision)) throw channelError(400, 'revision is required; read state/list first');
    if (revision !== args.revision) throw channelError(409, 'channel settings changed; reload before saving');
    const raw = this.host.current();
    const state = resolveChannels(raw);
    const list = jsonConfig(state.list);
    let active = state.active.id;
    const byChannelId = action === 'model_override' || action === 'models_set';
    const id = byChannelId ? args.channelId : args.id;
    if (byChannelId && !id) throw channelError(400, 'channelId is required');
    let ch = id ? list.find((c) => c.id === id) : undefined;
    if ((id || action !== 'save') && !ch) throw channelError(404, 'unknown channel');
    let stagedKey;
    if (action === 'save') {
      const baseURL = validateBaseURL(args.baseURL);
      const name = String(args.name ?? '').trim() || hostLabel(baseURL);
      if (name.length > 200) throw channelError(400, 'channel name is too long');
      if (args.apiKey !== undefined && typeof args.apiKey !== 'string') throw channelError(400, 'apiKey must be a string');
      const apiKey = args.apiKey?.trim();
      if (apiKey && /\s/.test(apiKey)) throw channelError(400, 'token must not contain whitespace');
      if (!ch && !apiKey) throw channelError(400, 'enter the token for this gateway');
      if (ch && gatewayRoot(ch.baseURL) !== baseURL && !apiKey) throw channelError(400, 'enter a token when changing gateway address');
      if (!ch) { ch = { id: `ch-${randomUUID()}`, models: {}, headers: {}, enabledModels: [] }; list.push(ch); }
      Object.assign(ch, { name, baseURL });
      if (apiKey) {
        // Stage a fresh reference: a failed settings CAS cannot rotate a live token.
        stagedKey = `${keyNameFor(ch.id)}_${randomUUID().replaceAll('-', '').toUpperCase()}`;
        ch.apiKeyEnv = stagedKey;
      }
      if (args.activate === true || list.length === 1) active = ch.id;
    } else if (action === 'activate') active = ch.id;
    else if (action === 'delete') {
      if (list.length <= 1) throw channelError(400, 'keep at least one channel');
      list.splice(list.indexOf(ch), 1);
      if (active === ch.id) active = list[0].id;
    } else if (action === 'models_set') {
      const baseline = ch.enabledModels === undefined ? await this.host.gatewayModelIds?.(ch) : undefined;
      applyModelsSet(ch, args, baseline);
    } else {
      const modelId = validModelId(args.modelId);
      const override = mergeModelOverride(ch.models[modelId], args.override, args.reset === true);
      if (override) ch.models[modelId] = override; else delete ch.models[modelId];
    }
    const ops = [{ op: 'set', path: ['channels'], value: list }, { op: 'set', path: ['activeChannel'], value: active }];
    for (const key of ['baseURL', 'apiKeyEnv', 'models']) if (raw[key] !== undefined) ops.push({ op: 'unset', path: [key] });
    try {
      if (stagedKey) await this.host.storeKey(stagedKey, args.apiKey.trim());
      await this.host.settings().mutate(this.host.ns, ops, revision);
    } catch (error) {
      if (stagedKey) await this.host.unsetKey?.(stagedKey).catch(() => {});
      if (error?.code === 'SETTINGS_CONFLICT') throw channelError(409, 'channel settings changed; reload before saving');
      throw error;
    }
    // mutate is documented as live. Never report success from a no-op/mock/stale service.
    const applied = resolveChannels(this.host.current());
    if (!isDeepStrictEqual(jsonConfig(applied.list), list) || applied.active.id !== active) throw channelError(503, 'settings persisted but live channel update was not observed; reload settings');
    this.host.changed?.();
    return { ok: true, revision: this.revision(), channelId: ch.id, activeChannel: active };
  }
}

const RESERVED_IDS = new Set(['__proto__', 'prototype', 'constructor']);
export function validModelId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!id || id.length > 500 || RESERVED_IDS.has(id)) throw channelError(400, 'invalid modelId');
  return id;
}
function idList(value, field) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw channelError(400, `${field} must be an array of model ids`);
  if (value.length > 1000) throw channelError(400, `${field} accepts at most 1000 ids`);
  return [...new Set(value.map(validModelId))];
}

/**
 * Edit a channel's enabled-model list in place.
 *
 * `enabledModels === undefined` is the legacy automatic mode (every gateway
 * model). The first edit materializes the list from `baseline` — the gateway's
 * current model ids — so the user keeps seeing exactly what they saw before.
 * Removal keeps per-model overrides unless `clearOverrides` is set, so a
 * re-added model gets its parameters back; `overrides` restores or seeds them.
 */
export function applyModelsSet(ch, args, baseline) {
  const add = idList(args.add, 'add');
  const remove = new Set(idList(args.remove, 'remove'));
  const patches = args.overrides;
  if (patches !== undefined && (patches === null || typeof patches !== 'object' || Array.isArray(patches))) throw channelError(400, 'overrides must be an object keyed by model id');
  const patchIds = patches ? Object.keys(patches).map(validModelId) : [];
  if (!add.length && !remove.size && !patchIds.length) throw channelError(400, 'nothing to change: pass add, remove or overrides');
  if (ch.enabledModels === undefined && !Array.isArray(baseline)) throw channelError(503, 'cannot read the gateway model list to start this channel\'s model list; check the connection and retry');
  const list = ch.enabledModels === undefined ? [...new Set(baseline.map(validModelId))] : [...ch.enabledModels];
  const present = new Set(list);
  for (const id of add) if (!present.has(id)) { list.push(id); present.add(id); }
  ch.enabledModels = list.filter((id) => !remove.has(id));
  ch.models = { ...(ch.models ?? {}) };
  if (args.clearOverrides === true) for (const id of remove) delete ch.models[id];
  for (const id of patchIds) {
    const merged = mergeModelOverride(ch.models[id], patches[id]);
    if (merged) ch.models[id] = merged; else delete ch.models[id];
  }
  return ch;
}

/** Durable tasks never fall back to the currently active channel. */
export function taskChannel(task, channels) {
  const origin = task.origin;
  if (!origin?.channelId || !origin.baseURL || !origin.keyName) throw channelError(409, 'legacy video task has no origin channel; check its original New API task log');
  const channel = channels.find((c) => c.id === origin.channelId);
  if (!channel) throw channelError(409, 'video origin channel was removed; restore it before polling');
  if (gatewayRoot(channel.baseURL) !== gatewayRoot(origin.baseURL)) throw channelError(409, 'video origin gateway address changed; restore it before polling');
  return { ...channel, baseURL: origin.baseURL, apiKeyEnv: origin.keyName };
}

/** Own a disposer even when asynchronous registration completes after unload. */
export function registerAsyncEffect(ctx, register, onError = (error) => ctx.logger?.error?.(error)) {
  ctx.effect(() => {
    let disposed = false;
    let unregister;
    let registration;
    try { registration = register(); } catch (error) { onError(error); }
    const ready = Promise.resolve(registration).then(async (value) => {
      if (disposed) await value?.(); else unregister = value;
    }).catch(onError);
    return async () => { disposed = true; await ready; await unregister?.(); };
  });
}
