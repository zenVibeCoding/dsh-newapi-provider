/**
 * Gateway model catalog.
 *
 * Sources, lowest to highest precedence:
 *   1. GET /v1/models           — ids and supported_endpoint_types
 *   2. GET /api/pricing         — vendor, quota type, ratios, per-call price
 *   3. models.dev               — context window, output cap, modalities, reasoning
 *   4. user overrides (config)  — anything the user pins
 *
 * Every entry carries a `kind` (chat / image / video / audio / embedding /
 * other) so chat models go to the picker and media models go to the tools.
 */
import { fetchJson, gatewayRoot } from './util.js';

export const DEFAULT_CONTEXT_WINDOW = 128_000;
export const DEFAULT_MAX_TOKENS = 32_768;
const CATALOG_TTL_MS = 10 * 60 * 1000;

/** Name rules used only when models.dev has no output-modality data. */
const KIND_PATTERNS = [
  ['video', /(^|[-_/])(sora|veo|kling|vidu|hailuo|seedance|wan\d|wanx|cogvideo|happyhorse|video|t2v|i2v|runway|luma|pika)/i],
  ['image', /(^|[-_/])(gpt-image|dall-e|imagen|flux|midjourney|mj[-_]|seedream|cogview|stable-diffusion|sdxl|sd3|recraft|ideogram|image)/i],
  ['audio', /(^|[-_/])(tts|whisper|speech|audio|suno|voice)/i],
  ['embedding', /(embed|embedding|rerank|bge-|text-embedding)/i],
];

export function classify(id, dev) {
  const out = dev?.outputModalities ?? [];
  if (out.includes('video')) return 'video';
  if (out.includes('image') && !out.includes('text')) return 'image';
  if (out.includes('audio') && !out.includes('text')) return 'audio';
  for (const [kind, re] of KIND_PATTERNS) if (re.test(id)) return kind;
  if (out.includes('text') || out.length === 0) return 'chat';
  return 'other';
}

/** One-hop wire identity. Empty legacy/config values retain the local id. */
export function upstreamModelOf(entry) {
  return typeof entry?.upstreamModel === 'string' && entry.upstreamModel.trim() ? entry.upstreamModel.trim() : entry.id;
}

function prettyName(id) {
  return id;
}

export class Catalog {
  constructor({ modelsDev, logger }) {
    this.modelsDev = modelsDev;
    this.logger = logger;
    this.cache = new Map();
    this.epoch = 0;
  }

  invalidate() {
    this.epoch++;
    this.cache.clear();
  }

  /**
   * Fetch the raw gateway lists. /v1/models is required; /api/pricing is
   * optional because some deployments hide the pricing page.
   */
  async fetchGateway(conn, apiKey, signal) {
    const root = gatewayRoot(conn.baseURL);
    const models = await fetchJson(`${root}/v1/models`, { apiKey, signal, headers: conn.headers });
    let pricing;
    let pricingError;
    try {
      pricing = await fetchJson(`${root}/api/pricing`, { apiKey, signal, headers: conn.headers });
    } catch (error) {
      pricingError = String(error?.message ?? error);
    }
    return { models, pricing, pricingError };
  }

  /** Full catalog for one connection, cached per base URL + key fingerprint. */
  async get(conn, apiKey, { signal, force = false } = {}) {
    const key = this.key(conn);
    const epoch = this.epoch;
    const hit = this.cache.get(key);
    if (!force && hit && Date.now() - hit.at < CATALOG_TTL_MS && hit.overridesRev === conn.overridesRev) return hit.value;
    void this.modelsDev.refresh();
    const raw = await this.fetchGateway(conn, apiKey, signal);
    const value = this.build(conn, raw);
    if (epoch === this.epoch) this.cache.set(key, { at: Date.now(), value, overridesRev: conn.overridesRev });
    return value;
  }

  /** Last good catalog for a connection without network, if any. */
  key(conn) {
    return JSON.stringify([conn.channelId, gatewayRoot(conn.baseURL), conn.keyFingerprint, conn.overridesRev, conn.headers, conn.enabledModels ?? null]);
  }

  peek(conn) {
    return this.cache.get(this.key(conn))?.value;
  }

