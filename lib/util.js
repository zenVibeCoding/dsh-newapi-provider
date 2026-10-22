/**
 * Shared helpers: gateway URLs, bounded HTTP, secret redaction, cache files.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Gateway root without trailing slash or version segment (`http://host:3300`). */
export function gatewayRoot(baseURL) {
  return String(baseURL ?? '').trim().replace(/\/+$/, '').replace(/\/v\d+$/, '');
}

/** OpenAI SDK base for a gateway (`http://host:3300/v1`). */
export function openaiBase(baseURL) {
  return `${gatewayRoot(baseURL)}/v1`;
}

/** Replace every occurrence of a secret (and anything shaped like a key) in text. */
export function redact(text, secret) {
  let out = String(text ?? '');
  if (secret) out = out.split(secret).join('<redacted>');
  return out.replace(/sk-[A-Za-z0-9_-]{12,}/g, 'sk-<redacted>');
}

export class GatewayError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'GatewayError';
    this.code = code;
    Object.assign(this, details);
  }
}

/**
 * Fetch JSON from the gateway. Redirects are not followed: New API answers a
 * missing trailing slash with 301, and following it can drop the auth header.
 */
export async function fetchJson(url, { apiKey, method = 'GET', body, headers = {}, timeoutMs = 15_000, signal, maxBytes = 8 * 1024 * 1024 } = {}) {
  const signals = [AbortSignal.timeout(timeoutMs)];
  if (signal) signals.push(signal);
  let res;
  try {
    res = await fetch(url, {
      method,
      redirect: 'manual',
      signal: AbortSignal.any(signals),
      headers: {
        accept: 'application/json',
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        ...(body !== undefined && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
    });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError';
    throw new GatewayError(redact(`${timedOut ? 'timed out' : 'network error'} calling ${url}: ${error?.message ?? error}`, apiKey), timedOut ? 'TIMEOUT' : 'UNREACHABLE');
  }
  if (res.status >= 300 && res.status < 400) {
    throw new GatewayError(`gateway redirected ${url} to ${res.headers.get('location') ?? '?'}; check the base URL`, 'REDIRECT', { status: res.status });
  }
  const text = await readBounded(res, maxBytes);
  let json;
  try { json = text.length > 0 ? JSON.parse(text) : undefined; } catch { json = undefined; }
  if (!res.ok) {
    const message = json?.error?.message ?? json?.message ?? text.slice(0, 300);
    const code = res.status === 401 || res.status === 403 ? 'AUTH' : res.status === 429 ? 'RATE_LIMIT' : res.status >= 500 ? 'SERVER' : 'HTTP';
    const retryAfter = Number(res.headers.get('retry-after'));
    throw new GatewayError(redact(`HTTP ${res.status} from ${url}: ${message}`, apiKey), code, {
      status: res.status,
      ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfterMs: retryAfter * 1000 } : {}),
    });
  }
  if (json === undefined) {
    const hint = /<html/i.test(text) ? ' (got HTML — the base URL may be missing /v1 or point at the web UI)' : '';
    throw new GatewayError(`gateway returned non-JSON from ${url}${hint}`, 'BAD_RESPONSE', { status: res.status });
  }
  return json;
}

async function readBounded(res, maxBytes) {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new GatewayError(`response larger than ${maxBytes} bytes`, 'TOO_LARGE');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

/** Directory for this plugin's cache files under the DeepSeek Harness home. */
export function dataDir() {
  const home = process.env.DSH_HOME && path.isAbsolute(process.env.DSH_HOME)
    ? process.env.DSH_HOME
    : path.join(os.homedir(), '.dsh');
  return path.join(home, 'plugin-data', 'dsh-newapi-studio');
}

export function readCache(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir(), name), 'utf8'));
  } catch {
    return undefined;
  }
}

export function writeCache(name, value) {
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.renameSync(tmp, file);
}

/** Stable short fingerprint of a secret, for cache keys (never the secret itself). */
export function fingerprint(secret) {
  let h = 2166136261;
  for (const ch of String(secret ?? '')) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return (h >>> 0).toString(36);
}
