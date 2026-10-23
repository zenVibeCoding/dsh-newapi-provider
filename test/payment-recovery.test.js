import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registerMedia } from '../lib/media.js';
import { fetchJson, readCache, writeCache } from '../lib/util.js';

// Every request is to an ephemeral loopback fake; no credentials/profile are read.
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }
async function setup(t, handler, options = {}) {
  const oldHome = process.env.DSH_HOME;
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'newapi-payment-'));
  process.env.DSH_HOME = home;
  const calls = [];
  const server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      calls.push({ method: req.method, url: req.url, headers: req.headers });
      handler(req, res, calls);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  const tools = new Map(), disposers = [], saved = [];
  const ctx = {
    logger: { warn() {} },
    effect(fn) { const cleanup = fn(); if (typeof cleanup === 'function') disposers.push(cleanup); },
    inject(_names, cb) { cb({ effect: (fn) => ctx.effect(fn), tools: { register(def) { tools.set(def.name, def); return () => {}; } } }); },
    get(name) {
      if (name === 'attachments') return {
        async saveFile(input) {
          saved.push(input);
          await options.saveGate?.promise;
          return { attachmentId: 'fake-video', name: input.name, bytes: input.data.length };
        },
      };
      return undefined;
    },
  };
  const bound = { connection: { baseURL, channelId: 'fake', apiKeyName: 'FAKE', headers: { 'x-extra-secret': 'fake-header' } }, requireApiKey: async () => 'fake-key', catalog: async () => ({ entries: [{ id: 'video', kind: 'video' }, { id: 'image', kind: 'image' }] }) };
  const host = { capture: () => bound, captureTask: () => bound, reportError() {} };
  const media = registerMedia(ctx, host);
  const dispose = () => disposers.splice(0).reverse().forEach((fn) => fn());
  t.after(async () => {
    dispose(); server.closeAllConnections(); await new Promise((r) => server.close(r));
    if (oldHome === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = oldHome;
  });
  const run = (name, args = {}) => tools.get(`newapi_${name}`).execute(args, { signal: new AbortController().signal, callId: 'offline' });
  return { baseURL, media, run, calls, saved, dispose, home, ctx, host };
}
function json(res, value, code = 200) { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); }
function brokenBody(res) {
  res.writeHead(200, { 'content-type': 'application/json', 'content-length': '1000' });
  res.write('{"id":');
  // Delay destruction until 200 headers and a partial body have reached fetch.
  setTimeout(() => res.destroy(), 30);
}

for (const mode of ['disconnect', 'bad-json']) {
  test(`video ${mode} after HTTP 200 is submit-unknown; never repeats POST`, async (t) => {
    const f = await setup(t, (_req, res) => mode === 'disconnect' ? brokenBody(res) : res.end('{bad json'));
    await assert.rejects(f.run('video_generate', { prompt: 'offline' }), /may have accepted and billed/);
    const task = f.media.status().tasks[0];
    assert.equal(task.status, 'submit-unknown');
    await f.run('video_status', { taskId: task.taskId });
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].method, 'POST');
    assert.equal(f.calls[0].headers['x-extra-secret'], 'fake-header');
  });
  test(`image ${mode} warns of possible billing`, async (t) => {
    const f = await setup(t, (_req, res) => mode === 'disconnect' ? brokenBody(res) : res.end('not json'));
    await assert.rejects(f.run('image_generate', { prompt: 'offline' }), /may still finish and bill/);
    assert.equal(f.calls.length, 1);
  });
}

test('fetchJson preserves HTTP 200 on body disconnect and timeout', async (t) => {
  const f = await setup(t, (req, res) => {
    if (req.url === '/broken') brokenBody(res);
    else { res.writeHead(200); res.write('{'); }
  });
  await assert.rejects(fetchJson(`${f.baseURL}/broken`), (e) => e.code === 'UNREACHABLE' && e.status === 200);
  await assert.rejects(fetchJson(`${f.baseURL}/hang`, { timeoutMs: 40 }), (e) => e.code === 'TIMEOUT' && e.status === 200);
});

test('completed video recovers download 503 with GET only and concurrent polling saves once', async (t) => {
  let downloads = 0, statusReads = 0;
  const gate = deferred();
  const f = await setup(t, (req, res) => {
    if (req.method === 'POST') return json(res, { id: 'remote-1', status: 'queued' });
    if (req.url.endsWith('/content')) {
      if (++downloads === 1) return json(res, { message: 'temporary' }, 503);
      return res.end(Buffer.alloc(4096));
    }
    statusReads++; json(res, { status: 'completed', progress: 100 });
  }, { saveGate: gate });
  const { taskId } = await f.run('video_generate', { prompt: 'offline' });
  await f.run('video_status', { taskId });
  let task = f.media.status().tasks[0];
  assert.equal(task.status, 'download-pending');
  assert.equal(task.remoteId, 'remote-1');
  assert.ok(task.downloadDeadline > Date.now());
  const polls = Array.from({ length: 8 }, () => f.run('video_status', { taskId }));
  gate.resolve();
  await Promise.all(polls);
  assert.equal(f.saved.length, 1);
  assert.equal(statusReads, 2, 'download recovery re-reads status to refresh expiring URLs');
  assert.equal(downloads, 2);
  assert.equal(f.calls.filter((c) => c.method === 'POST').length, 1);
  assert.equal(f.media.status().tasks[0].status, 'completed');
  await f.run('video_status', { taskId });
  assert.equal(f.saved.length, 1);
  assert.equal(readCache('media-history.json').items.filter((i) => i.type === 'video').length, 1);
});