  build(conn, { models, pricing, pricingError }) {
    const priced = new Map();
    for (const p of pricing?.data ?? []) priced.set(p.model_name, p);
    const vendors = new Map((pricing?.vendors ?? []).map((v) => [v.id, v.name]));
    const overrides = conn.overrides;
    const entries = [];
    const seen = new Set();

    const gateway = new Map();
    for (const m of models?.data ?? []) if (m?.id && !gateway.has(m.id)) gateway.set(m.id, m);
    const make = (id, localGatewayEntry) => {
      // Own-property read: ids like `toString` or `constructor` are legal model names.
      const ov = (Object.hasOwn(overrides ?? {}, id) ? overrides[id] : undefined) ?? {};
      const upstreamModel = upstreamModelOf({ id, upstreamModel: ov.upstreamModel });
      const targetGatewayEntry = gateway.get(upstreamModel);
      const targetPrice = priced.get(upstreamModel);
      const price = targetPrice ?? priced.get(id);
      const targetDev = this.modelsDev.match(upstreamModel);
      const dev = targetDev ?? (upstreamModel !== id ? this.modelsDev.match(id) : undefined);
      const kind = ov.kind ?? classify(upstreamModel, dev);
      const endpointTypes = ov.protocol
        ? [ov.protocol]
        : (targetGatewayEntry?.supported_endpoint_types ?? targetPrice?.supported_endpoint_types ?? localGatewayEntry?.supported_endpoint_types ?? price?.supported_endpoint_types ?? []);
      const devInput = (dev?.input ?? []).filter((m) => typeof m === 'string');
      const input = ov.input ?? (devInput.length ? devInput : ['text']);
      return {
        id,
        upstreamModel,
        availability: gateway.has(upstreamModel) ? 'listed' : ov.custom === true ? 'custom' : 'missing',
        automaticContextWindow: dev?.context > 0 ? dev.context : conn.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW,
        automaticMaxTokens: dev?.output > 0 ? dev.output : conn.defaultMaxTokens ?? DEFAULT_MAX_TOKENS,
        name: ov.name ?? prettyName(id),
        kind,
        hidden: ov.hidden === true,
        endpointTypes,
        vendor: price ? (vendors.get(price.vendor_id) ?? null) : null,
        pricing: price ? {
          quotaType: price.quota_type === 1 ? 'per-call' : 'per-token',
          modelRatio: price.model_ratio,
          completionRatio: price.completion_ratio,
          modelPrice: price.model_price,
          cacheRatio: price.create_cache_ratio,
          groups: price.enable_groups ?? [],
        } : null,
        contextWindow: ov.contextWindow ?? (dev?.context > 0 ? dev.context : undefined),
        maxTokens: ov.maxTokens ?? (dev?.output > 0 ? dev.output : undefined),
        input,
        automaticInput: devInput.length ? devInput : ['text'],
        automaticReasoning: dev?.reasoning ?? false,
        outputModalities: dev?.outputModalities ?? [],
        reasoning: ov.reasoning ?? dev?.reasoning ?? false,
        reasoningLevels: ov.reasoningLevels,
        source: {
          gateway: Boolean(localGatewayEntry),
          upstreamGateway: gateway.has(upstreamModel),
          metadataModel: targetDev ? upstreamModel : id,
          pricingModel: price ? (priced.has(upstreamModel) ? upstreamModel : id) : null,
          modelsDev: dev ? { provider: dev.provider, match: dev.match } : null,
          overridden: Object.keys(ov).filter((k) => ov[k] !== undefined),
        },
      };
    };

    const enabled = Array.isArray(conn.enabledModels) ? conn.enabledModels : undefined;

    if (enabled) {
      // List mode: exactly the saved list, in saved order. Ids the gateway no
      // longer returns stay visible and marked, so the user decides.
      for (const id of enabled) {
        if (seen.has(id)) continue;
        seen.add(id);
        const g = gateway.get(id);
        const entry = make(id, g);
        entries.push(entry);
      }
    } else {
      // Automatic mode (configs from before the list existed): every gateway model.
      for (const [id, g] of gateway) {
        seen.add(id);
        const entry = make(id, g);
        entries.push(entry);
      }
      for (const id of Object.keys(overrides)) {
        if (seen.has(id) || !Object.hasOwn(overrides, id) || overrides[id]?.custom !== true) continue;
        seen.add(id);
        const entry = make(id, undefined);
        entries.push(entry);
      }
    }
    return {
      fetchedAt: Date.now(),
      listMode: enabled ? 'list' : 'auto',
      gatewayIds: [...gateway.keys()],
      entries,
      pricingAvailable: Boolean(pricing),
      pricingError: pricingError ?? null,
      supportedEndpoints: pricing?.supported_endpoint ?? null,
      groupRatio: pricing?.group_ratio ?? null,
    };
  }
}

/** Chat models visible in the picker, in gateway order. */
export function chatModels(catalog) {
  return (catalog?.entries ?? []).filter((e) => e.kind === 'chat' && !e.hidden);
}

export function mediaModels(catalog, kind) {
  return (catalog?.entries ?? []).filter((e) => e.kind === kind && !e.hidden);
}
