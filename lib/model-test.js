/** Single-model tests: one request, no automatic retries, bounded and redacted results. */
import { upstreamModelOf } from './catalog.js';
import { gatewayRoot, GatewayError, readCache, redact, writeCache } from './util.js';

const RESULTS_FILE = 'model-tests.json';
const CHAT_TIMEOUT_MS = 60_000;
const STREAM_BYTE_LIMIT = 256 * 1024;
const IMAGE_BYTE_LIMIT = 64 * 1024 * 1024;
const IMAGE_TIMEOUT_MS = 11 * 60 * 1000;
const PREVIEW_LIMIT = 3 * 1024 * 1024;
const PER_CHANNEL_LIMIT = 3;
const RESULTS_LIMIT = 1000;
const PROMPT = 'Reply with OK.';
const ENDPOINT_TO_PATH = { openai: 'openai', 'openai-response': 'responses', anthropic: 'anthropic', gemini: 'unsupported' };

export function pickTestProtocol(endpointTypes, priority) {
  const advertised = endpointTypes?.length ? endpointTypes : ['openai'];
  for (const t of priority ?? []) if (advertised.includes(t) && Object.hasOwn(ENDPOINT_TO_PATH, t)) return ENDPOINT_TO_PATH[t];
  for (const t of advertised) if (Object.hasOwn(ENDPOINT_TO_PATH, t)) return ENDPOINT_TO_PATH[t];
  return 'unsupported';
}

export function classifyTestError(status, message) {
  const text = String(message ?? '');
  if (/no available channel|unknown provider|model_not_found|model not found|does not exist|无可用渠道/i.test(text)) return 'NO_CHANNEL';
  if (status === 401 || status === 403) return 'AUTH';
  if (status === 429) return 'RATE_LIMIT';
  if (status === 503 && /channel/i.test(text)) return 'NO_CHANNEL';
  return 'HTTP';
}

export function requestFor(protocol, root, model, apiKey, headers = {}) {
  const auth = { authorization: `Bearer ${apiKey}`, ...headers };
  if (protocol === 'anthropic') return {
    url: `${root}/v1/messages`,
    headers: { ...auth, 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', accept: 'text/event-stream' },
    body: { model, max_tokens: 16, stream: true, messages: [{ role: 'user', content: PROMPT }] },
  };
  if (protocol === 'responses') return {
    url: `${root}/v1/responses`,
    headers: { ...auth, 'content-type': 'application/json', accept: 'text/event-stream' },
    body: { model, max_output_tokens: 16, stream: true, input: PROMPT },
  };
  if (protocol !== 'openai') throw new GatewayError('testing this protocol is not supported', 'UNSUPPORTED', { status: 400 });
  return {
    url: `${root}/v1/chat/completions`,
    headers: { ...auth, 'content-type': 'application/json', accept: 'text/event-stream' },
    body: { model, max_tokens: 16, stream: true, messages: [{ role: 'user', content: PROMPT }] },
  };
}

function validateId(value, name, limit) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > limit
    || /[\u0000-\u001f\u007f]/.test(value) || ['__proto__', 'prototype', 'constructor'].includes(value)) {
    throw new GatewayError(`invalid ${name}`, 'INVALID_REQUEST', { status: 400 });
  }
}

function secretsFor(facts, apiKey) {
  return [apiKey, ...Object.entries(facts?.headers ?? {}).filter(([k]) => /auth|key|token|secret|cookie/i.test(k))
    .flatMap(([, v]) => [String(v), String(v).replace(/^Bearer\s+/i, '')])].filter(Boolean);
}

function cleanText(value, secrets = []) {
  let text = String(value ?? '');
  for (const secret of secrets) {
    for (const variant of new Set([secret, encodeURIComponent(secret)])) text = text.split(variant).join('<redacted>');
  }
  return redact(text);
}

