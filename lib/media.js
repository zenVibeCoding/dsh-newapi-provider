/**
 * Image and video generation through the New API gateway.
 *
 * Images: POST /v1/images/generations and /v1/images/edits. New API answers
 * synchronously (it polls async vendors inside the request for up to 600 s),
 * so the tool waits with a long timeout. Results are saved as DSH image
 * attachments so the model and the chat both see them.
 *
 * Videos: New API's unified OpenAI Video protocol
 *   POST /v1/videos                 submit (JSON, `model` picks the vendor)
 *   GET  /v1/videos/{id}            status / progress
 *   GET  /v1/videos/{id}/content    finished bytes, proxied by the gateway
 * The tool returns as soon as the task is accepted; a host poller follows the
 * task, saves the file as a DSH attachment and wakes the agent through a
 * background job. Tasks are written to disk, so polling resumes after a
 * restart.
 *
 * Paid submissions are never retried automatically. A submission whose outcome
 * is unknown (timeout after sending) is recorded as `submit-unknown` and
 * reported to the model instead of being sent again.
 */
import fs from 'node:fs';
import { mediaModels, upstreamModelOf } from './catalog.js';
import { registerAsyncEffect } from './channels.js';
import { fetchJson, gatewayRoot, GatewayError, readCache, writeCache } from './util.js';

const IMAGE_TIMEOUT_MS = 11 * 60 * 1000;
const VIDEO_SUBMIT_TIMEOUT_MS = 120_000;
const POLL_BASE_MS = 8_000;
const POLL_MAX_MS = 60_000;
const VIDEO_GIVE_UP_MS = 6 * 60 * 60 * 1000;
const TASKS_FILE = 'video-tasks.json';
const HISTORY_FILE = 'media-history.json';
const HISTORY_LIMIT = 200;

const IMAGE_SIZES = ['auto', '1024x1024', '1536x1024', '1024x1536', '1792x1024', '1024x1792', '512x512', '256x256'];

function sniffImage(bytes) {
  const b = bytes;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  return undefined;
}

function extOfVideo(contentType) {
  if (/webm/i.test(contentType ?? '')) return 'webm';
  if (/quicktime/i.test(contentType ?? '')) return 'mov';
  return 'mp4';
}

async function downloadBytes(url, { apiKey, headers = {}, signal, timeoutMs = 120_000, maxBytes = 512 * 1024 * 1024 } = {}) {
  const requestSignal = AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]);
  const originalOrigin = new URL(url).origin;
  let res;
  for (let redirects = 0; ; redirects++) {
    res = await fetch(url, {
      redirect: 'manual', signal: requestSignal,
      headers: new URL(url).origin === originalOrigin ? { ...headers, ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) } : {},
    });
    if (res.status < 300 || res.status >= 400) break;
    await res.body?.cancel();
    const location = res.headers.get('location');
    if (!location || redirects >= 5) throw new GatewayError('download redirect limit or missing location', 'REDIRECT');
    url = new URL(location, url).href;
  }
  if (!res.ok) throw new GatewayError(`download failed: HTTP ${res.status}`, res.status === 401 || res.status === 403 ? 'AUTH' : 'HTTP', { status: res.status });
  const len = Number(res.headers.get('content-length'));
  if (Number.isFinite(len) && len > maxBytes) throw new GatewayError(`file larger than ${maxBytes} bytes`, 'TOO_LARGE');
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) throw new GatewayError(`file larger than ${maxBytes} bytes`, 'TOO_LARGE');
  return { bytes: buf, contentType: res.headers.get('content-type') ?? '' };
}

/** Normalize the many status words vendors use into four states. */
export function normalizeStatus(raw) {
  const s = String(raw ?? '').toLowerCase();
  if (['completed', 'succeeded', 'success', 'done', 'finished'].includes(s)) return 'completed';
  if (['failed', 'failure', 'error', 'cancelled', 'canceled', 'expired', 'rejected'].includes(s)) return 'failed';
  if (['queued', 'pending', 'submitted', 'not_start', 'not_started', 'waiting'].includes(s)) return 'queued';
  return 'in_progress';
}

