import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { taskChannel } from '../lib/channels.js';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'newapi-channel-media-'));
process.env.DSH_HOME = home;
const { registerMedia } = await import('../lib/media.js');

function context(asyncRegistration = false) {
  const tools = new Map(), disposers = [], files = [];
  const ctx = {
    logger: { warn() {}, error() {} },
    effect(fn) { const dispose = fn(); if (dispose) disposers.push(dispose); },
    inject(_deps, fn) { fn({ effect: (effect) => ctx.effect(effect), tools: { register(def) { tools.set(def.name, def); const dispose = () => tools.delete(def.name); return asyncRegistration ? Promise.resolve(dispose) : dispose; } } }); },
    get(name) { return name === 'attachments' ? { saveFile: async (input) => { const ref = { attachmentId: 'video', bytes: input.data.length, name: input.name }; files.push(ref); return ref; }, fileHostPath: () => undefined } : undefined; },
  };
  return { ctx, tools, files, dispose: async () => { await Promise.all(disposers.splice(0).map((d) => d())); } };
}

test('video submit, restart, polling and content download stay on originating channel after switch', async (t) => {
  const original = globalThis.fetch;
  const calls = [];
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => {
    calls.push({ url, method: options.method ?? 'GET', key: options.headers.authorization });
    assert.ok(url.startsWith('https://a.example/'), 'must never contact active channel B');
    assert.equal(options.headers.authorization, 'Bearer key-a');
    if (options.method === 'POST') return Response.json({ id: 'remote-same-id', status: 'queued' });
    if (url.endsWith('/content')) return new Response(Buffer.alloc(2048, 1), { headers: { 'content-type': 'video/mp4' } });
    return Response.json({ id: 'remote-same-id', status: 'completed', progress: 100 });
  };
  const channels = [{ id: 'a', name: 'A', baseURL: 'https://a.example', apiKeyEnv: 'A' }, { id: 'b', name: 'B', baseURL: 'https://b.example', apiKeyEnv: 'B' }];
  let active = 'a';
  const bound = (ch) => ({
    connection: { channelId: ch.id, baseURL: ch.baseURL, apiKeyName: ch.apiKeyEnv },
    requireApiKey: async () => `key-${ch.id}`,
    catalog: async () => ({ entries: [{ id: 'sora-test', kind: 'video', hidden: false }] }),
  });
  const host = { capture: () => bound(channels.find((c) => c.id === active)), captureTask: (task) => bound(taskChannel(task, channels)), reportError() {} };
  const first = context(true);
  registerMedia(first.ctx, host);
  const accepted = await first.tools.get('newapi_video_generate').execute({ prompt: 'offline test' }, { callId: 'call', signal: AbortSignal.timeout(1000) });
  await first.dispose();
  assert.equal(first.tools.size, 0, 'async registration disposers are awaited');
  active = 'b';
  const resumed = context(); t.after(() => resumed.dispose());
  registerMedia(resumed.ctx, host);
  const status = await resumed.tools.get('newapi_video_status').execute({ taskId: accepted.taskId });
  assert.equal(status.tasks[0].status, 'completed');
  assert.equal(status.tasks[0].origin.channelId, 'a');
  assert.equal(status.tasks[0].origin.keyName, 'A');
  assert.equal(resumed.files.length, 1);
  assert.equal(calls.filter((c) => c.method === 'POST').length, 1);
  assert.equal(calls.length, 3);
});