// Include nested usage, errors, text, and preview fields, not just error.message.
function sanitize(value, secrets, depth = 0) {
  if (typeof value === 'string') return cleanText(value, secrets);
  if (value === null || typeof value !== 'object') return value;
  if (depth > 16) return '<omitted>';
  if (Array.isArray(value)) return value.slice(0, 1000).map((v) => sanitize(v, secrets, depth + 1));
  return Object.fromEntries(Object.entries(value).slice(0, 1000).map(([k, v]) => [cleanText(k, secrets), sanitize(v, secrets, depth + 1)]));
}

function errorMessageOf(json, raw) {
  const message = json?.error?.message ?? json?.message ?? json?.error ?? raw ?? '';
  return typeof message === 'string' ? message : JSON.stringify(message);
}

async function consume(res, maxBytes, signal, onChunk) {
  if (!res.body) throw new GatewayError('gateway returned no response body', 'BAD_RESPONSE');
  const reader = res.body.getReader();
  let bytes = 0;
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new GatewayError(`response larger than ${maxBytes} bytes`, 'TOO_LARGE');
      onChunk(value);
    }
  } finally {
    try { await reader.cancel(); } catch { /* preserve the original failure */ }
    reader.releaseLock();
  }
}

async function boundedText(res, limit, signal) {
  const chunks = [];
  await consume(res, limit, signal, (chunk) => chunks.push(Buffer.from(chunk)));
  return Buffer.concat(chunks).toString('utf8');
}

/** A first SSE data event measures first packet, never first generated token. */
async function readStream(res, started, signal, protocol) {
  const contentType = res.headers.get('content-type');
  if (!contentType || !/^text\/event-stream(?:\s*;|$)/i.test(contentType)) {
    try { await res.body?.cancel(); } catch { /* best effort */ }
    throw new GatewayError('gateway did not return an SSE response', 'BAD_RESPONSE');
  }
  const decoder = new TextDecoder();
  let buffer = '', event = '', data = [], text = '', firstByteMs, usage, streamError, terminal = false;
  function dispatch() {
    if (!data.length) { event = ''; return; }
    const raw = data.join('\n').trim();
    data = [];
    if (firstByteMs === undefined) firstByteMs = Date.now() - started;
    // Some gateways translate all three protocols to the common DONE sentinel.
    if (raw === '[DONE]') { terminal = true; event = ''; return; }
    let json;
    try { json = JSON.parse(raw); } catch { throw new GatewayError('invalid SSE JSON payload', 'BAD_RESPONSE'); }
    const type = json?.type ?? event;
    if (json?.error || type === 'error' || ['response.failed', 'response.incomplete'].includes(type)
      || ['failed', 'incomplete'].includes(json?.response?.status)
      || (type === 'response.completed' && json?.response?.status !== undefined && json.response.status !== 'completed')) {
      streamError = errorMessageOf(json?.response ?? json, `gateway stream ended with ${type}`);
    }
    if (protocol === 'responses' && type === 'response.completed' && (json?.response?.status === undefined || json.response.status === 'completed')) terminal = true;
    if (protocol === 'anthropic' && type === 'message_stop') terminal = true;
    if (protocol === 'openai' && json?.choices?.some((c) => typeof c.finish_reason === 'string' && c.finish_reason.length > 0)) terminal = true;
    const delta = json?.choices?.[0]?.delta?.content ?? json?.delta?.text ?? (type === 'response.output_text.delta' ? json.delta : '');
    if (typeof delta === 'string') text += delta;
    usage = json?.usage ?? json?.message?.usage ?? json?.response?.usage ?? usage;
    event = '';
  }
  await consume(res, STREAM_BYTE_LIMIT, signal, (chunk) => {
    buffer += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).replace(/\r$/, '');
      buffer = buffer.slice(nl + 1);
      if (!line) dispatch();
      else if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) {
        if (firstByteMs === undefined) firstByteMs = Date.now() - started;
        data.push(line.slice(5).replace(/^ /, ''));
      }
    }
  });
  if (!terminal && !streamError) throw new GatewayError('gateway stream ended without a terminal event', 'INCOMPLETE');
  return { firstByteMs, text, streamError, usage };
}

