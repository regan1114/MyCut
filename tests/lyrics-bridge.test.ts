import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LyricsBridge } from '../server/lyrics';
import { Library } from '../server/library';
import { ffmpeg } from '../server/native';
import { makeClip, newProject } from '../shared/model';

async function until(check: () => Promise<boolean>) {
  const deadline = Date.now() + 10000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for job');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function fixture(delayMs = 0, result = timeline, audioSeconds = 2) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mycut-lyrics-'));
  const library = new Library(root);
  await library.init();
  const file = path.join(root, 'song.wav');
  await ffmpeg(['-f', 'lavfi', '-i', `sine=frequency=440:duration=${audioSeconds}`, '-ar', '16000', '-c:a', 'pcm_s16le', file]);
  const media = await library.prepare(file, false);
  await library.addPrepared([media]);
  const project = newProject();
  project.clips = [makeClip({ kind: 'audio', mediaId: media.id, trackId: 'voice', start: 0, duration: audioSeconds * project.fps })];
  const model = path.join(root, 'small.pt');
  await fs.writeFile(model, 'test model');
  const worker = path.join(root, 'worker.cjs');
  const marker = path.join(root, 'worker-request.json');
  await fs.writeFile(
    worker,
    `let body='';process.stdin.on('data',chunk=>body+=chunk);process.stdin.on('end',()=>{const request=JSON.parse(body);request.audioBytes=require('fs').statSync(request.audio).size;require('fs').writeFileSync(${JSON.stringify(marker)},JSON.stringify(request));console.log(JSON.stringify({type:'progress',stage:'alignment',percent:65,message:'依原稿對齊中'}));setTimeout(()=>{console.log(JSON.stringify({type:'result',project:${JSON.stringify(result)}}))},${delayMs})});process.on('SIGTERM',()=>process.exit(0));`,
  );
  const bridge = new LyricsBridge(path.join(root, 'lyrics'), library, process.cwd(), {
    command: process.execPath,
    args: [worker],
    model,
  });
  return { root, library, project, file, marker, bridge };
}

const timeline = {
  version: '1.0.0',
  mode: 'known_lyrics',
  duration: 2,
  segments: [{ id: 1, start: 0.5, end: 1.5, text: '月滿' }],
};

test('alignment accepts the full 20-minute boundary, retains ending cues, and rejects one extra frame', async () => {
  const longTimeline = { ...timeline, duration: 1200, segments: [{ id: 1, start: 1198.5, end: 1199.5, text: '月滿' }] };
  const f = await fixture(0, longTimeline, 1200);
  try {
    await assert.rejects(f.bridge.create({ ...f.project, clips: [] }, { lyrics: '月滿' }), /有聲音且未靜音/);
    await assert.rejects(f.bridge.create({ ...f.project, clips: f.project.clips.map(c => ({ ...c, duration: c.duration + 1 })) }, { lyrics: '月滿' }), /20 分鐘/);
    assert.deepEqual(await fs.readdir(path.join(f.root, 'lyrics')).catch(() => []), []);
    const job = await f.bridge.create(f.project, { lyrics: '月滿' });
    await until(async () => (await f.bridge.get(job.id)).status === 'done');
    assert.deepEqual((await f.bridge.get(job.id)).timeline, longTimeline);
    const request = JSON.parse(await fs.readFile(f.marker, 'utf8'));
    assert.ok(request.audioBytes >= 1200 * 16000 * 2 && request.audioBytes < 1200 * 16000 * 2 + 1024, 'worker must receive all 20 minutes of 16 kHz mono PCM, without truncation');
  } finally {
    f.bridge.close(); f.library.close(); await fs.rm(f.root, { recursive: true, force: true });
  }
});

