import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.DSH_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nas-test-binding-'));
const { ModelTester } = await import('../lib/model-test.js');

test('test metadata and video submission use one captured channel, not later live settings', async () => {
  let active = 'original';
  const seen = [];
  const tester = new ModelTester({
    channelFacts: async () => {
      const captured = active;
      return {
        baseURL: 'http://localhost:9',
        apiKey: async () => { active = 'changed'; return 'test-key'; },
        entryFor: async () => { seen.push(captured); return { kind: 'video' }; },
        submitVideo: async () => { seen.push(captured); return { taskId: 'fake-task' }; },
      };
    },
    entryFor: () => { throw new Error('must not reread live metadata'); },
    submitVideo: () => { throw new Error('must not recapture live gateway'); },
  });
  const r = await tester.run({ channelId: 'a', modelId: 'sora', confirmPaid: true });
  assert.equal(r.phase, 'accepted');
  assert.equal(r.ok, false);
  assert.deepEqual(seen, ['original', 'original']);
  assert.equal(active, 'changed');
});

test('disabled or unknown model in captured catalog is rejected without generation', async () => {
  const tester = new ModelTester({ channelFacts: async () => ({ apiKey: async () => 'test-key', entryFor: async () => undefined }) });
  await assert.rejects(tester.run({ channelId: 'a', modelId: 'unknown-image', confirmPaid: true }), /not enabled/);
});