function pickModel(catalog, kind, requested) {
  const candidates = mediaModels(catalog, kind);
  if (requested) {
    const exact = candidates.find((m) => m.id === requested) ?? catalog.entries.find((m) => m.id === requested && !m.hidden);
    if (!exact) {
      const names = candidates.map((m) => m.id).join(', ') || '(none)';
      throw new GatewayError(`model "${requested}" is not a ${kind} model on this gateway; available ${kind} models: ${names}`, 'UNKNOWN_MODEL');
    }
    return exact;
  }
  if (candidates.length === 0) {
    throw new GatewayError(`the gateway lists no ${kind} model; add a ${kind} channel in New API, or mark a model with kind "${kind}" in this plugin's settings`, 'NO_MODEL');
  }
  return candidates[0];
}

class TaskStore {
  constructor() {
    const loaded = readCache(TASKS_FILE);
    this.tasks = new Map(Object.entries(loaded?.tasks ?? {}));
  }
  get(id) { return this.tasks.get(id); }
  all() { return [...this.tasks.values()]; }
  put(task) {
    this.tasks.set(task.localId, task);
    this.flush();
    return task;
  }
  flush() {
    writeCache(TASKS_FILE, { version: 1, tasks: Object.fromEntries(this.tasks) });
  }
}

class History {
  constructor() {
    this.items = readCache(HISTORY_FILE)?.items ?? [];
  }
  add(item) {
    this.items.unshift(item);
    if (this.items.length > HISTORY_LIMIT) this.items.length = HISTORY_LIMIT;
    writeCache(HISTORY_FILE, { version: 1, items: this.items });
  }
}

