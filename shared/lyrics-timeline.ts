import { z } from 'zod';

export const UnmatchedLyricSchema = z.object({
  id: z.number().int().positive(),
  text: z.string().min(1).max(12000),
  reason: z.string().min(1).max(1000),
});
export type UnmatchedLyric = z.infer<typeof UnmatchedLyricSchema>;

export type LyricsTimelineMode = 'auto_recognition' | 'known_lyrics' | 'hybrid' | 'import';
export interface LyricWord {
  text: string;
  start: number;
  end: number;
  confidence?: number;
}
export interface LyricSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  confidence?: number;
  words?: LyricWord[];
}
export interface LyricProject {
  version: '1.0.0';
  duration: number;
  mode: LyricsTimelineMode;
  segments: LyricSegment[];
  unmatched?: UnmatchedLyric[];
}

/** Validate MyCut's seconds-based exchange format. */
export function validateProject(value: unknown): LyricProject {
  const fail = (): never => {
    throw new Error('歌詞 Timeline JSON 格式或時間無效。');
  };
  if (!value || typeof value !== 'object') return fail();
  const project = value as Record<string, unknown>;
  if (
    project.version !== '1.0.0' ||
    !Number.isFinite(project.duration) ||
    (project.duration as number) < 0 ||
    !['auto_recognition', 'known_lyrics', 'hybrid', 'import'].includes(String(project.mode)) ||
    !Array.isArray(project.segments)
  )
    return fail();

  const ids = new Set<number>();
  let previous = 0;
  const checkScore = (item: Record<string, unknown>) =>
    item.confidence === undefined ||
    (Number.isFinite(item.confidence) && (item.confidence as number) >= 0 && (item.confidence as number) <= 1);
  const segments: LyricSegment[] = [];
  for (const raw of project.segments) {
    if (!raw || typeof raw !== 'object') return fail();
    const segment = raw as Record<string, unknown>;
    if (
      !Number.isInteger(segment.id) ||
      (segment.id as number) < 1 ||
      ids.has(segment.id as number) ||
      typeof segment.text !== 'string'
    )
      return fail();
    ids.add(segment.id as number);
    if (
      !Number.isFinite(segment.start) ||
      !Number.isFinite(segment.end) ||
      (segment.start as number) < previous ||
      (segment.end as number) <= (segment.start as number) ||
      (segment.end as number) > (project.duration as number) ||
      !checkScore(segment)
    )
      return fail();
    previous = segment.start as number;

    let words: LyricWord[] | undefined;
    if (segment.words !== undefined) {
      if (!Array.isArray(segment.words) || !segment.words.length) return fail();
      let last = segment.start as number;
      words = [];
      for (const rawWord of segment.words) {
        if (!rawWord || typeof rawWord !== 'object') return fail();
        const word = rawWord as Record<string, unknown>;
        if (
          typeof word.text !== 'string' ||
          !word.text ||
          !Number.isFinite(word.start) ||
          !Number.isFinite(word.end) ||
          (word.start as number) < last ||
          (word.end as number) <= (word.start as number) ||
          (word.end as number) > (segment.end as number) ||
          !checkScore(word)
        )
          return fail();
        last = word.end as number;
        words.push({
          text: word.text,
          start: word.start as number,
          end: word.end as number,
          ...(word.confidence === undefined ? {} : { confidence: word.confidence as number }),
        });
      }
      if (words.map((word) => word.text).join('') !== segment.text) return fail();
    }
    segments.push({
      id: segment.id as number,
      start: segment.start as number,
      end: segment.end as number,
      text: segment.text,
      ...(segment.confidence === undefined ? {} : { confidence: segment.confidence as number }),
      ...(words === undefined ? {} : { words }),
    });
  }
  let unmatched: UnmatchedLyric[] | undefined;
  if (project.unmatched !== undefined) {
    const parsed = z.array(UnmatchedLyricSchema).max(12000).safeParse(project.unmatched);
    if (!parsed.success) return fail();
    unmatched = parsed.data;
    for (const line of unmatched) {
      if (ids.has(line.id)) return fail();
      ids.add(line.id);
    }
  }
  return {
    version: '1.0.0',
    duration: project.duration as number,
    mode: project.mode as LyricsTimelineMode,
    segments,
    ...(unmatched?.length ? { unmatched } : {}),
  };
}

export function timelineSrt(value: unknown): string {
  const project = validateProject(value);
  const stamp = (seconds: number) => {
    const milliseconds = Math.round(seconds * 1000);
    return (
      [
        Math.floor(milliseconds / 3600000),
        Math.floor(milliseconds / 60000) % 60,
        Math.floor(milliseconds / 1000) % 60,
      ]
        .map((part) => String(part).padStart(2, '0'))
        .join(':') +
      ',' +
      String(milliseconds % 1000).padStart(3, '0')
    );
  };
  return project.segments
    .map((segment, index) => {
      if (stamp(segment.start) === stamp(segment.end)) throw new Error('字幕短於 SRT 毫秒精度。');
      return `${index + 1}\n${stamp(segment.start)} --> ${stamp(segment.end)}\n${segment.text}\n`;
    })
    .join('\n');
}
