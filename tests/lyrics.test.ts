import test from 'node:test';
import assert from 'node:assert/strict';
import {
  timelineCues,
  alignmentCaptionJob,
  currentLyricsTimeline,
  mergeLyrics,
  prepareAlignmentLyrics,
  applyLyricsTimeline,
  resolvePendingLyric,
  reviewAlignmentTimeline,
} from '../shared/lyrics-adapter';
import { newProject, makeClip, ProjectSchema, splitClip } from '../shared/model';
import { applyCaptions } from '../shared/captions';
import { validateProject, timelineSrt } from '../shared/lyrics-timeline';

const timeline = {
  version: '1.0.0',
  mode: 'known_lyrics',
  duration: 40,
  segments: [
    {
      id: 1,
      start: 14.7,
      end: 19.9,
      text: '月滿',
      words: [
        { text: '月', start: 14.7, end: 15.02 },
        { text: '滿', start: 15.02, end: 19.9 },
      ],
    },
  ],
};
const partial = { ...timeline, unmatched: [{ id: 93, text: '等我歸來', reason: '未取得有效時長。' }] };

test('partial alignment survives saving; manually timing one line preserves existing clips and exports', () => {
  const project = newProject();
  const job = alignmentCaptionJob(project, [], crypto.randomUUID());
  const applied = applyLyricsTimeline(project, job, partial, []);
  const loaded = ProjectSchema.parse(JSON.parse(JSON.stringify(applied)));
  assert.equal(loaded.pendingLyrics![0].lines[0].id, 93);
  assert.equal(currentLyricsTimeline(loaded).unmatched![0].text, '等我歸來');
  assert.ok(!timelineSrt(currentLyricsTimeline(loaded)).includes('等我歸來'));
  const resolved = resolvePendingLyric(loaded, job.id, 93, 25, 28);
  assert.equal(resolved.pendingLyrics!.length, 0);
  assert.deepEqual(resolved.clips[0], loaded.clips[0]);
  const manual = resolved.clips.find((clip) => clip.text === '等我歸來')!;
  assert.equal(manual.start, 750);
  assert.equal(manual.duration, 90);
  assert.equal(manual.trackId, loaded.clips[0].trackId);
  assert.equal(manual.karaoke.source, 'manual');
  assert.equal(manual.karaoke.enabled, false);
  assert.match(timelineSrt(currentLyricsTimeline(resolved)), /00:00:25,000 --> 00:00:28,000\n等我歸來/);
  assert.throws(() => resolvePendingLyric(resolved, job.id, 93, 25, 28), /已加入/);
});

test('all unmatched lines remain editable without creating an empty subtitle track', () => {
  const project = newProject(), job = alignmentCaptionJob(project, [], crypto.randomUUID());
  const applied = applyLyricsTimeline(project, job, { ...partial, segments: [] }, []);
  assert.deepEqual(applied.tracks, project.tracks);
  assert.equal(applied.clips.length, 0);
  assert.equal(resolvePendingLyric(applied, job.id, 93, 2, 3).clips.length, 1);
  assert.throws(() => resolvePendingLyric(applied, job.id, 93, 3, 2), /結束必須晚於開始/);
  assert.throws(() => resolvePendingLyric(applied, job.id, 93, 39, 41), /起訖時間/);
  assert.throws(() => resolvePendingLyric(applied, job.id, 93, NaN, 3), /起訖時間/);
  assert.throws(() => resolvePendingLyric(applied, job.id, 93, 2, 2.001), /影格/);
  assert.throws(() => applyLyricsTimeline({ ...project, fps: 60 }, job, { ...partial, segments: [] }, []), /音訊時間軸已改變/);
});

test('partial JSON validates untimed lines, rejects duplicate IDs, and retains subframe text for manual timing', () => {
  assert.deepEqual(validateProject(partial).unmatched, partial.unmatched);
  assert.throws(() => validateProject({ ...partial, unmatched: [{ ...partial.unmatched[0], id: 1 }] }));
  assert.throws(() => validateProject({ ...partial, unmatched: [{ id: 93, text: '歸' }] }));
  const short = reviewAlignmentTimeline({ ...timeline, segments: [{ id: 1, text: '月', start: 1, end: 1.001 }] }, 30);
  assert.equal(short.segments.length, 0);
  assert.equal(short.unmatched![0].text, '月');
});

