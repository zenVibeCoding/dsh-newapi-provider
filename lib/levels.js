/**
 * Reasoning ("thinking") levels per model.
 *
 * pi-ai renders a level selector from `thinkingLevelMap`: a `null` value hides that
 * level, a string maps it to the vendor's own vocabulary, and an absent key falls
 * back to the provider default. Without a map every reasoning model advertises the
 * same five levels (`off`, `minimal`, `low`, `medium`, `high`) — which is wrong for
 * vendors that cannot turn thinking off, have no effort parameter at all, or support
 * `xhigh`/`max`.
 *
 * Resolution order, highest precedence first:
 *   1. the user's per-model override (`reasoningLevels` in the channel config),
 *   2. pi-ai's own shipped catalog for that model id — the exact map the built-in
 *      providers use, so a model here behaves like the same model there,
 *   3. a vendor-family default (below) when the id is a relay alias the catalog
 *      does not know,
 *   4. the pi-ai default (no map at all) for anything unrecognised.
 */

/** pi-ai's built-in level vocabulary, in display order. Custom names may be added on top. */
export const LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

/** A level id: the built-ins, or a user-chosen name the upstream understands. */
export const CUSTOM_LEVEL = /^[a-z0-9][a-z0-9_-]{0,23}$/;

/** Preset levels first (pi's order), then custom names alphabetically. */
export function orderLevels(names) {
  const preset = LEVELS.filter((level) => names.includes(level));
  const custom = names.filter((name) => !LEVELS.includes(name)).sort();
  return [...preset, ...custom];
}

/** Provider catalogs to consult. Kept small: only vendors a New API relay resells. */
const CATALOG_PROVIDERS = ['openai', 'anthropic', 'google', 'deepseek', 'zai', 'moonshotai', 'xai', 'minimax', 'alibaba'];

/** First-party provider per model family, used to prefer the right catalog and default. */
const FAMILY_RULES = [
  [/^claude|^fable/, 'anthropic'],
  [/^(gpt|o\d|codex|chatgpt|dall-e)/, 'openai'],
  [/^gemini|^gemma/, 'google'],
  [/^deepseek/, 'deepseek'],
  [/^glm|^cogview|^cogvideo/, 'zai'],
  [/^(kimi|moonshot)/, 'moonshotai'],
  [/^grok/, 'xai'],
  [/^(minimax|abab|hailuo)/, 'minimax'],
  [/^(qwen|qwq|wan)/, 'alibaba'],
];

/**
 * Family defaults for ids the catalog does not know (relay aliases such as
 * `claude-opus-5-5` or `deepseek-v4.1-flash`). Each entry mirrors the shape pi-ai
 * ships for that family; `null` hides a level, a string is sent upstream.
 */