function sniff(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57) return 'image/webp';
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
}

function previewURL(value, secrets) {
  if (typeof value !== 'string' || cleanText(value, secrets) !== value) return undefined;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined;
    if ([...url.searchParams].some(([k, v]) => /token|key|auth|secret|signature|credential/i.test(k) || cleanText(v, secrets) !== v)) return undefined;
    if (cleanText(decodeURIComponent(url.pathname + url.hash), secrets) !== decodeURIComponent(url.pathname + url.hash)) return undefined;
    return url.href;
  } catch { return undefined; }
}

export class ModelTester {
  /**
   * host.channelFacts(channelId) -> immutable connection facts + apiKey()
   * host.entryFor(channelId, modelId) -> catalog entry
   * host.submitVideo?(channelId, modelId) -> { taskId }, acceptance only
   * TODO host API: resolve facts+entry from ONE revisioned snapshot. Separate
   * calls can observe different channel edits; video submission needs the same
   * snapshot too. This cannot be fixed solely within this consumer.
   */
  constructor(host) {
    this.host = host;
    this.inflight = new Map();
    this.paidInflight = new Set();
    const saved = readCache(RESULTS_FILE);
    this.results = new Map(Object.entries(saved?.results ?? {}).slice(-RESULTS_LIMIT).map(([k, v]) => {
      const { preview, outputPreview, ...durable } = v && typeof v === 'object' ? v : {};
      return [k, sanitize(durable, [])];
    }));
  }

  key(channelId, modelId) { return `${channelId}\u0000${modelId}`; }
  last(channelId, modelId) { return this.results.get(this.key(channelId, modelId)); }
  forget(channelId) {
    for (const k of this.results.keys()) if (k.startsWith(`${channelId}\u0000`)) this.results.delete(k);
    this.persist();
  }
  persist() {
    try { writeCache(RESULTS_FILE, { version: 1, results: Object.fromEntries(this.results) }); } catch { /* best effort */ }
  }
  record(channelId, modelId, result) {
    const { preview, outputPreview, ...durable } = result;
    const key = this.key(channelId, modelId);
    this.results.delete(key);
    this.results.set(key, durable);
    while (this.results.size > RESULTS_LIMIT) this.results.delete(this.results.keys().next().value);
    this.persist();
    return result;
  }

