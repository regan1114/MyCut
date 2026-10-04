import { applyCaptions, audioSignature, type CaptionJob, type CaptionOptions, type Cue } from './captions';
import { validateProject, type LyricProject } from './lyrics-timeline';
import { validWordTiming } from './karaoke';
import { endFrame, makeClip, ProjectSchema, uid, type Project, type Media } from './model';
import { insertTimedClips, primaryTextTrack } from './placement';

const sunoSectionHeader = /^\s*\[(?:intro|verse|pre[- ]chorus|chorus|post[- ]chorus|bridge|hook|refrain|outro|instrumental|interlude|break|solo|drop)(?:\s*(?:\d+|[ivx]+))?(?:\s*[:,-–—][^\]]*)?\]\s*$/i;

/** Keep sung words intact while excluding standalone Suno structure labels from alignment. */
export function prepareAlignmentLyrics(source: string): {
  lyrics: string;
  skippedSectionMarkers: number;
} {
  let skippedSectionMarkers = 0;
  const lyrics = source
    .split(/\r?\n/)
    .filter((line) => {
      if (!sunoSectionHeader.test(line)) return true;
      skippedSectionMarkers++;
      return false;
    })
    .join('\n');
  return { lyrics, skippedSectionMarkers };
}

export function timelineCues(value: unknown, fps: number): Cue[] {
  const project = validateProject(value);
  return project.segments.map((segment) => {
    const start = Math.round(segment.start * fps),
      end = Math.round(segment.end * fps);
    if (end <= start) throw new Error('字幕短於一個影格，請先調整時間。');
    const words = segment.words?.map((word) => ({
      text: word.text,
      start: Math.round(word.start * fps) - start,
      end: Math.round(word.end * fps) - start,
    }));
    return {
      id: String(segment.id),
      start,
      duration: end - start,
      text: segment.text,
      confidence: segment.confidence,
      words:
        words &&
        validWordTiming(segment.text, words) &&
        words.every((word) => word.start >= 0 && word.end <= end - start)
          ? words
          : undefined,
    };
  });
}

export function reviewAlignmentTimeline(value: unknown, fps: number): LyricProject {
  const timeline = validateProject(value);
  const unmatched = [...(timeline.unmatched ?? [])];
  const segments = timeline.segments.filter((segment) => {
    if (Math.round(segment.end * fps) > Math.round(segment.start * fps)) return true;
    unmatched.push({ id: segment.id, text: segment.text, reason: '模型回傳的時長短於一個影格，請手動設定時間。' });
    return false;
  });
  return { ...timeline, segments, ...(unmatched.length ? { unmatched: unmatched.sort((a, b) => a.id - b.id) } : {}) };
}

export function applyLyricsTimeline(
  project: Project, job: CaptionJob, value: unknown, media: Media[], fontId = 'notosanstc',
): Project {
  const timeline = reviewAlignmentTimeline(value, project.fps);
  if (project.id !== job.projectId) throw new Error('對齊結果屬於另一個專案。');
  if (audioSignature(project, media) !== job.signature) throw new Error('音訊時間軸已改變，請重新對齊。');
  const cues = timelineCues(timeline, project.fps);
  if (!cues.length && !timeline.unmatched?.length) throw new Error('沒有可加入的歌詞。');
  const applied = cues.length ? applyCaptions(project, job, cues, media, fontId) : project;
  const pendingLyrics = (applied.pendingLyrics ?? []).filter((batch) => batch.jobId !== job.id);
  if (timeline.unmatched?.length) pendingLyrics.push({
    jobId: job.id, mode: job.options.mode, duration: timeline.duration, lines: timeline.unmatched,
  });
  return ProjectSchema.parse({ ...applied, pendingLyrics });
}