test('unload aborts pending GET without writing stale task cache', async (t) => {
  const started = deferred(), closed = deferred();
  const f = await setup(t, (req, res) => {
    if (req.method === 'POST') return json(res, { id: 'remote-2', status: 'queued' });
    res.writeHead(200); res.write('{'); started.resolve();
    res.on('close', () => closed.resolve());
  });
  const { taskId } = await f.run('video_generate', { prompt: 'offline' });
  const polling = f.run('video_status', { taskId });
  await started.promise;
  const before = JSON.stringify(readCache('video-tasks.json'));
  f.dispose();
  await polling;
  await closed.promise;
  assert.equal(JSON.stringify(readCache('video-tasks.json')), before);
  assert.equal(f.saved.length, 0);
});

test('unload during attachment save prevents stale history/task writes', async (t) => {
  const gate = deferred();
  const f = await setup(t, (req, res) => {
    if (req.method === 'POST') return json(res, { id: 'remote-3', status: 'completed' });
    if (!req.url.endsWith('/content')) return json(res, { status: 'completed' });
    res.end(Buffer.alloc(4096));
  }, { saveGate: gate });
  const { taskId } = await f.run('video_generate', { prompt: 'offline' });
  const polling = f.run('video_status', { taskId });
  // Await an explicit save-entry signal, not a timing-dependent delay.
  const saveDeadline = Date.now() + 3000;
  while (f.saved.length === 0) {
    assert.ok(Date.now() < saveDeadline, 'attachment save must start within 3s');
    await new Promise((r) => setImmediate(r));
  }
  const before = JSON.stringify(readCache('video-tasks.json'));
  const history = JSON.stringify(readCache('media-history.json'));
  f.dispose(); gate.resolve(); await polling;
  assert.equal(JSON.stringify(readCache('video-tasks.json')), before);
  assert.equal(JSON.stringify(readCache('media-history.json')), history);
});

test('bad firstFrame never creates submitting task or sends a request', async (t) => {
  const f = await setup(t, (_req, res) => json(res, {}));
  await assert.rejects(f.run('video_generate', { prompt: 'offline', firstFrame: path.join(f.home, 'missing.png') }));
  const bad = path.join(f.home, 'bad.png'); fs.writeFileSync(bad, 'not an image');
  await assert.rejects(f.run('video_generate', { prompt: 'offline', firstFrame: bad }), /not a PNG/);
  assert.equal(f.calls.length, 0);
  assert.deepEqual(f.media.status().tasks, []);
  assert.equal(readCache('video-tasks.json'), undefined);
});

test('restart download recovery respects deadline and never regresses completed tasks', async (t) => {
  const f = await setup(t, (_req, res) => json(res, { status: 'in_progress' }));
  f.dispose();
  writeCache('video-tasks.json', { tasks: {
    done: { localId: 'done', remoteId: 'remote-done', status: 'completed', createdAt: Date.now(), file: { name: 'done.mp4' } },
    late: { localId: 'late', remoteId: 'remote-late', status: 'download-pending', createdAt: Date.now(), downloadDeadline: Date.now() - 1 },
  } });
  const media = registerMedia(f.ctx, f.host);
  await f.run('video_status');
  const tasks = media.status().tasks;
  assert.equal(tasks.find((x) => x.taskId === 'done').status, 'completed');
  assert.equal(tasks.find((x) => x.taskId === 'late').status, 'download-failed');
  assert.equal(tasks.find((x) => x.taskId === 'late').remoteId, 'remote-late');
  assert.equal(f.calls.length, 0);
});

test('cross-origin download redirect does not forward auth or extra headers', async (t) => {
  const seen = deferred();
  const external = http.createServer((req, res) => { seen.resolve(req.headers); res.end(Buffer.alloc(4096)); });
  await new Promise((r) => external.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => { external.closeAllConnections(); external.close(r); }));
  const f = await setup(t, (req, res) => {
    if (req.method === 'POST') return json(res, { id: 'remote-redirect', status: 'completed' });
    if (!req.url.endsWith('/content')) return json(res, { status: 'completed' });
    res.writeHead(302, { location: `http://127.0.0.1:${external.address().port}/video` }); res.end();
  });
  const { taskId } = await f.run('video_generate', { prompt: 'offline' });
  await f.run('video_status', { taskId });
  const headers = await seen.promise;
  assert.equal(headers.authorization, undefined);
  assert.equal(headers['x-extra-secret'], undefined);
  assert.equal(f.media.status().tasks[0].status, 'completed');
});
