import './LyricsSourcePanel.css';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlignLeft, Check, LoaderCircle, Upload, X } from 'lucide-react';
import type { Project, Media } from '../../shared/model';
import type { CaptionJob, CaptionOptions } from '../../shared/captions';
import {
  alignmentCaptionJob,
  currentLyricsTimeline,
  prepareAlignmentLyrics,
  reviewAlignmentTimeline,
} from '../../shared/lyrics-adapter';
import type { LyricsJob } from '../../server/lyrics';
import { validateProject, type LyricProject } from '../../shared/lyrics-timeline';
import { api, download } from '../api';

type Props = {
  project: Project;
  media: Media[];
  mode: CaptionOptions['mode'];
  children: ReactNode;
  selectedIds: string[];
  onMerge: () => void;
  onPlay: (start: number, end: number) => void;
  frame: number;
  onApply: (job: CaptionJob, timeline: LyricProject) => void;
  onResolvePending: (jobId: string, lineId: number, start: number, end: number) => void;
  onImportSrt: (file: File) => void;
  onBatchEdit: () => void;
  onError: (error: unknown) => void;
};
export default function LyricsSourcePanel(props: Props) {
  const [script, setScript] = useState(''),
    [preserveLines, setPreserveLines] = useState(true),
    [dialogOpen, setDialogOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [job, setJob] = useState<LyricsJob>(),
    [message, setMessage] = useState('');
  const latest = useRef(props), importInput = useRef<HTMLInputElement>(null);
  latest.current = props;
  const active = useRef(''), generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
      if (active.current)
        void api(`/api/lyrics/jobs/${active.current}/cancel`, { method: 'POST' }).catch(() => {});
    },
    [],
  );
  const cancel = async () => {
    generation.current++;
    const id = active.current;
    setBusy(false);
    setMessage('已停止套用，原字幕保留。');
    if (id)
      try {
        await api(`/api/lyrics/jobs/${id}/cancel`, { method: 'POST' });
      } catch (error) {
        latest.current.onError(error);
      }
  };
  const alignScript = async () => {
    if (busy || !script.trim()) return;
    const prepared = prepareAlignmentLyrics(script);
    if (!prepared.lyrics.trim()) {
      const error = new Error('原稿只有 Suno 段落標記，請補上實際演唱或說話的內容。');
      setMessage(error.message);
      props.onError(error);
      return;
    }
    setBusy(true);
    setMessage(
      prepared.skippedSectionMarkers
        ? `已略過 ${prepared.skippedSectionMarkers} 個 Suno 段落標記，正在準備音訊…`
        : '正在準備音訊…',
    );
    setJob(undefined);
    active.current = '';
    const request = ++generation.current;
    let createdId = '';
    try {
      const current = latest.current;
      const created = await api<LyricsJob>('/api/lyrics/align', {
        method: 'POST',
        body: JSON.stringify({
          project: current.project,
          options: {
            lyrics: prepared.lyrics,
            mode: current.mode,
            preserve_lines: preserveLines,
          },
        }),
      });
      createdId = created.id;
      if (request !== generation.current) {
        await api(`/api/lyrics/jobs/${created.id}/cancel`, { method: 'POST' });
        return;
      }
      active.current = created.id;
      while (request === generation.current) {
        const result = await api<LyricsJob>(`/api/lyrics/jobs/${created.id}`, {
          signal: AbortSignal.timeout(30000),
        });
        if (request !== generation.current) return;
        setJob(result);
        setMessage(result.message);
        if (result.status === 'error')
          throw new Error(
            result.error
              ? [result.error.message, result.error.details, result.error.suggestion].join(' ')
              : result.message,
          );
        if (result.status === 'cancelled') return;
        if (result.status === 'done') {
          const latestProps = latest.current,
            timeline = reviewAlignmentTimeline(result.timeline, latestProps.project.fps);
          if (latestProps.project.id !== result.projectId) throw new Error('結果屬於另一個專案。');
          const captionJob = alignmentCaptionJob(
            latestProps.project,
            latestProps.media,
            result.id,
            result.signature,
            latestProps.mode,
          );
          latestProps.onApply(captionJob, timeline);
          setDialogOpen(false);
          setMessage(
            `${prepared.skippedSectionMarkers ? `已略過 ${prepared.skippedSectionMarkers} 個 Suno 段落標記，` : ''}已依原稿建立 ${timeline.segments.length} 句${latestProps.mode === 'lyrics' ? '歌詞' : '字幕'}。${timeline.unmatched?.length ? `${timeline.unmatched.length} 句待手動校時，原文已保留在下方。` : '請播放檢查邊界，必要時拖曳修正。'}`,
          );
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      if (request === generation.current) {
        setMessage(error instanceof Error ? error.message : '原稿對齊失敗。');
        props.onError(error);
      }
      if (createdId)
        await api(`/api/lyrics/jobs/${createdId}/cancel`, { method: 'POST' }).catch(() => {});
    } finally {
      if (request === generation.current) {
        setBusy(false);
        active.current = '';
      }
    }
  };
  const importFile = async (file: File) => {
    try {
      if (!file.name.toLowerCase().endsWith('.json')) {
        props.onImportSrt(file);
        return;
      }
      const timeline = validateProject(JSON.parse(await file.text()));
      const current = latest.current;
      const captionJob = alignmentCaptionJob(
        current.project,
        current.media,
        crypto.randomUUID(),
        undefined,
        current.mode,
      );
      captionJob.alignment = timeline.mode === 'known_lyrics';
      current.onApply(captionJob, timeline);
      setMessage(timeline.unmatched?.length ? '已匯入時間軸與待手動校時歌詞。' : 'Timeline JSON 已匯入字幕軌。');
    } catch (error) {
      props.onError(error);
    }
  };
  const exportJson = () => {
    try {
      const timeline = currentLyricsTimeline(props.project);
      download(
        'captions.json',
        JSON.stringify(timeline, null, 2),
        'application/json',
      );
      if (timeline.unmatched?.length) setMessage('JSON 已包含已校時與待手動校時的歌詞。');
    } catch (error) {
      props.onError(error);
    }
  };
  return (
    <section className="lyrics-source-panel caption-panel">
      <button className="wide-button primary-soft batch-open" onClick={() => setDialogOpen(true)}>
        <AlignLeft size={15} />輸入原稿並對齊
      </button>
      <p className="field-note">已有原稿可直接對齊音源；沒有原稿時，使用下方自動字幕或自動歌詞。</p>
      {props.children}
      {message && (
        <p role="status" className="field-note">
          {message}
        </p>
      )}
      {!!props.project.pendingLyrics?.some((batch) => batch.lines.length) && (
        <section className="lyrics-pending" aria-label="待手動校時歌詞">
          <h3>待手動校時（{props.project.pendingLyrics.reduce((count, batch) => count + batch.lines.length, 0)}）</h3>
          <p className="field-note">原文已儲存在專案。播放歌曲，按「取目前時間」打點，或輸入起訖秒數，再加入時間軸。</p>
          {props.project.pendingLyrics.flatMap((batch) => batch.lines.map((line) => (
            <PendingLyricRow key={`${batch.jobId}:${line.id}`} line={line}
              frame={props.frame} fps={props.project.fps}
              duration={Math.max(batch.duration, ...props.project.clips.map((clip) => (clip.start + clip.duration) / props.project.fps))}
              onPlay={props.onPlay} onError={props.onError}
              onApply={(start, end) => props.onResolvePending(batch.jobId, line.id, start, end)} />
          )))}
        </section>
      )}
      <label className="wide-button lyrics-import-button">
        <Upload size={14} />匯入 SRT / Timeline JSON
        <input
          ref={importInput}
          aria-label="匯入 Timeline JSON 或 SRT"
          type="file"
          accept=".srt,.json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importFile(file);
            event.target.value = '';
          }}
        />
      </label>
      <div className="caption-job-actions">
        <button disabled={props.selectedIds.length < 2} onClick={props.onMerge}>
          合併所選字幕
        </button>
        <button
          disabled={
            props.selectedIds.length !== 1 ||
            !props.project.clips.some(
              (clip) => clip.id === props.selectedIds[0] && clip.kind === 'text',
            )
          }
          onClick={() => {
            const clip = props.project.clips.find((clip) => clip.id === props.selectedIds[0])!;
            props.onPlay(clip.start, clip.start + clip.duration);
          }}
        >
          播放所選字幕
        </button>
      </div>
      <div className="caption-job-actions">
        <button onClick={props.onBatchEdit}>字幕批次編輯</button>
        <button onClick={exportJson}>目前字幕 JSON</button>
      </div>
      {dialogOpen && createPortal(
        <div className="modal-backdrop">
          <section className="caption-review lyrics-script-modal" role="dialog" aria-modal="true" aria-label="輸入原稿">
            <div className="modal-header">
              <div>
                <span className="eyebrow">SCRIPT TO TIMELINE</span>
                <h2>{props.mode === 'lyrics' ? '輸入歌詞原稿' : '輸入字幕原稿'}</h2>
              </div>
              <button aria-label="關閉原稿視窗" onClick={() => setDialogOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <p className="field-note">貼上原稿後，能定位的句子會加入時間軸，未定位的句子會保留供手動校時；Suno 的 [Verse]、[Chorus] 等獨立段落標記會自動略過。</p>
            <label className="lyrics-script-input">
              原稿內容
              <textarea
                aria-label="原稿內容"
                rows={10}
                maxLength={12000}
                value={script}
                disabled={busy}
                onChange={(event) => setScript(event.target.value)}
                placeholder={props.mode === 'lyrics' ? '每行一句實際演唱的歌詞' : '貼上對白或字幕原稿；可依說話段落換行'}
              />
            </label>
            <label className="caption-check">
              <input
                type="checkbox"
                checked={preserveLines}
                disabled={busy}
                onChange={(event) => setPreserveLines(event.target.checked)}
              />
              保留原稿分行
            </label>
            {busy && (
              <div className="lyrics-align-progress">
                {job?.progress.percent != null ? <progress max={100} value={job.progress.percent} /> : <LoaderCircle className="spin" size={15} />}
                <span>{message}</span>
                <button onClick={() => void cancel()}>取消原稿對齊</button>
              </div>
            )}
            <footer className="caption-review-footer">
              <button disabled={busy} onClick={() => setDialogOpen(false)}>取消</button>
              <button
                className="primary-button"
                disabled={busy || !script.trim()}
                onClick={() => void alignScript()}
              >
                <Check size={15} />依原稿對齊音源
              </button>
            </footer>
          </section>
        </div>,
        document.body,
      )}
    </section>
  );
}