test('locked aligned track leaves the pending line and existing results untouched', () => {
  const project = newProject(), job = alignmentCaptionJob(project, [], crypto.randomUUID());
  const applied = applyLyricsTimeline(project, job, partial, []);
  applied.tracks.find((track) => track.id === applied.clips[0].trackId)!.locked = true;
  assert.throws(() => resolvePendingLyric(applied, job.id, 93, 25, 28), /解鎖/);
  assert.equal(applied.pendingLyrics![0].lines.length, 1);
  assert.equal(applied.clips.length, 1);
});
test('shared seconds become frame captions without moving images; words survive save and edited export', () => {
  const project = newProject();
  project.fps = 30;
  const image = makeClip({
    kind: 'image',
    mediaId: crypto.randomUUID(),
    trackId: 'main',
    start: 60,
    duration: 900,
    name: '保留圖片',
  });
  project.clips = [image];
  const cues = timelineCues(timeline, 30);
  assert.equal(cues[0].start, 441);
  assert.equal(cues[0].duration, 156);
  const job = alignmentCaptionJob(project, [], crypto.randomUUID());
  const applied = applyCaptions(project, job, cues, []);
  assert.deepEqual(
    applied.clips.find((clip) => clip.id === image.id),
    image,
  );
  const loaded = ProjectSchema.parse(JSON.parse(JSON.stringify(applied)));
  const clip = loaded.clips.find((clip) => clip.captionJobId === job.id)!;
  assert.equal(clip.karaoke.source, 'alignment');
  const output = currentLyricsTimeline(loaded);
  assert.equal(output.segments[0].start, 14.7);
  assert.equal(output.segments[0].words?.length, 2);
  clip.start += 30;
  assert.equal(currentLyricsTimeline(loaded).segments[0].words![0].start, 15.7);
  clip.duration -= 30;
  assert.equal(currentLyricsTimeline(loaded).segments[0].words, undefined);
});
test('invalid timelines are rejected; subframe words use sentence fallback', () => {
  assert.throws(() => timelineCues({ ...timeline, duration: 1 }, 30));
  const short = {
    ...timeline,
    segments: [
      {
        ...timeline.segments[0],
        words: [
          { text: '月', start: 14.7, end: 14.701 },
          { text: '滿', start: 14.701, end: 19.9 },
        ],
      },
    ],
  };
  assert.equal(timelineCues(short, 30)[0].words, undefined);
});
test('stale audio layout cannot apply a completed alignment', () => {
  const project = newProject();
  const job = alignmentCaptionJob(project, [], crypto.randomUUID());
  const changed = { ...project, fps: 60 as const };
  assert.throws(
    () => applyCaptions(changed, job, timelineCues(timeline, 60), []),
    /音訊時間軸已改變/,
  );
});
test('aligned scripts preserve whether the caller requested captions or lyrics', () => {
  const project = newProject();
  const job = alignmentCaptionJob(project, [], crypto.randomUUID(), undefined, 'captions');
  assert.equal(job.options.mode, 'captions');
  assert.equal(job.options.karaoke, false);
  const applied = applyCaptions(project, job, timelineCues(timeline, project.fps), []);
  assert.equal(applied.clips[0].captionType, 'captions');
  assert.equal(applied.clips[0].karaoke.source, 'alignment');
});
test('Suno section labels are omitted from alignment while sung text remains unchanged', () => {
  const prepared = prepareAlignmentLyrics(
    '[Intro]\n\n[Verse 1]\n月滿天邊\n[Chorus: all vocals]\n[la la]\n[Bridge – piano]\n歸來',
  );
  assert.equal(prepared.lyrics, '\n月滿天邊\n[la la]\n歸來');
  assert.equal(prepared.skippedSectionMarkers, 4);
  assert.deepEqual(prepareAlignmentLyrics('[Verse 2]\n[Chorus]').lyrics, '');
});
test('split and merge keep editable sentences, never repeat the full original text', () => {
  const project = newProject();
  const job = alignmentCaptionJob(project, [], crypto.randomUUID());
  const applied = applyCaptions(project, job, timelineCues(timeline, 30), []);
  const original = applied.clips[0];
  const parts = splitClip(original, 500, 30);
  assert.equal(parts.length, 2);
  assert.equal(parts.map((clip) => clip.text).join(''), original.text);
  assert.ok(parts.every((clip) => !clip.karaoke.enabled && clip.karaoke.words.length === 0));
  const split = { ...applied, clips: parts };
  const merged = mergeLyrics(
    split,
    parts.map((clip) => clip.id),
  );
  assert.equal(merged.clips.length, 1);
  assert.equal(merged.clips[0].start, original.start);
  assert.equal(merged.clips[0].duration, original.duration);
  assert.equal(currentLyricsTimeline(merged).segments[0].words, undefined);
  split.tracks.find((track) => track.id === original.trackId)!.locked = true;
  assert.throws(
    () =>
      mergeLyrics(
        split,
        parts.map((clip) => clip.id),
      ),
    /解鎖/,
  );
});