export function registerMedia(ctx, host) {
  const { reportError } = host;
  // Support callers of the former single-channel interface without global URL reads.
  const capture = host.capture ?? (() => ({
    connection: { channelId: 'default', apiKeyName: 'NEWAPI_API_KEY', ...host.connection() },
    requireApiKey: host.requireApiKey, catalog: host.catalog,
  }));
  const captureTask = host.captureTask ?? ((task) => {
    const bound = capture();
    if (!task.origin || gatewayRoot(bound.connection.baseURL) !== task.origin.baseURL) throw new Error('video origin unavailable');
    return bound;
  });
  const lifetime = new AbortController();
  const activeSignal = (signal) => AbortSignal.any([lifetime.signal, ...(signal ? [signal] : [])]);
  const ensureActive = () => lifetime.signal.throwIfAborted();
  const tasks = new TaskStore();
  const putTask = (task) => { ensureActive(); return tasks.put(task); };
  const history = new History();
  const pollers = new Map();
  const polling = new Map();
  const jobWaiters = new Map();
  let stopped = false;
  ctx.effect(() => () => {
    stopped = true;
    lifetime.abort(new Error("media plugin unloaded"));
    for (const t of pollers.values()) clearTimeout(t);
    pollers.clear();
    for (const waiter of jobWaiters.values()) waiter.resolve({ status: 'killed', detail: 'plugin unloaded; gateway task remains tracked' });
    jobWaiters.clear();
  });

  const sameGateway = (url, root) => {
    try { const target = new URL(url); const base = new URL(`${root}/`); return target.origin === base.origin && target.pathname.startsWith(base.pathname); }
    catch { return false; }
  };

  // ---------------------------------------------------------------- images

  async function generateImages(args, signal) {
    signal = activeSignal(signal);
    ensureActive();
    const bound = capture();
    const root = gatewayRoot(bound.connection.baseURL);
    const apiKey = await bound.requireApiKey();
    const cat = await bound.catalog({ signal });
    const entry = pickModel(cat, 'image', args.model);
    const model = entry.id, upstreamModel = upstreamModelOf(entry);
    const n = Math.min(Math.max(Number(args.n) || 1, 1), 4);
    const body = {
      model: upstreamModel,
      prompt: String(args.prompt),
      n,
      ...(args.size && args.size !== 'auto' ? { size: args.size } : {}),
      ...(args.quality ? { quality: args.quality } : {}),
      ...(args.background ? { background: args.background } : {}),
    };
    let response;
    const started = Date.now();
    ensureActive();
    try {
    if (args.images?.length) {
      const form = new FormData();
      for (const [k, v] of Object.entries(body)) form.append(k, String(v));
      for (const [i, img] of args.images.entries()) {
        form.append(args.images.length > 1 ? 'image[]' : 'image', new Blob([img.data], { type: img.mediaType }), img.name ?? `input-${i}.png`);
      }
      response = await fetchJson(`${root}/v1/images/edits`, { apiKey, headers: bound.connection.headers, method: 'POST', body: form, timeoutMs: IMAGE_TIMEOUT_MS, signal, maxBytes: 256 * 1024 * 1024 });
    } else {
      response = await fetchJson(`${root}/v1/images/generations`, { apiKey, headers: bound.connection.headers, method: 'POST', body, timeoutMs: IMAGE_TIMEOUT_MS, signal, maxBytes: 256 * 1024 * 1024 });
    }
    const items = Array.isArray(response?.data) ? response.data : [];
    if (items.length === 0) throw new GatewayError('the gateway returned no images', 'EMPTY_RESPONSE');
    const attachments = ctx.get('attachments');
    if (!attachments) throw new GatewayError('the DSH attachment service is unavailable', 'NO_ATTACHMENTS');
    const saved = [];
    for (const [i, item] of items.entries()) {
      let bytes;
      if (item.b64_json) bytes = new Uint8Array(Buffer.from(item.b64_json, 'base64'));
      else if (item.url) bytes = (await downloadBytes(item.url, { apiKey: sameGateway(item.url, root) ? apiKey : undefined, headers: sameGateway(item.url, root) ? bound.connection.headers : {}, signal })).bytes;
      else continue;
      const mediaType = sniffImage(bytes);
      if (!mediaType) throw new GatewayError('the gateway returned an image in an unsupported format', 'BAD_RESPONSE');
      ensureActive();
      const ref = await attachments.saveImage({ data: bytes, mediaType, name: `newapi-${model}-${Date.now()}-${i}.${mediaType.split('/')[1]}` });
      saved.push({ ref, revisedPrompt: item.revised_prompt ?? null });
    }
    const result = {
      model, upstreamModel,
      prompt: body.prompt,
      size: body.size ?? 'auto',
      elapsedMs: Date.now() - started,
      images: saved.map((s) => s.ref),
      revisedPrompts: saved.map((s) => s.revisedPrompt).filter(Boolean),
      usage: response.usage ?? null,
    };
    ensureActive();
    history.add({ type: 'image', at: Date.now(), model, upstreamModel, prompt: body.prompt, images: result.images });
    // Tool values must be lossless JSON (no undefined, no class instances).
    return JSON.parse(JSON.stringify(result));
    } catch (error) {
      error.mayBeBilled = true;
      throw error;
    }
  }

  /**
   * Read input images from paths the model names. Relative paths resolve
   * against the session's working directory; reads go through the DSH
   * filesystem service so its sandbox policy applies.
   */
  async function readInputImages(paths, exec) {
    if (!paths?.length) return [];
    const fsService = ctx.get('fs');
    const wd = ctx.get('workingDirectory');
    let cwd;
    try { cwd = exec.agent && wd ? await wd.ensure(exec.agent, exec.signal) : undefined; } catch { cwd = undefined; }
    const out = [];
    for (const p of paths.slice(0, 4)) {
      let data;
      if (fsService) {
        const target = await fsService.resolve(String(p), { cwd, signal: exec.signal });
        data = await fsService.readBytes(target, exec.signal, 25 * 1024 * 1024);
      } else {
        data = new Uint8Array(fs.readFileSync(String(p)));
      }
      const mediaType = sniffImage(data);
      if (!mediaType) throw new GatewayError(`${p} is not a PNG, JPEG, WebP or GIF image`, 'INVALID_REQUEST');
      out.push({ data, mediaType, name: String(p).split('/').pop() });
    }
    return out;
  }

  ctx.inject(['tools'], (tctx) => {
    registerAsyncEffect(tctx, () => tctx.tools.register({
      name: 'newapi_image_generate',
      description: [
        'Generate or edit images with an image model on the New API gateway (for example gpt-image, DALL·E, Flux, Seedream, Imagen).',
        'Returns the images as attachments you can see. Generation can take up to several minutes and is billed per call: do not call again just because it is slow, and do not retry a failed call without telling the user.',
        'To edit or use reference images, pass `inputImages` with file paths (relative to the working directory or absolute); images the user attached in chat must first exist as files.',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'What to draw, or how to change the input images.' },
          model: { type: 'string', description: 'Local image model id from newapi_models. Omit to use the first image model; upstream mapping applies automatically.' },
          size: { type: 'string', enum: IMAGE_SIZES, description: 'Output size; omit or "auto" for the model default.' },
          n: { type: 'integer', minimum: 1, maximum: 4, description: 'Number of images (1-4).' },
          quality: { type: 'string', description: 'Optional quality hint understood by the model (for example low, medium, high, hd).' },
          background: { type: 'string', enum: ['auto', 'transparent', 'opaque'], description: 'Background handling for models that support it.' },
          inputImages: { type: 'array', items: { type: 'string' }, maxItems: 4, description: 'Image files to edit or use as references (PNG, JPEG, WebP or GIF). Uses /v1/images/edits.' },
        },
        required: ['prompt'],
        additionalProperties: false,
      },
      timeoutMs: IMAGE_TIMEOUT_MS + 60_000,
      output: {
        schema: {
          type: 'object',
          properties: {
            model: { type: 'string' }, upstreamModel: { type: 'string' },
            prompt: { type: 'string' },
            size: { type: 'string' },
            elapsedMs: { type: 'number' },
            images: { type: 'array' },
            revisedPrompts: { type: 'array', items: { type: 'string' } },
          },
        },
        render(_args, value) {
          const lines = [`Generated ${value.images.length} image(s) with ${value.model} in ${Math.round(value.elapsedMs / 1000)} s.`];
          if (value.revisedPrompts?.length) lines.push(`Revised prompt: ${value.revisedPrompts[0]}`);
          return [{ type: 'text', text: lines.join('\n') }, ...value.images.map((attachment) => ({ type: 'image', attachment }))];
        },
        presentationMeta(_args, value) {
          return { model: value.model, size: value.size, elapsedMs: value.elapsedMs, count: value.images.length };
        },
      },
      async execute(args, exec) {
        try {
          const images = await readInputImages(args.inputImages, exec);
          return await generateImages({ ...args, images }, exec.signal);
        } catch (error) {
          reportError('image', error);
          const paid = error.mayBeBilled ? ' The gateway may still finish and bill this request; check before retrying.' : '';
          throw new Error(`${error.message}${paid}`);
        }
      },
    }));

    // -------------------------------------------------------------- videos

    registerAsyncEffect(tctx, () => tctx.tools.register({
      name: 'newapi_video_generate',
      description: [
        'Start a video generation task with a video model on the New API gateway (for example Sora, Veo, Kling, Seedance, Hailuo, Vidu, Jimeng).',
        'Returns immediately with a task id; the video is produced in the background (often several minutes) and you are notified when it finishes, with the video saved as an attachment.',
        'Billed per task: never submit the same request twice. Use newapi_video_status to check progress instead of resubmitting.',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Description of the video.' },
          model: { type: 'string', description: 'Local video model id from newapi_models. Omit to use the first video model; upstream mapping applies automatically.' },
          seconds: { type: 'integer', minimum: 1, maximum: 60, description: 'Duration in seconds, if the model supports it.' },
          size: { type: 'string', description: 'Resolution such as 1280x720 or 720x1280, if the model supports it.' },
          firstFrame: { type: 'string', description: 'Image file to use as the first frame / reference (image-to-video), if the model supports it.' },
        },
        required: ['prompt'],
        additionalProperties: false,
      },
      timeoutMs: VIDEO_SUBMIT_TIMEOUT_MS + 30_000,
      output: {
        schema: { type: 'object', properties: { taskId: { type: 'string' }, model: { type: 'string' }, upstreamModel: { type: 'string' }, status: { type: 'string' }, jobId: { oneOf: [{ type: 'string' }, { type: 'null' }] } } },
        render(_args, value) {
          return [{ type: 'text', text: `Video task ${value.taskId} submitted to ${value.model} (status: ${value.status}). It runs in the background; you will be notified when it finishes${value.jobId ? ` (job ${value.jobId})` : ''}. Do not resubmit.` }];
        },
      },
      async execute(args, exec) {
        try {
          return await submitVideo(args, exec);
        } catch (error) {
          reportError('video', error);
          throw new Error(error.message);
        }
      },
    }));

    registerAsyncEffect(tctx, () => tctx.tools.register({
      name: 'newapi_video_status',
      description: 'Check video tasks started with newapi_video_generate. Without taskId, lists recent tasks. A finished task includes the saved video attachment.',
      parameters: {
        type: 'object',
        properties: { taskId: { type: 'string', description: 'Task id returned by newapi_video_generate.' } },
        additionalProperties: false,
      },
      isConcurrencySafe: () => true,
      output: {
        schema: { type: 'object', properties: { tasks: { type: 'array' } } },
        render(_args, value) {
          const blocks = [{ type: 'text', text: JSON.stringify(value.tasks.map(publicTask), null, 1) }];
          for (const t of value.tasks) if (t.file) blocks.push({ type: 'file', attachment: t.file });
          return blocks;
        },
      },
      async execute(args) {
        const list = args.taskId ? [tasks.get(args.taskId)].filter(Boolean) : tasks.all().sort((a, b) => b.createdAt - a.createdAt).slice(0, 10);
        if (args.taskId && list.length === 0) throw new Error(`unknown video task ${args.taskId}`);
        for (const t of list) if (!isTerminal(t)) await pollOnce(t.localId).catch(() => {});
        return JSON.parse(JSON.stringify({ tasks: list.map((t) => tasks.get(t.localId)) }));
      },
    }));
  });

  function publicTask(t) {
    return {
      taskId: t.localId,
      model: t.model,
      upstreamModel: t.upstreamModel ?? t.model,
      channelId: t.origin?.channelId ?? null,
      status: t.status,
      remoteId: t.remoteId ?? null,
      downloadDeadline: t.downloadDeadline ?? null,
      lastPollError: t.lastPollError ?? null,
      progress: t.progress ?? null,
      error: t.error ?? null,
      createdAt: new Date(t.createdAt).toISOString(),
      finishedAt: t.finishedAt ? new Date(t.finishedAt).toISOString() : null,
      file: t.file ? { name: t.file.name, bytes: t.file.bytes } : null,
    };
  }

  const isTerminal = (t) => ['completed', 'failed', 'submit-unknown', 'expired', 'download-failed'].includes(t.status);

  async function submitVideo(args, exec, captured) {
    exec = { ...exec, signal: activeSignal(exec.signal) };
    ensureActive();
    const bound = captured ?? capture(args.channelId);
    const conn = bound.connection;
    const root = gatewayRoot(conn.baseURL);
    const apiKey = await bound.requireApiKey();
    const cat = await bound.catalog({ signal: exec.signal });
    const entry = pickModel(cat, 'video', args.model);
    const model = entry.id, upstreamModel = upstreamModelOf(entry);
    const firstFrames = args.firstFrame ? await readInputImages([args.firstFrame], exec) : [];
    ensureActive();
    const localId = `nv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const task = putTask({
      localId,
      remoteId: null,
      origin: { channelId: conn.channelId, baseURL: root, keyName: conn.apiKeyName },
      model, upstreamModel,
      prompt: String(args.prompt),
      status: 'submitting',
      createdAt: Date.now(),
      owner: exec.agent?.id ?? null,
      callId: exec.callId,
      attempts: 0,
    });

    let response;
    try {
      const fields = {
        model: upstreamModel,
        prompt: task.prompt,
        ...(args.seconds ? { seconds: String(args.seconds) } : {}),
        ...(args.size ? { size: args.size } : {}),
      };
      if (firstFrames.length) {
        const [img] = firstFrames;
        const form = new FormData();
        for (const [k, v] of Object.entries(fields)) form.append(k, v);
        form.append('input_reference', new Blob([img.data], { type: img.mediaType }), img.name ?? 'first-frame.png');
        response = await fetchJson(`${root}/v1/videos`, { apiKey, headers: bound.connection.headers, method: 'POST', body: form, timeoutMs: VIDEO_SUBMIT_TIMEOUT_MS, signal: exec.signal });
      } else {
        response = await fetchJson(`${root}/v1/videos`, { apiKey, headers: bound.connection.headers, method: 'POST', body: fields, timeoutMs: VIDEO_SUBMIT_TIMEOUT_MS, signal: exec.signal });
      }
    } catch (error) {
      // A timeout or dropped connection after the request was sent may still
      // have created a billed task upstream; never resend automatically.
      const unknown = ['TIMEOUT', 'UNREACHABLE', 'BAD_RESPONSE', 'TOO_LARGE'].includes(error.code);
      putTask({ ...task, status: unknown ? 'submit-unknown' : 'failed', error: error.message, finishedAt: Date.now() });
      throw new GatewayError(
        unknown
          ? `${error.message}. The gateway may have accepted and billed this task; check the New API task log before submitting again.`
          : error.message,
        error.code,
      );
    }
    const remoteId = response?.id ?? response?.task_id ?? response?.data?.id ?? response?.data?.task_id;
    if (!remoteId) {
      putTask({ ...task, status: 'submit-unknown', error: 'gateway response carried no task id', finishedAt: Date.now() });
      throw new GatewayError('the gateway accepted the request but returned no task id; check the New API task log before submitting again', 'BAD_RESPONSE');
    }
    const accepted = putTask({
      ...task,
      remoteId: String(remoteId),
      status: normalizeStatus(response.status ?? 'queued') === 'completed' ? 'download-pending' : normalizeStatus(response.status ?? 'queued'),
      ...(normalizeStatus(response.status) === 'completed' ? { downloadDeadline: Date.now() + VIDEO_GIVE_UP_MS, statusDoc: response } : {}),
      progress: response.progress ?? null,
    });
    const jobId = startJob(accepted, exec);
    putTask({ ...tasks.get(localId), jobId });
    schedulePoll(localId, POLL_BASE_MS);
    history.add({ type: 'video-task', at: Date.now(), model, upstreamModel, prompt: task.prompt, taskId: localId });
    return JSON.parse(JSON.stringify({ taskId: localId, model, upstreamModel, status: accepted.status, jobId: jobId ?? null }));
  }

  /** A background job carries progress to the jobs panel and wakes the agent on completion. */
  function startJob(task, exec) {
    const jobs = ctx.get('jobs');
    if (!jobs || !exec?.agent?.id) return undefined;
    try {
      return jobs.start({
        kind: 'newapi-video',
        label: `New API video · ${task.model} · ${task.prompt.slice(0, 40)}`,
        owner: exec.agent.id,
        toolCall: { callId: exec.callId, rootCallId: exec.rootCallId ?? exec.callId },
        run(handle) {
          let resolve;
          const done = new Promise((r) => { resolve = r; });
          jobWaiters.set(task.localId, { handle, resolve });
          handle.updateProgress(`${task.status}`);
          return {
            cancel(reason) {
              jobWaiters.delete(task.localId);
              resolve({ status: 'killed', detail: `${reason ?? 'cancelled'}; the gateway task ${task.remoteId} may keep running and is still tracked by newapi_video_status` });
            },
            done,
          };
        },
      });
    } catch (error) {
      ctx.logger.warn(`newapi-provider: could not start a background job for video task ${task.localId}: ${error.message}`);
      return undefined;
    }
  }

  function settleJob(task) {
    const waiter = jobWaiters.get(task.localId);
    if (!waiter) return;
    jobWaiters.delete(task.localId);
    if (task.status === 'completed') {
      waiter.handle.append(`video saved: ${task.file?.name} (${task.file?.bytes} bytes)\n`);
      waiter.resolve({ status: 'completed', result: JSON.stringify({ taskId: task.localId, model: task.model, upstreamModel: task.upstreamModel ?? task.model, file: task.file, hostPath: task.hostPath ?? null, note: 'Call newapi_video_status with this taskId to attach the video to the conversation.' }) });
    } else {
      waiter.resolve({ status: 'failed', detail: task.error ?? task.status, result: JSON.stringify({ taskId: task.localId, status: task.status, error: task.error ?? null }) });
    }
  }

  function schedulePoll(localId, delay) {
    if (stopped) return;
    clearTimeout(pollers.get(localId));
    pollers.set(localId, setTimeout(() => {
      pollers.delete(localId);
      pollOnce(localId)
        .then((t) => {
          if (t && !isTerminal(t)) schedulePoll(localId, Math.min(POLL_MAX_MS, POLL_BASE_MS * 2 ** Math.min(t.attempts ?? 0, 3)));
        })
        .catch((error) => {
          const t = tasks.get(localId);
          if (!t || stopped) return;
          const wait = error.code === 'RATE_LIMIT' ? (error.retryAfterMs ?? POLL_MAX_MS) : POLL_MAX_MS;
          ctx.logger.warn(`newapi-provider: polling video task ${localId} failed: ${error.message}`);
          putTask({ ...t, lastPollError: error.message });
          schedulePoll(localId, wait);
        });
    }, delay));
  }

  function pollOnce(localId) {
    if (stopped) return Promise.resolve(tasks.get(localId));
    if (polling.has(localId)) return polling.get(localId);
    const pending = pollTask(localId).finally(() => polling.delete(localId));
    polling.set(localId, pending);
    return pending;
  }

  async function pollTask(localId) {
    const t = tasks.get(localId);
    if (!t || isTerminal(t) || !t.remoteId) return t;
    const downloading = t.status === 'download-pending';
    if (Date.now() >= (downloading ? t.downloadDeadline ?? t.createdAt + VIDEO_GIVE_UP_MS : t.createdAt + VIDEO_GIVE_UP_MS)) {
      const expired = putTask({ ...t, status: downloading ? 'download-failed' : 'expired', error: downloading ? 'video completed; download recovery deadline exceeded; do not resubmit' : 'gave up waiting after 6 hours', finishedAt: Date.now() });
      settleJob(expired);
      return expired;
    }
    const bound = captureTask(t);
    const root = gatewayRoot(bound.connection.baseURL);
    const apiKey = await bound.requireApiKey();
    ensureActive();
    // Re-read result URLs on recovery: signed links may expire; never persist the raw status document.
    const r = await fetchJson(`${root}/v1/videos/${encodeURIComponent(t.remoteId)}`, { apiKey, headers: bound.connection.headers, timeoutMs: 30_000, signal: lifetime.signal });
    ensureActive();
    const status = downloading ? 'completed' : normalizeStatus(r.status);
    const progress = r.progress ?? t.progress ?? null;
    let next = { ...t, status, progress, attempts: (t.attempts ?? 0) + 1, lastPollAt: Date.now(), lastPollError: null };
    jobWaiters.get(localId)?.handle.updateProgress(progress != null ? `${status} ${progress}%` : status);
    if (status === 'failed') {
      next = putTask({ ...next, error: r.error?.message ?? r.fail_reason ?? r.message ?? 'the vendor reported a failure', finishedAt: Date.now() });
      settleJob(next);
      return next;
    }
    if (status === 'completed') {
      next = putTask({ ...next, status: 'download-pending', statusDoc: null, downloadDeadline: t.downloadDeadline ?? Date.now() + VIDEO_GIVE_UP_MS });
      next = await saveVideo(next, r, apiKey, root, bound.connection.headers);
      putTask(next);
      if (isTerminal(next)) settleJob(next);
      return next;
    }
    return putTask(next);
  }

  async function saveVideo(task, statusDoc, apiKey, root, headers) {
    const attachments = ctx.get('attachments');
    const candidates = [
      `${root}/v1/videos/${encodeURIComponent(task.remoteId)}/content`,
      statusDoc.url, statusDoc.video_url, statusDoc.output?.url, statusDoc.data?.url,
    ].filter(Boolean);
    let lastError;
    for (const url of candidates) {
      try {
        const { bytes, contentType } = await downloadBytes(url, { apiKey: sameGateway(url, root) ? apiKey : undefined, headers: sameGateway(url, root) ? headers : {}, signal: lifetime.signal, timeoutMs: Math.max(1, Math.min(10 * 60 * 1000, task.downloadDeadline - Date.now())) });
        ensureActive();
        if (bytes.byteLength < 1024) throw new GatewayError('downloaded video is unexpectedly small', 'BAD_RESPONSE');
        const ext = extOfVideo(contentType);
        const file = await attachments.saveFile({ data: bytes, name: `newapi-${task.model}-${task.localId}.${ext}` });
        ensureActive();
        const hostPath = attachments.fileHostPath?.(file);
        history.add({ type: 'video', at: Date.now(), model: task.model, upstreamModel: task.upstreamModel ?? task.model, prompt: task.prompt, taskId: task.localId, file });
        return { ...task, status: 'completed', error: null, statusDoc: null, file, hostPath: hostPath ?? null, finishedAt: Date.now() };
      } catch (error) {
        ensureActive();
        lastError = error;
      }
    }
    return { ...task, status: 'download-pending', error: `video finished but could not be downloaded: ${lastError?.message ?? 'no URL'}; retrying GET only, do not resubmit` };
  }

  // Resume tasks that were still running when DSH last stopped.
  for (const t of tasks.all()) {
    if (t.status === 'submitting') putTask({ ...t, status: 'submit-unknown', error: 'DSH stopped while submitting; check the New API task log', finishedAt: Date.now() });
    else if (!isTerminal(t) && t.remoteId) schedulePoll(t.localId, 3_000);
  }

  // --------------------------------------------------------------- web API

  async function serveAttachment(res, kind, id) {
    const attachments = ctx.get('attachments');
    const items = history.items;
    const ref = kind === 'image'
      ? items.flatMap((i) => i.images ?? []).find((r) => r.attachmentId === id)
      : items.map((i) => i.file).filter(Boolean).find((r) => r.attachmentId === id)
        ?? tasks.all().map((t) => t.file).filter(Boolean).find((r) => r.attachmentId === id);
    if (!ref) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    const filePath = kind === 'image' ? attachments.imageHostPath(ref) : attachments.fileHostPath(ref);
    if (!filePath || !fs.existsSync(filePath)) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    const type = kind === 'image' ? ref.mediaType : (/\.webm$/i.test(ref.name) ? 'video/webm' : /\.mov$/i.test(ref.name) ? 'video/quicktime' : 'video/mp4');
    res.statusCode = 200;
    res.setHeader('content-type', type);
    res.setHeader('cache-control', 'private, max-age=86400');
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (res.headersSent) res.destroy();
      else { res.statusCode = 500; res.end('media file unavailable'); }
    });
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  }

  return {
    /** Billed settings-page test: one short video task on a fixed channel, tracked like any other. */
    async submitTestVideo(channelId, model, captured) {
      const value = await submitVideo(
        { channelId, model, prompt: 'A red ball slowly rolls across a white table.', seconds: 4 },
        { signal: AbortSignal.timeout(VIDEO_SUBMIT_TIMEOUT_MS + 10_000), callId: `settings-test-${Date.now()}` },
        captured,
      );
      return { taskId: value.taskId };
    },
    status() {
      return {
        tasks: tasks.all().sort((a, b) => b.createdAt - a.createdAt).slice(0, 20).map(publicTask),
        history: history.items.slice(0, 60).map((i) => ({
          type: i.type,
          at: i.at,
          model: i.model,
          upstreamModel: i.upstreamModel ?? i.model,
          prompt: i.prompt,
          taskId: i.taskId ?? null,
          images: (i.images ?? []).map((r) => ({ id: r.attachmentId, width: r.width, height: r.height })),
          file: i.file ? { id: i.file.attachmentId, name: i.file.name, bytes: i.file.bytes } : null,
        })),
      };
    },
    async handle(req, res, url) {
      const m = url.pathname.match(/^\/newapi-provider\/api\/media\/(image|video)\/([A-Za-z0-9_.-]+)$/);
      if (req.method === 'GET' && m) {
        await serveAttachment(res, m[1], m[2]);
        return true;
      }
      return false;
    },
  };
}