function PendingLyricRow({ line, frame, fps, duration, onPlay, onApply, onError }: {
  line: { id: number; text: string; reason: string };
  frame: number; fps: number; duration: number;
  onPlay: (start: number, end: number) => void;
  onApply: (start: number, end: number) => void;
  onError: (error: unknown) => void;
}) {
  const [start, setStart] = useState(''), [end, setEnd] = useState('');
  const valid = start.trim() !== '' && end.trim() !== '' && Number.isFinite(Number(start)) &&
    Number.isFinite(Number(end)) && Number(start) >= 0 && Number(end) <= duration &&
    Math.round(Number(end) * fps) > Math.round(Number(start) * fps);
  return <article className="lyrics-pending-row" aria-label={`待校時第 ${line.id} 行`}>
    <strong>第 {line.id} 行 · {line.text}</strong>
    <p className="field-note">{line.reason}</p>
    <div className="lyrics-time-field">
      <label>開始（秒）<input type="number" min="0" max={duration} step="0.001"
        aria-label={`第 ${line.id} 行開始秒數`} value={start} onChange={(event) => setStart(event.target.value)} /></label>
      <button aria-label={`第 ${line.id} 行以目前時間設定開始`} onClick={() => setStart((frame / fps).toFixed(3))}>取目前時間</button>
    </div>
    <div className="lyrics-time-field">
      <label>結束（秒）<input type="number" min="0" max={duration} step="0.001"
        aria-label={`第 ${line.id} 行結束秒數`} value={end} onChange={(event) => setEnd(event.target.value)} /></label>
      <button aria-label={`第 ${line.id} 行以目前時間設定結束`} onClick={() => setEnd((frame / fps).toFixed(3))}>取目前時間</button>
    </div>
    <div className="caption-job-actions">
      <button disabled={!valid} onClick={() => onPlay(Math.round(Number(start) * fps), Math.round(Number(end) * fps))}>試聽這段</button>
      <button disabled={!valid} onClick={() => { try { onApply(Number(start), Number(end)); } catch (error) { onError(error); } }}>加入時間軸</button>
    </div>
  </article>;
}
