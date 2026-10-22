/**
 * Offline integration test for lib/media.js against a fake New API gateway.
 * No real gateway, no billing. Covers image generation, video submit →
 * background poll → download → attachment, restart recovery, and the
 * "never resubmit a paid task whose outcome is unknown" rule.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gradientPng } from './fixtures/png.js';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'newapi-studio-test-'));
process.env.DSH_HOME = home;
const { registerMedia } = await import('../lib/media.js');

const PNG = Buffer.from(gradientPng(64, 48));
const VIDEO = Buffer.alloc(4096, 7);

function fakeGateway() {
  const calls = [];
  const tasks = new Map();
  let polls = 0;
  let submitMode = 'ok';
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      calls.push({ method: req.method, url: req.url, auth: req.headers.authorization, type: req.headers['content-type'] ?? '' });
      const json = (status, v) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(v)); };
      if (req.headers.authorization !== 'Bearer sk-test') return json(401, { error: { message: 'bad key' } });
      if (req.method === 'POST' && req.url === '/v1/images/generations') {
        return json(200, { created: 1, data: [{ b64_json: PNG.toString('base64'), revised_prompt: 'a test gradient' }] });
      }
      if (req.method === 'POST' && req.url === '/v1/videos') {
        if (submitMode === 'hang') return; // never answers → client times out
        const id = `task_${tasks.size + 1}`;
        tasks.set(id, { status: 'queued' });
        return json(200, { id, status: 'queued', progress: 0 });
      }
      const m = req.url.match(/^\/v1\/videos\/([^/]+)(\/content)?$/);
      if (m && req.method === 'GET') {
        const t = tasks.get(m[1]);
        if (!t) return json(400, { code: 'task_not_exist', message: 'task_not_exist' });
        if (m[2]) { res.writeHead(200, { 'content-type': 'video/mp4' }); return res.end(VIDEO); }
        polls++;
        if (polls >= 2) t.status = 'completed';
        return json(200, { id: m[1], status: t.status, progress: t.status === 'completed' ? 100 : 40 });
      }
      json(404, { error: { message: 'nope' } });
    });
  });
  return {
    calls,
    tasks,
    setSubmitMode: (m) => { submitMode = m; },
    listen: () => new Promise((r) => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}`))),
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }),
  };
}

function fakeCtx() {
  const disposers = [];
  const tools = new Map();
  const saved = { images: [], files: [] };
  const jobs = [];
  const ctx = {
    logger: { warn() {}, error() {} },
    effect(fn) { const d = fn(); if (typeof d === 'function') disposers.push(d); },
    inject(_names, cb) {
      cb({
        effect: (fn) => ctx.effect(fn),
        tools: { register(def) { tools.set(def.name, def); return () => tools.delete(def.name); } },
      });
    },
    get(name) {
      if (name === 'attachments') {
        return {
          async saveImage(i) { const ref = { attachmentId: `img${saved.images.length}`, mediaType: i.mediaType, bytes: i.data.byteLength, width: 64, height: 48, name: i.name }; saved.images.push(ref); return ref; },
          async saveFile(i) { const ref = { attachmentId: `file${saved.files.length}`, name: i.name, bytes: i.data.byteLength }; saved.files.push(ref); return ref; },
          fileHostPath: () => undefined,
          imageHostPath: () => undefined,
        };
      }
      if (name === 'jobs') {
        return {
          start(spec) {
            const progress = [];
            const output = [];
            const hooks = spec.run({ id: `newapi-video-${jobs.length}`, append: (t) => output.push(t), updateProgress: (p) => progress.push(p) });
            const job = { spec, hooks, progress, output, outcome: undefined };
            hooks.done.then((o) => { job.outcome = o; });
            jobs.push(job);
            return `newapi-video-${jobs.length - 1}`;
          },
        };
      }
      return undefined;
    },
  };
  return { ctx, tools, saved, jobs, dispose: () => disposers.splice(0).forEach((d) => d()) };
}

const until = async (fn, ms = 40_000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 200)); }
  return false;
};

const catalog = async () => ({
  entries: [
    { id: 'gpt-image-2', kind: 'image', hidden: false },
    { id: 'sora-2', kind: 'video', hidden: false },
    { id: 'claude-opus-5-5', kind: 'chat', hidden: false },
  ],
});

test('image generation saves attachments and reports the model', async () => {
  const gw = fakeGateway();
  const base = await gw.listen();
  const f = fakeCtx();
  registerMedia(f.ctx, { connection: () => ({ baseURL: `${base}/v1` }), catalog, requireApiKey: async () => 'sk-test', reportError() {} });
  const tool = f.tools.get('newapi_image_generate');
  const value = await tool.execute({ prompt: 'a gradient', size: '1024x1024' }, { signal: AbortSignal.timeout(5000), callId: 'c1' });
  assert.equal(value.model, 'gpt-image-2');
  assert.equal(value.images.length, 1);
  assert.equal(value.images[0].mediaType, 'image/png');
  assert.deepEqual(value.revisedPrompts, ['a test gradient']);
  assert.doesNotThrow(() => JSON.stringify(value));
  const blocks = tool.output.render({}, value);
  assert.equal(blocks.filter((b) => b.type === 'image').length, 1);
  const call = gw.calls.find((c) => c.url === '/v1/images/generations');
  assert.equal(call.auth, 'Bearer sk-test');
  await assert.rejects(tool.execute({ prompt: 'x', model: 'claude-opus-5-5x' }, { signal: AbortSignal.timeout(5000) }), /not a image model/);
  f.dispose();
  await gw.close();
});

test('video: submit returns at once, poller completes, file is saved, job settles', async () => {
  const gw = fakeGateway();
  const base = await gw.listen();
  const f = fakeCtx();
  registerMedia(f.ctx, { connection: () => ({ baseURL: base }), catalog, requireApiKey: async () => 'sk-test', reportError() {} });
  const submit = f.tools.get('newapi_video_generate');
  const t0 = Date.now();
  const value = await submit.execute({ prompt: 'a cat', seconds: 4 }, { signal: AbortSignal.timeout(5000), callId: 'c2', agent: { id: 'session-1' } });
  assert.ok(Date.now() - t0 < 3000, 'submit must not block on generation');
  assert.equal(value.model, 'sora-2');
  assert.equal(value.status, 'queued');
  assert.ok(value.jobId, 'a background job is started');
  const ok = await until(() => f.jobs[0]?.outcome !== undefined);
  assert.ok(ok, 'job settled');
  assert.equal(f.jobs[0].outcome.status, 'completed');
  assert.equal(f.saved.files.length, 1);
  assert.match(f.saved.files[0].name, /\.mp4$/);
  assert.equal(f.saved.files[0].bytes, VIDEO.length);
  const status = await f.tools.get('newapi_video_status').execute({ taskId: value.taskId }, {});
  assert.equal(status.tasks[0].status, 'completed');
  assert.ok(gw.calls.some((c) => c.url.endsWith('/content')), 'video downloaded through the gateway content route');
  const posts = gw.calls.filter((c) => c.method === 'POST' && c.url === '/v1/videos');
  assert.equal(posts.length, 1, 'exactly one paid submission');
  f.dispose();
  await gw.close();
});

test('video: restart resumes polling for an unfinished task', async () => {
  const gw = fakeGateway();
  const base = await gw.listen();
  // First "process": submit, then stop before completion.
  const a = fakeCtx();
  registerMedia(a.ctx, { connection: () => ({ baseURL: base }), catalog, requireApiKey: async () => 'sk-test', reportError() {} });
  const v = await a.tools.get('newapi_video_generate').execute({ prompt: 'a dog' }, { signal: AbortSignal.timeout(5000), callId: 'c3' });
  a.dispose();
  // Second "process" reads the task file and resumes.
  const b = fakeCtx();
  registerMedia(b.ctx, { connection: () => ({ baseURL: base }), catalog, requireApiKey: async () => 'sk-test', reportError() {} });
  const done = await until(async () => {
    const s = await b.tools.get('newapi_video_status').execute({ taskId: v.taskId }, {});
    return s.tasks[0].status === 'completed';
  });
  assert.ok(done, 'task completed after restart');
  assert.equal(b.saved.files.length, 1);
  assert.equal(gw.calls.filter((c) => c.method === 'POST' && c.url === '/v1/videos').length, 1, 'no resubmission after restart');
  b.dispose();
  await gw.close();
});

test('video: a submission that times out is marked submit-unknown and never resent', async () => {
  const gw = fakeGateway();
  const base = await gw.listen();
  gw.setSubmitMode('hang');
  const f = fakeCtx();
  registerMedia(f.ctx, { connection: () => ({ baseURL: base }), catalog, requireApiKey: async () => 'sk-test', reportError() {} });
  const ac = new AbortController();
  setTimeout(() => ac.abort(new DOMException('timed out', 'TimeoutError')), 800);
  await assert.rejects(
    f.tools.get('newapi_video_generate').execute({ prompt: 'a bird' }, { signal: ac.signal, callId: 'c4' }),
    /may have accepted and billed/,
  );
  const list = await f.tools.get('newapi_video_status').execute({}, {});
  const latest = list.tasks.find((t) => t.prompt === 'a bird');
  assert.equal(latest.status, 'submit-unknown');
  assert.equal(gw.calls.filter((c) => c.method === 'POST' && c.url === '/v1/videos').length, 1);
  f.dispose();
  await gw.close();
});