export function resolvePendingLyric(
  project: Project, jobId: string, lineId: number, start: number, end: number, fontId = 'notosanstc',
): Project {
  const batch = project.pendingLyrics?.find((item) => item.jobId === jobId);
  const line = batch?.lines.find((item) => item.id === lineId);
  if (!batch || !line) throw new Error('這句歌詞已加入或不存在。');
  const duration = Math.max(batch.duration, endFrame(project) / project.fps);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > duration)
    throw new Error(`請輸入 0–${duration.toFixed(3)} 秒內的起訖時間，結束必須晚於開始。`);
  const from = Math.round(start * project.fps), to = Math.round(end * project.fps);
  if (to <= from) throw new Error('歌詞時長至少需要一個影格。');
  const existing = project.clips.find((clip) => clip.captionJobId === jobId);
  const existingTrack = existing && project.tracks.find((item) => item.id === existing.trackId);
  if (existingTrack?.locked) throw new Error('請先解鎖這批歌詞的軌道。');
  const track = primaryTextTrack(project);
  if (track?.locked) throw new Error('請先解鎖這批歌詞的軌道。');
  if (!track && project.tracks.length >= 32) throw new Error('最多 32 條軌道，請先移除一條空軌道。');
  const trackId = track?.id ?? uid();
  const clip = makeClip({
    kind: 'text', trackId, start: from, duration: to - from, text: line.text,
    name: line.text.trim().slice(0, 30), captionJobId: jobId, captionType: batch.mode,
    fontId, fontSize: 56, y: .35,
  });
  return insertTimedClips({
    ...project,
    tracks: track ? project.tracks : [{ id: trackId, name: '文字與字幕', kind: 'text', muted: false, hidden: false, locked: false }, ...project.tracks],
    pendingLyrics: project.pendingLyrics!.map((item) => item.jobId === jobId
      ? { ...item, lines: item.lines.filter((pending) => pending.id !== lineId) } : item)
      .filter((item) => item.lines.length),
  }, [clip]);
}
export function alignmentCaptionJob(
  project: Project,
  media: Media[],
  id: string,
  signature = audioSignature(project, media),
  mode: CaptionOptions['mode'] = 'lyrics',
): CaptionJob {
  return {
    id,
    projectId: project.id,
    name: project.name,
    fps: project.fps,
    signature,
    alignment: true,
    options: {
      mode,
      language: 'zh',
      traditional: false,
      vocalFocus: false,
      karaoke: mode === 'lyrics',
    },
    status: 'completed',
    stage: '歌詞對齊完成',
    progress: 1,
    completedChunks: 1,
    totalChunks: 1,
    duration: endFrame(project) / project.fps,
    createdAt: new Date().toISOString(),
    cueCount: 0,
  };
}
export function currentLyricsTimeline(project: Project, batchId?: string): LyricProject {
  const clips = project.clips
    .filter(
      (clip) =>
        clip.kind === 'text' && clip.captionType && (!batchId || clip.captionJobId === batchId),
    )
    .sort((a, b) => a.start - b.start);
  const pending = (project.pendingLyrics ?? []).filter((batch) => !batchId || batch.jobId === batchId);
  const unmatched = pending.flatMap((batch) => batch.lines).map((line, index) => ({ ...line, id: clips.length + index + 1 }));
  return validateProject({
    version: '1.0.0',
    mode: clips.every((clip) => clip.karaoke.source === 'alignment') ? 'known_lyrics' : 'import',
    duration: Math.max(endFrame(project) / project.fps, ...pending.map((batch) => batch.duration)),
    ...(unmatched.length ? { unmatched } : {}),
    segments: clips.map((clip, index) => {
      const start = clip.start / project.fps,
        end = (clip.start + clip.duration) / project.fps;
      const words = clip.karaoke.words.map((word) => ({
        text: word.text,
        start: (clip.start + word.start - clip.karaoke.offset) / project.fps,
        end: (clip.start + word.end - clip.karaoke.offset) / project.fps,
      }));
      const complete =
        validWordTiming(clip.text, clip.karaoke.words) &&
        words.every((word) => word.start >= start && word.end <= end);
      return { id: index + 1, start, end, text: clip.text, ...(complete ? { words } : {}) };
    }),
  });
}
export function mergeLyrics(project: Project, ids: string[]): Project {
  const selected = project.clips
    .filter((clip) => ids.includes(clip.id))
    .sort((a, b) => a.start - b.start);
  if (
    selected.length < 2 ||
    selected.some(
      (clip) =>
        clip.kind !== 'text' ||
        clip.trackId !== selected[0].trackId ||
        clip.captionJobId !== selected[0].captionJobId,
    )
  )
    throw new Error('請選取同一字幕軌的兩句以上字幕。');
  if (project.tracks.find((track) => track.id === selected[0].trackId)?.locked)
    throw new Error('請先解鎖字幕軌。');
  const end = Math.max(...selected.map((clip) => clip.start + clip.duration));
  if (
    project.clips.some(
      (clip) =>
        clip.trackId === selected[0].trackId &&
        !ids.includes(clip.id) &&
        clip.start < end &&
        clip.start + clip.duration > selected[0].start,
    )
  )
    throw new Error('請選取相鄰字幕再合併。');
  const merged = {
    ...selected[0],
    text: selected.map((clip) => clip.text).join(' '),
    duration: end - selected[0].start,
    karaoke: { ...selected[0].karaoke, words: [], enabled: false },
  };
  return { ...project, clips: [...project.clips.filter((clip) => !ids.includes(clip.id)), merged] };
}
