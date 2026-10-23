/**
 * Balance and quota for the configured New API token.
 *
 * GET /api/status        (no auth)  → quota_per_unit, quota_display_type, usd_exchange_rate, custom currency
 * GET /api/usage/token/  (token)    → token quota; `user_quota` too when the token allows user-quota queries
 *
 * Conversion mirrors New API's own billing controller: USD = quota / quota_per_unit,
 * CNY = USD × usd_exchange_rate, TOKENS = raw quota. `price` (top-up unit price)
 * is not an exchange rate and is never used.
 */
import { fetchJson, gatewayRoot, GatewayError } from './util.js';

const DEFAULT_QUOTA_PER_UNIT = 500_000;

export function displayOf(status) {
  const perUnit = Number(status?.quota_per_unit) > 0 ? Number(status.quota_per_unit) : DEFAULT_QUOTA_PER_UNIT;
  const type = String(status?.quota_display_type ?? (status?.display_in_currency === false ? 'TOKENS' : 'USD')).toUpperCase();
  const rate = Number(status?.usd_exchange_rate) > 0 ? Number(status.usd_exchange_rate) : 7.3;
  if (type === 'CNY') return { unit: 'CNY', symbol: '¥', factor: rate / perUnit, perUnit, estimated: status === undefined };
  if (type === 'TOKENS') return { unit: 'TOKENS', symbol: '', factor: 1, perUnit, estimated: status === undefined };
  if (type === 'CUSTOM') {
    const customRate = Number(status?.custom_currency_exchange_rate) > 0 ? Number(status.custom_currency_exchange_rate) : 1;
    return { unit: 'CUSTOM', symbol: status?.custom_currency_symbol || '¤', factor: customRate / perUnit, perUnit, estimated: false };
  }
  return { unit: 'USD', symbol: '$', factor: 1 / perUnit, perUnit, estimated: status === undefined };
}

function amount(quota, display) {
  if (!Number.isFinite(quota)) return null;
  return Math.round(quota * display.factor * 10000) / 10000;
}

export class BalanceService {
  constructor({ capture, connection, apiKey, logger }) {
    this.capture = capture ?? (() => { const conn = connection(); return { connection: conn, requireApiKey: () => apiKey(conn) }; });
    this.logger = logger;
    this.state = { status: 'idle' };
    this.statusDoc = undefined;
    this.statusAt = 0;
    this.backoffUntil = 0;
    this.inflight = undefined;
  }

  async serverStatus(root, headers) {
    if (this.statusDoc && this.statusRoot === root && Date.now() - this.statusAt < 30 * 60 * 1000) return this.statusDoc;
    if (this.statusRoot !== root) this.statusDoc = undefined;
    try {
      // Same gateway, same extra headers as every other request (header-gated proxies).
      const doc = await fetchJson(`${root}/api/status`, { headers });
      this.statusDoc = doc?.data ?? doc;
      this.statusRoot = root;
      this.statusAt = Date.now();
    } catch (error) {
      this.logger?.warn?.(`newapi-provider: /api/status unavailable: ${error.message}`);
    }
    return this.statusDoc;
  }

  /** Refresh unless rate-limited; concurrent callers share one request. */
  refresh({ force = false } = {}) {
    if (!force && Date.now() < this.backoffUntil) return Promise.resolve(this.state);
    this.inflight ??= this.load().finally(() => { this.inflight = undefined; });
    return this.inflight;
  }

  async load() {
    let apiKey;
    let root;
    let headers;
    try {
      const bound = this.capture();
      root = gatewayRoot(bound.connection.baseURL);
      headers = bound.connection.headers;
      apiKey = await bound.requireApiKey();
    } catch (error) {
      this.state = { status: 'error', code: 'MISSING_CREDENTIAL', message: error.message, at: Date.now() };
      return this.state;
    }
    try {
      const status = await this.serverStatus(root, headers);
      const display = displayOf(status);
      const usage = await fetchJson(`${root}/api/usage/token/`, { apiKey, headers });
      const d = usage?.data ?? usage;
      if (usage?.code === false || !d || typeof d !== 'object') throw new GatewayError(usage?.message || 'unexpected /api/usage/token response', 'BAD_RESPONSE');
      const unlimited = d.unlimited_quota === true;
      const token = {
        name: d.name ?? null,
        unlimited,
        used: amount(d.total_used, display),
        granted: unlimited ? null : amount(d.total_granted, display),
        remaining: unlimited ? null : amount(d.total_available, display),
        expiresAt: d.expires_at > 0 ? d.expires_at * (d.expires_at < 1e12 ? 1000 : 1) : null,
        modelLimits: d.model_limits_enabled ? Object.keys(d.model_limits ?? {}) : null,
      };
      const user = d.user_quota && typeof d.user_quota === 'object'
        ? { remaining: amount(d.user_quota.total_available, display), used: amount(d.user_quota.total_used, display) }
        : null;
      this.state = {
        status: 'ok',
        at: Date.now(),
        currency: { unit: display.unit, symbol: display.symbol, estimated: display.estimated },
        token,
        user,
        userQuotaHint: user ? null : 'enable-allow-user-quota-query',
        serverVersion: status?.version ?? null,
        systemName: status?.system_name ?? null,
      };
      this.backoffUntil = 0;
    } catch (error) {
      if (error.code === 'RATE_LIMIT') this.backoffUntil = Date.now() + (error.retryAfterMs ?? 60_000);
      this.state = {
        ...(this.state.status === 'ok' ? this.state : {}),
        status: this.state.status === 'ok' ? 'stale' : 'error',
        code: error.code ?? 'ERROR',
        message: error.message,
        errorAt: Date.now(),
      };
    }
    return this.state;
  }
}
