/**
 * LLM adapter for the New API gateway route.
 *
 * Wire protocols are served by the pi-ai SDK that DeepSeek Harness itself
 * ships; the harness ↔ pi-ai conversion is delegated to the official
 * `PiAiAdapter` from `@deepseek-ai/dsh-llm-pi-ai`, so message history,
 * replay state, image handling and error classification stay identical to the
 * built-in providers and follow DSH upgrades automatically.
 *
 * This module only turns the gateway catalog into one pi-ai provider profile
 * per refresh, and answers model metadata from the catalog (context window,
 * output cap, modalities, reasoning) with user overrides applied.
 */
import { LlmAdapter, LlmError, ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai';
import { createProvider } from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy';
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy';
import { googleGenerativeAIApi } from '@earendil-works/pi-ai/api/google-generative-ai.lazy';
import { chatModels, DEFAULT_CONTEXT_WINDOW, DEFAULT_MAX_TOKENS } from './catalog.js';
import { gatewayRoot, openaiBase } from './util.js';

const ENDPOINT_TO_API = {
  'openai-response': 'openai-responses',
  anthropic: 'anthropic-messages',
  openai: 'openai-completions',
  gemini: 'google-generative-ai',
};
export const DEFAULT_ENDPOINT_PRIORITY = ['openai', 'anthropic', 'openai-response', 'gemini'];
const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

export function pickApi(endpointTypes, priority = DEFAULT_ENDPOINT_PRIORITY) {
  const advertised = endpointTypes?.length ? endpointTypes : ['openai'];
  for (const t of priority) if (advertised.includes(t) && ENDPOINT_TO_API[t]) return ENDPOINT_TO_API[t];
  for (const t of advertised) if (ENDPOINT_TO_API[t]) return ENDPOINT_TO_API[t];
  return 'openai-completions';
}

function baseUrlFor(baseURL, api) {
  return api === 'openai-completions' || api === 'openai-responses' ? openaiBase(baseURL) : gatewayRoot(baseURL);
}

/** Reasoning level map: explicit override levels, else "reasoning on" defaults. */
function thinkingLevelMap(entry) {
  if (!entry.reasoning) return undefined;
  if (!entry.reasoningLevels?.length) return undefined;
  const allowed = new Set(entry.reasoningLevels);
  return Object.fromEntries(LEVELS.map((l) => [l, allowed.has(l) ? l : null]));
}

export function toPiModel(entry, conn, priority) {
  const api = pickApi(entry.endpointTypes, priority);
  const levels = thinkingLevelMap(entry);
  return {
    id: entry.id,
    name: entry.name,
    api,
    provider: conn.providerId,
    baseUrl: baseUrlFor(conn.baseURL, api),
    reasoning: Boolean(entry.reasoning),
    input: entry.input.filter((m) => m === 'text' || m === 'image'),
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: entry.contextWindow ?? conn.defaultContextWindow ?? DEFAULT_CONTEXT_WINDOW,
    maxTokens: entry.maxTokens ?? conn.defaultMaxTokens ?? DEFAULT_MAX_TOKENS,
    ...(levels ? { thinkingLevelMap: levels } : {}),
  };
}

/**
 * Override only the serialized request. Native model/history identities stay
 * local, preserving same-model replay signatures and prepared-call snapshots.
 * All four SDK protocols invoke onPayload after serialization; streamSimple
 * forwards it through buildBaseOptions. No history copying/traversal is added.
 */
export function withUpstreamModels(api, mapping) {
  const wrap = (method) => (model, context, options) => {
    const upstreamModel = mapping.get(model.id);
    if (!upstreamModel || upstreamModel === model.id) return api[method](model, context, options);
    return api[method](model, context, {
      ...options,
      onPayload: async (payload, nativeModel) => {
        const next = await options?.onPayload?.(payload, nativeModel);
        return { ...(next ?? payload), model: upstreamModel };
      },
    });
  };
  return { ...api, stream: wrap('stream'), streamSimple: wrap('streamSimple') };
}

function piProviderFor(conn, models, entries) {
  const mapping = new Map(entries.map((e) => [e.id, e.upstreamModel || e.id]));
  return createProvider({
    id: conn.providerId,
    name: conn.displayName,
    baseUrl: openaiBase(conn.baseURL),
    auth: {
      apiKey: {
        name: conn.displayName,
        resolve: ({ credential }) => Promise.resolve({
          auth: credential?.key === undefined ? {} : { apiKey: credential.key },
          source: conn.displayName,
        }),
      },
    },
    models,
    api: {
      'openai-completions': withUpstreamModels(openAICompletionsApi(), mapping),
      'openai-responses': withUpstreamModels(openAIResponsesApi(), mapping),
      'anthropic-messages': withUpstreamModels(anthropicMessagesApi(), mapping),
      'google-generative-ai': withUpstreamModels(googleGenerativeAIApi(), mapping),
    },
  });
}

/**
 * The adapter registered for the `newapi` route. It owns catalog-driven
 * metadata and delegates streaming to an inner PiAiAdapter that reads one
 * immutable profile map per catalog generation.
 */
export class NewApiAdapter extends LlmAdapter {
  constructor(host) { super(); this.host = host; }

  providerInfo(provider) { return { id: provider, name: this.host.connection().displayName }; }
  providerRetryPolicy() { return this.host.connection().retryPolicy; }

  /** Each operation owns an immutable profile and key, including prepared streams. */
  async bind(signal) {
    const bound = this.host.capture();
    const conn = bound.connection;
    const apiKey = await bound.requireApiKey();
    const catalog = await bound.catalog({ signal });
    const entries = chatModels(catalog);
    const profile = {
      provider: conn.providerId, displayName: conn.displayName, apiKeyEnv: conn.apiKeyRef,
      headers: conn.headers, streamIdleTimeoutMs: conn.streamIdleTimeoutMs,
      maxRequestImageBytes: 20 * 1024 * 1024, requestImagePixelBudget: 2048 * 2048,
      requestImageMaxBytes: 1024 * 1024, retryPolicy: conn.retryPolicy,
      configuredMaxTokens: new Map(entries.filter((e) => e.source.overridden.includes('maxTokens')).map((e) => [e.id, e.maxTokens])),
      modelErrors: new Map(),
      piProvider: piProviderFor(conn, entries.map((e) => toPiModel(e, conn, conn.endpointPriority)), entries),
    };
    const profiles = new Map([[conn.providerId, profile]]);
    const inner = new PiAiAdapter({
      profiles: () => profiles,
      resolveApiKey: async () => apiKey,
      auth: this.host.piAuth,
      resolveAttachments: this.host.resolveAttachments,
      resolveImageAccess: this.host.resolveImageAccess,
      onReplayDegrade: ({ model, reason }) => this.host.logger?.warn?.(`newapi-provider: replay degraded for ${model}: ${reason}`),
    });
    return { inner, catalog };
  }

  async listModels(provider) {
    const bound = this.host.capture();
    let catalog;
    try { catalog = await bound.catalog(); }
    catch (error) { this.host.reportError('catalog', error); return []; }
    return chatModels(catalog).map((e) => ({ provider, id: e.id, name: e.name, inputModalities: e.input.filter((m) => m === 'text' || m === 'image') }));
  }

  async modelInfo(bound, provider, model, signal) {
    const info = await bound.inner.resolveModel(provider, model, signal);
    const entry = bound.catalog.entries.find((e) => e.id === model);
    if (entry?.reasoningLevels?.length) info.reasoning = {
      efforts: entry.reasoningLevels.map((l) => ({ id: ReasoningEffortId(l), name: l.charAt(0).toUpperCase() + l.slice(1) })),
    };
    if (entry?.maxTokens) info.defaultMaxTokens = entry.maxTokens;
    return info;
  }

  async resolveModel(provider, model, signal) {
    return this.modelInfo(await this.bind(signal), provider, model, signal);
  }

  async prepareCall(provider, model, signal) {
    const bound = await this.bind(signal);
    const prepared = await bound.inner.prepareCall(provider, model, signal);
    const resolved = await this.modelInfo(bound, provider, model, signal);
    return { model: resolved, stream: (options) => prepared.stream(options) };
  }

  async *stream(options) {
    const bound = await this.bind(options.signal);
    if (!chatModels(bound.catalog).some((e) => e.id === options.model)) {
      throw new LlmError(`New API gateway has no chat model "${options.model}"`, 'UNKNOWN_MODEL');
    }
    yield* bound.inner.stream(options);
  }
}