  async run(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new GatewayError('invalid test request', 'INVALID_REQUEST', { status: 400 });
    const { channelId, modelId, confirmPaid = false } = input;
    validateId(channelId, 'channelId', 128);
    validateId(modelId, 'modelId', 512);
    if (typeof confirmPaid !== 'boolean') throw new GatewayError('confirmPaid must be boolean', 'INVALID_REQUEST', { status: 400 });
    const running = this.inflight.get(channelId) ?? 0;
    if (running >= PER_CHANNEL_LIMIT) throw new GatewayError('too many tests running on this channel', 'RATE_LIMIT', { status: 429 });
    const key = this.key(channelId, modelId);
    if (this.paidInflight.has(key)) throw new GatewayError('a paid test is already running for this channel and model', 'RATE_LIMIT', { status: 429 });
    // Reserve synchronously, before discovery can make any network requests.
    this.inflight.set(channelId, running + 1);
    let paidReserved = confirmPaid;
    if (paidReserved) this.paidInflight.add(key);
    let kind, upstreamModel = modelId, secrets = [];
    try {
      const facts = await this.host.channelFacts(channelId);
      secrets = secretsFor(facts);
      const apiKey = await facts.apiKey();
      secrets = secretsFor(facts, apiKey);
      const entry = facts.entryFor ? await facts.entryFor(modelId) : await this.host.entryFor(channelId, modelId);
      if (facts.entryFor && !entry) throw new GatewayError('model is not enabled on this channel', 'UNKNOWN_MODEL', { status: 400 });
      upstreamModel = upstreamModelOf({ id: modelId, upstreamModel: entry?.upstreamModel });
      kind = entry?.kind ?? 'chat';
      if (!['chat', 'image', 'video'].includes(kind)) throw new GatewayError(`testing ${kind} models is not supported`, 'UNSUPPORTED', { status: 400 });
      if (kind !== 'chat' && confirmPaid !== true) throw new GatewayError('paid test requires confirmation', 'CONFIRM_REQUIRED', { status: 400 });
      let result;
      if (kind === 'chat') result = await this.chat(facts, entry, modelId, apiKey);
      else if (kind === 'image') result = await this.image(facts, upstreamModel, apiKey);
      else result = await this.video(channelId, modelId, facts);
      return this.record(channelId, modelId, sanitize({ channelId, modelId, upstreamModel, kind, phase: result.ok ? 'completed' : 'failed', ...result, testedAt: Date.now() }, secrets));
    } catch (error) {
      const message = cleanText(error?.message ?? error, secrets).slice(0, 1000);
      if (error?.status === 400 || error?.status === 429) throw new GatewayError(message, cleanText(error.code, secrets), { status: error.status });
      const status = error?.status;
      return this.record(channelId, modelId, sanitize({
        ok: false, phase: 'failed', channelId, modelId, upstreamModel, kind, testedAt: Date.now(),
        code: error?.name === 'TimeoutError' ? 'TIMEOUT' : error?.code && error.code !== 'HTTP' ? error.code : classifyTestError(status, message),
        ...(status ? { status } : {}), error: message,
      }, secrets));
    } finally {
      if (paidReserved) this.paidInflight.delete(key);
      const left = (this.inflight.get(channelId) ?? 1) - 1;
      if (left > 0) this.inflight.set(channelId, left); else this.inflight.delete(channelId);
    }
  }

  async chat(facts, entry, modelId, apiKey) {
    const protocol = pickTestProtocol(entry?.endpointTypes, facts.endpointPriority);
    if (protocol === 'unsupported') return { ok: false, protocol, code: 'UNSUPPORTED', error: 'testing the advertised protocol is not supported' };
    const req = requestFor(protocol, gatewayRoot(facts.baseURL), upstreamModelOf({ id: modelId, upstreamModel: entry?.upstreamModel }), apiKey, facts.headers);
    const started = Date.now();
    const signal = AbortSignal.timeout(CHAT_TIMEOUT_MS);
    const secrets = secretsFor(facts, apiKey);
    try {
      const res = await fetch(req.url, { method: 'POST', redirect: 'manual', signal, headers: req.headers, body: JSON.stringify(req.body) });
      if (!res.ok) {
        const raw = await boundedText(res, STREAM_BYTE_LIMIT, signal);
        let json; try { json = JSON.parse(raw); } catch { /* non-JSON error */ }
        const message = cleanText(errorMessageOf(json, raw), secrets).slice(0, 1000);
        return { ok: false, protocol, status: res.status, code: classifyTestError(res.status, message), error: message, latencyMs: Date.now() - started };
      }
      const stream = await readStream(res, started, signal, protocol);
      const latencyMs = Date.now() - started;
      if (stream.streamError) {
        const message = cleanText(stream.streamError, secrets).slice(0, 1000);
        return { ok: false, protocol, code: classifyTestError(res.status, message), error: message, latencyMs, firstByteMs: stream.firstByteMs };
      }
      return sanitize({ ok: true, phase: 'completed', status: 'completed', protocol, latencyMs, firstByteMs: stream.firstByteMs,
        outputPreview: cleanText(stream.text, secrets).slice(0, 80), ...(stream.usage ? { usage: stream.usage } : {}) }, secrets);
    } catch (error) {
      return { ok: false, protocol, code: error?.name === 'TimeoutError' ? 'TIMEOUT' : error?.code ?? 'UNREACHABLE', error: cleanText(error?.message ?? error, secrets).slice(0, 1000), latencyMs: Date.now() - started };
    }
  }