const FAMILY_DEFAULTS = [
  // Adaptive thinking: effort levels, no `minimal`, `max` available on every adaptive model.
  [/^claude-(opus-([456]-?\d*|5)|sonnet-([456]|4-\d+|[56]-\d+)|fable|mythos)/, { off: null, minimal: null, low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' }],
  // Budget-based thinking: every level maps to a token budget, so all five apply.
  // Older/unknown Claude: budget-based thinking covers every level (pi-ai ships no map).
  [/^claude/, null],
  // Pro variants expose a narrower set (gpt-5-pro: high only; later pros: medium+).
  [/^gpt-5-pro/, { off: null, minimal: null, low: null, medium: null, high: 'high', xhigh: null, max: null }],
  [/^gpt-5[.-][245]-pro/, { off: null, minimal: null, low: null, medium: 'medium', high: 'high', xhigh: 'xhigh', max: null }],
  [/^gpt-6-astra/, { off: null, minimal: null, low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' }],
  [/^gpt-6[.-]1/, { off: null, minimal: null, low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' }],
  // GPT-5.1+ and GPT-6: "none" turns reasoning off; minimal is gone; xhigh/max exist.
  [/^gpt-(5[.-][1-9]|5[.-]\d\d|6)/, { off: 'none', minimal: null, low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' }],
  // GPT-5.0: minimal exists, no xhigh/max.
  [/^gpt-5/, { off: null, minimal: 'minimal', low: 'low', medium: 'medium', high: 'high', xhigh: null, max: null }],
  // o-series: low/medium/high only.
  [/^o\d/, { off: null, minimal: null, low: 'low', medium: 'medium', high: 'high', xhigh: null, max: null }],
  // Gemini 3: two-step thinking level, cannot be switched off.
  [/^gemini-[34]/, { off: null, minimal: 'MINIMAL', low: 'LOW', medium: 'MEDIUM', high: 'HIGH', xhigh: null, max: null }],
  // Gemini 2.5: thinkingBudget; 0 disables it on flash models.
  // Gemini 2.5 and older: budget-based, no level vocabulary (pi-ai ships no map).
  [/^gemini/, null],
  // DeepSeek V4 exposes effort with a gap at `medium`.
  [/^deepseek/, { minimal: null, medium: null, low: 'low', high: 'high', max: 'max', xhigh: null }],
  [/^glm-5[.-][3-9]/,  { off: null, minimal: null, low: 'low', medium: null, high: 'high', xhigh: null, max: 'max' }],
  [/^glm-5[.-]2/,  { off: 'none', minimal: 'minimal', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' }],
  [/^glm-5/, { off: 'none', minimal: null, low: 'low', medium: null, high: 'high', xhigh: null, max: 'max' }],
  [/^glm/, null],
  [/^(kimi-k3|moonshot-k3)/, { off: null, minimal: null, low: 'low', medium: null, high: 'high', xhigh: null, max: 'max' }],
  [/^(kimi|moonshot)/, null],
  [/^grok-4\.[5-9]/, { off: null, minimal: null, low: 'low', medium: 'medium', high: 'high', xhigh: null, max: null }],
  [/^grok/, { off: 'none', minimal: null, low: 'low', medium: 'medium', high: 'high', xhigh: null, max: null }],
];

/** Normalise an id for catalog comparison: case, dots/underscores, vendor prefixes. */
function normalize(id) {
  return String(id).toLowerCase().split('/').pop().replace(/[._]/g, '-');
}

/** Index one provider catalog by its normalised ids. */
function indexCatalog(catalog) {
  const index = new Map();
  for (const model of Object.values(catalog ?? {})) {
    if (!model?.id) continue;
    const key = normalize(model.id);
    if (!index.has(key)) index.set(key, model);
  }
  return index;
}

/**
 * Lazily loads and indexes pi-ai's shipped catalogs. Import failures are not fatal:
 * the family defaults still give a model the right level set.
 */
export class LevelCatalog {
  constructor({ providers = CATALOG_PROVIDERS } = {}) {
    this.providers = providers;
    this.index = undefined;
    this.loading = undefined;
    this.byFamily = new Map();
  }

  async load() {
    if (this.index) return this.index;
    this.loading ??= (async () => {
      const index = new Map();
      for (const name of this.providers) {
        try {
          const mod = await import(`@earendil-works/pi-ai/providers/${name}.models`);
          for (const value of Object.values(mod)) {
            const models = indexCatalog(value);
            for (const [key, model] of models) if (!index.has(key)) index.set(key, model);
          }
        } catch { /* that provider catalog is absent in this pi-ai build */ }
      }
      this.index = index;
      return index;
    })();
    return this.loading;
  }

  familyOf(id) {
    const key = normalize(id);
    for (const [re, provider] of FAMILY_RULES) if (re.test(key)) return provider;
    return undefined;
  }

  /**
   * pi-ai's own entry for this id: exact, then progressively shorter prefixes so a
   * relay variant (`claude-opus-5-5`, `claude-sonnet-5-5-high`) lands on its base model.
   */
  async find(id) {
    const index = await this.load();
    const key = normalize(id);
    const exact = index.get(key);
    if (exact) return { model: exact, match: 'exact' };
    const parts = key.split('-');
    for (let n = parts.length - 1; n >= 2; n--) {
      const hit = index.get(parts.slice(0, n).join('-'));
      if (hit) return { model: hit, match: 'prefix' };
    }
    return undefined;
  }

  /** Family default map, or `undefined` when the family keeps the pi-ai default. */
  familyDefault(id) {
    const key = normalize(id);
    if (this.byFamily.has(key)) return this.byFamily.get(key);
    let map;
    for (const [re, value] of FAMILY_DEFAULTS) if (re.test(key)) { map = value; break; }
    this.byFamily.set(key, map);
    return map;
  }
}

/**
 * Levels a map exposes, in pi-ai display order. `off`/`minimal`/`low`/`medium`/`high`
 * are shown unless explicitly `null`; `xhigh`/`max` only when mapped.
 */
export function levelsFromMap(map) {
  if (!map) return ['off', 'minimal', 'low', 'medium', 'high'];
  const names = LEVELS.filter((level) => {
    const mapped = map[level];
    if (mapped === null) return false;
    if (level === 'xhigh' || level === 'max') return mapped !== undefined;
    return true;
  });
  // A custom level exists only when it is mapped to something the upstream accepts.
  for (const [level, mapped] of Object.entries(map)) {
    if (LEVELS.includes(level)) continue;
    if (typeof mapped === 'string' && CUSTOM_LEVEL.test(level)) names.push(level);
  }
  return orderLevels(names);
}

/** Build a pi-ai map that exposes exactly `levels`, keeping `base`'s upstream strings. */
export function mapFromLevels(levels, base) {
  if (!Array.isArray(levels) || levels.length === 0) return undefined;
  const allowed = new Set(levels);
  const map = {};
  for (const level of LEVELS) {
    if (!allowed.has(level)) { map[level] = null; continue; }
    const mapped = base?.[level];
    map[level] = typeof mapped === 'string' ? mapped : level;
  }
  return map;
}

/**
 * Resolve one model's reasoning levels.
 *
 * @returns `{ levels, map, source }` where `source` is `override` (user),
 * `catalog` (pi-ai shipped data), `family` (vendor default) or `default`.
 */
export async function resolveReasoningLevels({ id, override, overrideMap, catalog }) {
  const found = await catalog.find(id);
  const base = found?.model?.thinkingLevelMap ?? catalog.familyDefault(id);
  const source = found?.model?.thinkingLevelMap
    ? 'catalog'
    : base ? 'family' : 'default';
  // An explicit level→wire map is authoritative: it is literally what the user configured.
  if (overrideMap && typeof overrideMap === 'object' && Object.keys(overrideMap).length) {
    // The table is authoritative: preset levels not listed are hidden, and custom names
    // are honoured as long as they carry a wire value.
    const map = {};
    for (const level of LEVELS) {
      const mapped = overrideMap[level];
      map[level] = typeof mapped === 'string' ? mapped : null;
    }
    for (const [level, mapped] of Object.entries(overrideMap)) {
      if (LEVELS.includes(level) || !CUSTOM_LEVEL.test(level)) continue;
      if (typeof mapped === 'string') map[level] = mapped;
    }
    const levels = levelsFromMap(map);
    // A table that exposes nothing usable is a mistake, not an empty selector: fall back.
    if (levels.length) return { levels, map, source: 'override' };
  }
  if (Array.isArray(override) && override.length) {
    return { levels: override.filter((l) => LEVELS.includes(l)), map: mapFromLevels(override, base), source: 'override' };
  }
  return { levels: levelsFromMap(base), map: base ?? undefined, source };
}
