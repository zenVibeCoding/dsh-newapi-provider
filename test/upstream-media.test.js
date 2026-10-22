import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { taskChannel } from '../lib/channels.js';
process.env.DSH_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nas-upstream-media-'));
const { registerMedia } = await import('../lib/media.js');

function context() {
  const tools = new Map(), disposers = [];
  const ctx = {
    logger: { warn() {}, error() {} },
    effect(fn) { const d = fn(); if (d) disposers.push(d); },
    inject(_deps, fn) { fn({ effect: fn => ctx.effect(fn), tools: { register(def) { tools.set(def.name, def); return () => tools.delete(def.name); } } }); },
    get(name) {
      if (name === 'fs') return { resolve: async p => p, readBytes: async () => Buffer.from([0x89, 0x50, 0x4e, 0x47]) };
      if (name === 'attachments') return { saveImage: async input => ({ attachmentId: 'offline-image', bytes: input.data.length, mediaType: input.mediaType }), saveFile: async input => ({ attachmentId: 'offline-video', bytes: input.data.length, name: input.name }) };
    },
  };
  return { ctx, tools, dispose: async () => { for (const d of disposers.splice(0)) await d(); } };
}

test('mapped media JSON, image edits, video multipart and settings test; restart retains both ids and origin', async (t) => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  const calls = [];
  globalThis.fetch = async (url, options) => {
    assert.ok(url.startsWith('https://original.invalid/'));
    assert.equal(options.headers.authorization, 'Bearer fake-original');
    const body = options.body instanceof FormData ? Object.fromEntries(options.body) : options.body ? JSON.parse(options.body) : undefined;
    calls.push({ url, body });
    if (url.endsWith('/v1/videos') && options.method === 'POST') return Response.json({ id: `remote-task-${calls.length}`, status: 'queued' });
    if (url.includes('/v1/images/')) return Response.json({ data: [{ b64_json: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64') }] });
    if (url.endsWith('/content')) return new Response(Buffer.alloc(2048), { headers: { 'content-type': 'video/mp4' } });
    return Response.json({ status: 'completed' });
  };
  let active = 'original', videoTarget = 'remote-video';
  const channels = [{ id: 'original', baseURL: 'https://original.invalid', apiKeyEnv: 'ORIGINAL' }, { id: 'other', baseURL: 'https://other.invalid', apiKeyEnv: 'OTHER' }];
  const bound = ch => ({ connection: { channelId: ch.id, baseURL: ch.baseURL, apiKeyName: ch.apiKeyEnv }, requireApiKey: async () => `fake-${ch.id}`, catalog: async () => ({ entries: [{ id: 'image-alias', upstreamModel: 'remote-image', kind: 'image' }, { id: 'video-alias', upstreamModel: videoTarget, kind: 'video' }] }) });
  const host = { capture: () => bound(channels.find(ch => ch.id === active)), captureTask: task => bound(taskChannel(task, channels)), reportError() {} };
  const first = context(); const media = registerMedia(first.ctx, host); t.after(() => first.dispose());
  const exec = { signal: AbortSignal.timeout(10000), callId: 'offline' };
  for (const inputImages of [undefined, ['reference.png']]) {
    const result = await first.tools.get('newapi_image_generate').execute({ model: 'image-alias', prompt: 'offline', inputImages }, exec);
    assert.equal(result.model, 'image-alias'); assert.equal(result.upstreamModel, 'remote-image'); assert.equal(calls.at(-1).body.model, 'remote-image');
  }
  const tasks = [];
  for (const firstFrame of [undefined, 'frame.png']) {
    const result = await first.tools.get('newapi_video_generate').execute({ model: 'video-alias', prompt: 'offline', firstFrame }, exec);
    assert.equal(result.model, 'video-alias'); assert.equal(result.upstreamModel, 'remote-video'); assert.equal(calls.at(-1).body.model, 'remote-video'); tasks.push(result.taskId);
  }
  const tested = await media.submitTestVideo('original', 'video-alias', host.capture()); tasks.push(tested.taskId);
  assert.equal(calls.at(-1).body.model, 'remote-video');
  assert.equal(media.status().history[0].model, 'video-alias'); assert.equal(media.status().history[0].upstreamModel, 'remote-video');
  await first.dispose(); active = 'other'; videoTarget = 'changed-after-submit';
  const resumed = context(); registerMedia(resumed.ctx, host); t.after(() => resumed.dispose());
  for (const taskId of tasks) {
    const { tasks: [task] } = await resumed.tools.get('newapi_video_status').execute({ taskId });
    assert.equal(task.status, 'completed'); assert.equal(task.model, 'video-alias'); assert.equal(task.upstreamModel, 'remote-video');
    assert.equal(task.origin.channelId, 'original'); assert.equal(task.origin.keyName, 'ORIGINAL');
  }
  assert.equal(calls.filter(c => c.url.endsWith('/v1/videos')).length, 3, 'no resubmissions on restart');
});