  async image(facts, modelId, apiKey) {
    const started = Date.now();
    const signal = AbortSignal.timeout(IMAGE_TIMEOUT_MS);
    const secrets = secretsFor(facts, apiKey);
    try {
      const res = await fetch(`${gatewayRoot(facts.baseURL)}/v1/images/generations`, {
        method: 'POST', redirect: 'manual', signal,
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', accept: 'application/json', ...facts.headers },
        body: JSON.stringify({ model: modelId, prompt: 'A small red circle on white.', n: 1 }),
      });
      const raw = await boundedText(res, res.ok ? IMAGE_BYTE_LIMIT : STREAM_BYTE_LIMIT, signal);
      let json; try { json = JSON.parse(raw); } catch { /* handled as missing image */ }
      const latencyMs = Date.now() - started;
      if (!res.ok || json?.error || ['failed', 'incomplete', 'cancelled'].includes(json?.status)) {
        const message = cleanText(errorMessageOf(json, raw), secrets).slice(0, 1000);
        return { ok: false, phase: 'failed', protocol: 'images', status: res.status, code: classifyTestError(res.status, message), error: message, latencyMs };
      }
      const item = json?.data?.[0];
      let preview, hasImage = false;
      if (typeof item?.b64_json === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(item.b64_json)) {
        const bytes = Buffer.from(item.b64_json, 'base64');
        const mime = sniff(bytes);
        hasImage = !!mime;
        if (mime && bytes.byteLength < PREVIEW_LIMIT) preview = { type: 'image', src: `data:${mime};base64,${item.b64_json}` };
      } else if (item?.url) {
        const src = previewURL(item.url, secrets);
        hasImage = !!src;
        if (src) preview = { type: 'image', src };
      }
      const status = String(json?.status ?? '').toLowerCase();
      if (res.status === 202 || ['accepted', 'queued', 'pending', 'processing', 'in_progress', 'running'].includes(status)) {
        return { ok: false, phase: 'accepted', status: status || 'accepted', protocol: 'images', latencyMs, code: 'PENDING', error: 'image request accepted; generation is not yet verified' };
      }
      if (!hasImage) return { ok: false, phase: 'failed', protocol: 'images', code: 'BAD_RESPONSE', error: 'the gateway returned no usable image', latencyMs };
      return sanitize({ ok: true, phase: 'completed', status: 'completed', protocol: 'images', latencyMs, ...(preview ? { preview } : {}) }, secrets);
    } catch (error) {
      const timedOut = error?.name === 'TimeoutError';
      return { ok: false, phase: 'failed', protocol: 'images', code: timedOut ? 'TIMEOUT' : error?.code ?? 'UNREACHABLE',
        error: `${cleanText(error?.message ?? error, secrets).slice(0, 1000)}${timedOut ? ' (the gateway may still finish and bill this image)' : ''}`, latencyMs: Date.now() - started };
    }
  }

  async video(channelId, modelId, facts) {
    const submit = facts?.submitVideo ?? ((id) => this.host.submitVideo?.(channelId, id));
    if (!facts?.submitVideo && !this.host.submitVideo) return { ok: false, protocol: 'videos', code: 'UNSUPPORTED', error: 'video testing is not available' };
    const started = Date.now();
    const result = await submit(modelId);
    if (typeof result?.taskId !== 'string' || !result.taskId.trim() || result.taskId.length > 512) return { ok: false, phase: 'failed', protocol: 'videos', code: 'BAD_RESPONSE', error: 'video submission returned no task ID' };
    return { ok: false, phase: 'accepted', status: 'accepted', protocol: 'videos', code: 'PENDING', error: 'video request accepted; generation is not yet verified', latencyMs: Date.now() - started, preview: { type: 'video-task', taskId: result.taskId } };
  }
}