test('partial results are saved as a completed job with an explicit manual-review count', async () => {
  const partial = { ...timeline, unmatched: [{ id: 93, text: '歸來', reason: '未取得有效時長。' }] };
  const f = await fixture(0, partial);
  try {
    const job = await f.bridge.create(f.project, { lyrics: '月滿\n歸來' });
    await until(async () => (await f.bridge.get(job.id)).status === 'done');
    const done = await f.bridge.get(job.id);
    assert.deepEqual(done.timeline, partial);
    assert.match(done.message, /1 句待手動校時/);
    await until(async () => {
      const saved = JSON.parse(await fs.readFile(path.join(f.root, 'lyrics', job.id, 'job.json'), 'utf8'));
      return saved.status === 'done' && saved.timeline.unmatched[0].text === '歸來';
    });
  } finally {
    f.bridge.close(); f.library.close();
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test('missing bundled engine is reported before audio extraction', async (t) => {
  const f = await fixture();
  const unavailable = new LyricsBridge(path.join(f.root, 'lyrics-missing'), f.library, process.cwd(), {
    command: process.execPath,
    args: [],
    model: path.join(f.root, 'missing.pt'),
  });
  let fetchCount = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    fetchCount++;
    throw new TypeError('fetch failed');
  });
  try {
    await assert.rejects(unavailable.create(f.project, { lyrics: '月滿' }), /找不到 MyCut 對齊模型/);
    assert.equal(fetchCount, 0, 'alignment must never call LyricFlow or another HTTP service');
    assert.deepEqual(
      await fs.readdir(path.join(f.root, 'lyrics-missing')).catch(() => []),
      [],
      'the engine check should happen before a job or extracted audio is created',
    );
  } finally {
    unavailable.close();
    f.bridge.close();
    f.library.close();
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test("known lyrics run in MyCut's local worker and return the seconds timeline without ASR", async () => {
  const f = await fixture();
  try {
    const job = await f.bridge.create(f.project, {
      lyrics: '月滿',
      mode: 'captions',
      preserve_lines: false,
    });
    await until(async () => (await f.bridge.get(job.id)).status === 'done');
    const done = await f.bridge.get(job.id);
    assert.deepEqual(done.timeline, timeline);
    assert.equal(done.progress.percent, 100);
    assert.ok(!('remoteId' in done));
    const request = JSON.parse(await fs.readFile(f.marker, 'utf8'));
    assert.deepEqual(request.lines, [{ text: '月滿', units: ['月', '滿'] }]);
    assert.equal(request.audio.endsWith('/audio.wav'), true);
    assert.equal(request.preserve_lines, false);
  } finally {
    f.bridge.close();
    f.library.close();
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test('source execution finds the versioned Python 3.12 environment before the legacy environment', async () => {
  const f = await fixture();
  const appRoot = path.join(f.root, 'source-app');
  const executable = process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python';
  const platform = `${process.platform}-${process.arch}`;
  const python = path.join(appRoot, '.build-tools', `lyrics-aligner-${platform}-py3.12`, executable);
  const legacy = path.join(appRoot, '.build-tools', `lyrics-aligner-${platform}`, executable);
  const worker = path.join(appRoot, 'tools/lyrics-aligner/worker.py');
  const model = path.join(appRoot, 'resources/lyrics-alignment/models/small.pt');
  let bridge: LyricsBridge | undefined;
  try {
    for (const file of [python, legacy, worker, model]) await fs.mkdir(path.dirname(file), { recursive: true });
    // Node acts as the fixture interpreter; the bridge must discover it by versioned path.
    if (process.platform === 'win32') await fs.copyFile(process.execPath, python);
    else await fs.symlink(process.execPath, python);
    await fs.writeFile(legacy, 'invalid legacy interpreter');
    await fs.copyFile(path.join(f.root, 'worker.cjs'), worker);
    await fs.copyFile(path.join(f.root, 'small.pt'), model);
    bridge = new LyricsBridge(path.join(f.root, 'source-jobs'), f.library, appRoot);
    const job = await bridge.create(f.project, { lyrics: '月滿' });
    await until(async () => ['done', 'error'].includes((await bridge!.get(job.id)).status));
    const result = await bridge.get(job.id);
    assert.equal(result.status, 'done', JSON.stringify(result));
    assert.deepEqual(result.timeline, timeline);
  } finally {
    bridge?.close(); f.bridge.close(); f.library.close();
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test('blank script is rejected before audio extraction so callers can use automatic recognition', async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      f.bridge.create(f.project, { lyrics: '  \n\t  ' }),
      /請貼上要對齊的原稿/,
    );
    assert.deepEqual(await fs.readdir(path.join(f.root, 'lyrics')).catch(() => []), []);
  } finally {
    f.bridge.close();
    f.library.close();
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test('a changed source cannot apply a completed local alignment', async () => {
  const f = await fixture(300);
  try {
    const job = await f.bridge.create(f.project, { lyrics: '月滿' });
    await until(async () => !!(await fs.stat(f.marker).catch(() => null)));
    await fs.utimes(f.file, new Date(), new Date(Date.now() + 10000));
    await until(async () => (await f.bridge.get(job.id)).status === 'error');
    assert.match((await f.bridge.get(job.id)).message, /來源已變更/);
  } finally {
    f.bridge.close();
    f.library.close();
    await fs.rm(f.root, { recursive: true, force: true });
  }
});

test('cancellation kills MyCut local alignment and leaves no late result', async () => {
  const f = await fixture(2000);
  try {
    const job = await f.bridge.create(f.project, { lyrics: '月滿' });
    await until(async () => !!(await fs.stat(f.marker).catch(() => null)));
    await f.bridge.cancel(job.id);
    await until(async () => !(await fs.stat(path.join(f.root, 'lyrics', job.id, 'audio.wav')).catch(() => null)));
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal((await f.bridge.get(job.id)).status, 'cancelled');
  } finally {
    f.bridge.close();
    f.library.close();
    await fs.rm(f.root, { recursive: true, force: true });
  }
});
