/**
 * models.dev capability lookup: context window, output cap, input/output
 * modalities, reasoning. The index is trimmed and cached on disk so a cold
 * start without network still has capability data.
 */
import { fetchJson, readCache, writeCache } from './util.js';

const CACHE_FILE = 'models-dev-index.json';
const CACHE_VERSION = 1;
const DEFAULT_URL = 'https://models.dev/api.json';
const TTL_MS = 24 * 60 * 60 * 1000;

/** First-party provider per model family; used to break ties across resellers. */
const FAMILY_PROVIDERS = [
  [/^claude/, ['anthropic']],
  [/^(gpt|o\d|chatgpt|codex|dall-e|gpt-image|sora|whisper|tts)/, ['openai']],
  [/^gemini|^imagen|^veo/, ['google', 'google-vertex']],
  [/^deepseek/, ['deepseek']],
  [/^(glm|cogview|cogvideo)/, ['zai', 'zhipuai']],
  [/^(qwen|qwq|wan)/, ['alibaba', 'alibaba-cn']],
  [/^grok/, ['xai']],
  [/^(kimi|moonshot)/, ['moonshotai', 'moonshotai-cn']],
  [/^(minimax|abab|hailuo)/, ['minimax', 'minimax-cn']],
  [/^(doubao|seed)/, ['volcengine', 'bytedance']],
  [/^mistral|^codestral|^magistral/, ['mistral']],
  [/^llama/, ['meta', 'meta-llama']],
];

function bare(id) {
  return String(id).toLowerCase().split('/').pop();
}

/** Own-property read: a model literally named `constructor` must not hit Object.prototype. */
function own(table, key) {
  return table && Object.hasOwn(table, key) ? table[key] : undefined;
}

function compact(entry, provider) {
  const m = entry;
  return {
    provider,
    name: m.name,
    context: m.limit?.context ?? 0,
    output: m.limit?.output ?? 0,
    input: m.modalities?.input ?? [],
    outputModalities: m.modalities?.output ?? [],
    reasoning: Boolean(m.reasoning),
    toolCall: m.tool_call !== false,
    release: m.release_date,
  };
}

/** Build `{ bareId: [compact entries] }` from the raw models.dev document. */
function buildIndex(doc) {
  // Null prototype: gateway ids such as `__proto__` or `constructor` must stay data.
  const index = Object.create(null);
  for (const [provider, p] of Object.entries(doc ?? {})) {
    for (const [id, m] of Object.entries(p?.models ?? {})) {
      const key = bare(id);
      (own(index, key) ?? (index[key] = [])).push(compact(m, provider));
    }
  }
  return index;
}

export class ModelsDev {
  constructor({ url = DEFAULT_URL, enabled = true, logger } = {}) {
    this.url = url;
    this.enabled = enabled;
    this.logger = logger;
    const cached = readCache(CACHE_FILE);
    this.index = cached?.version === CACHE_VERSION ? cached.index : undefined;
    this.fetchedAt = cached?.version === CACHE_VERSION ? cached.fetchedAt : 0;
    this.inflight = undefined;
    this.lastError = undefined;
  }

  /** Refresh in the background when stale; never throws. */
  async refresh({ force = false } = {}) {
    if (!this.enabled) return;
    if (!force && this.index && Date.now() - this.fetchedAt < TTL_MS) return;
    this.inflight ??= (async () => {
      try {
        const doc = await fetchJson(this.url, { timeoutMs: 30_000, maxBytes: 64 * 1024 * 1024 });
        this.index = buildIndex(doc);
        this.fetchedAt = Date.now();
        this.lastError = undefined;
        writeCache(CACHE_FILE, { version: CACHE_VERSION, fetchedAt: this.fetchedAt, index: this.index });
        // Let the catalog drop entries built before this data was available.
        this.onUpdated?.();
      } catch (error) {
        this.lastError = String(error?.message ?? error);
        this.logger?.warn?.(`newapi-provider: models.dev refresh failed: ${this.lastError}`);
      } finally {
        this.inflight = undefined;
      }
    })();
    return this.inflight;
  }

  /**
   * Match one gateway model id. Exact bare-id match first; then progressively
   * strip trailing `-segment`s (`claude-opus-5-5-high` → `claude-opus-5-5`).
   * Ties across providers prefer the family's first-party provider, then the
   * entry that actually carries a context window.
   */
  match(id) {
    // A disabled switch means no capability data at all, including a previously cached copy.
    if (!this.enabled || !this.index) return undefined;
    const key = bare(id);
    let candidates = own(this.index, key);
    let kind = 'exact';
    if (!candidates) {
      const parts = key.split('-');
      for (let n = parts.length - 1; n >= 2 && !candidates; n--) {
        candidates = own(this.index, parts.slice(0, n).join('-'));
      }
      kind = 'prefix';
    }
    if (!candidates?.length) return undefined;
    const preferred = FAMILY_PROVIDERS.find(([re]) => re.test(key))?.[1] ?? [];
    const score = (c) => {
      const p = preferred.indexOf(c.provider);
      return (p >= 0 ? 100 - p : 0) + (c.context > 0 ? 10 : 0) + (c.input.length > 0 ? 1 : 0);
    };
    const best = [...candidates].sort((a, b) => score(b) - score(a))[0];
    return { ...best, match: kind };
  }

  status() {
    return {
      enabled: this.enabled,
      loaded: Boolean(this.index),
      fetchedAt: this.fetchedAt || null,
      models: this.index ? Object.keys(this.index).length : 0,      lastError: this.lastError ?? null,
    };
  }
}
