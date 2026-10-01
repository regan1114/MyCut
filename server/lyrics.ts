/** MyCut's own known-lyrics aligner. It never calls ASR or another application. */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ProjectSchema, type Project } from '../shared/model';
import { validateProject, type LyricProject } from '../shared/lyrics-timeline';
import { audioSignature, audibleClips } from '../shared/captions';
import { Library, atomicJson } from './library';
import { extractSpeechAudio } from './speech';
import { unpackedPath } from '../shared/platform';

export interface LyricsJob {
  id: string;
  projectId: string;
  signature: string;
  status: 'preparing' | 'processing' | 'done' | 'error' | 'cancelled';
  message: string;
  progress: { percent: number | null };
  timeline?: LyricProject;
  fingerprint: string;
  error?: { code: string; message: string; details: string; suggestion: string };
}
type AlignmentOptions = z.infer<typeof optionsSchema>;
type WorkerEvent =
  | { type: 'progress'; stage: string; percent: number; message: string }
  | { type: 'result'; project: LyricProject }
  | { type: 'error'; code: string; message: string; details?: string; suggestion?: string };
type WorkerRuntime = {
  command: string;
  args: string[];
  model: string;
  available: boolean;
  message: string;
};
type WorkerOverride = { command: string; args: string[]; model: string };

const optionsSchema = z.object({
  lyrics: z.string().min(1).max(12000),
  mode: z.enum(['captions', 'lyrics']).default('lyrics'),
  preserve_lines: z.boolean().default(true),
});
const terminal = (job: LyricsJob) => ['done', 'error', 'cancelled'].includes(job.status);
const MAX_ALIGNMENT_SECONDS = 20 * 60;

function workerRuntime(appRoot: string, override?: WorkerOverride): WorkerRuntime {
  if (override)
    return {
      ...override,
      available: existsSync(override.model),
      message: existsSync(override.model) ? 'MyCut 對齊引擎已就緒。' : '找不到 MyCut 對齊模型。',
    };

  const packed = appRoot.includes('app.asar');
  const root = unpackedPath(path.join(appRoot, 'resources', 'lyrics-alignment'));
  const model = path.join(root, 'models', 'small.pt');
  const platform = `${process.platform}-${process.arch}`;
  const sidecar = path.join(
    root,
    platform,
    'mycut-aligner',
    process.platform === 'win32' ? 'mycut-aligner.exe' : 'mycut-aligner',
  );
  const worker = unpackedPath(path.join(appRoot, 'tools', 'lyrics-aligner', 'worker.py'));
  if (existsSync(sidecar))
    return {
      command: sidecar,
      args: [],
      model,
      available: existsSync(model),
      message: existsSync(model) ? 'MyCut 對齊引擎已就緒。' : '找不到 MyCut 對齊模型，請重新安裝。',
    };

  if (packed)
    return {
      command: sidecar,
      args: [],
      model,
      available: false,
      message: `此 MyCut 安裝包缺少 ${platform} 歌詞對齊引擎。請重新下載完整安裝包。`,
    };

  const localPython = ['-py3.12', '-py3.11', '-py3.10', '-py3.9', ''].map(version => path.join(
    appRoot, '.build-tools', `lyrics-aligner-${platform}${version}`,
    process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
  )).find(existsSync);
  const command =
    process.env.MYCUT_ALIGNMENT_PYTHON ||
    (localPython ?? (process.platform === 'win32' ? 'python' : 'python3'));
  const modelExists = existsSync(model);
  const workerExists = existsSync(worker);
  return {
    command,
    args: [worker],
    model,
    available: modelExists && workerExists,
    message: !workerExists
      ? '找不到 MyCut 本機對齊程式。'
      : !modelExists
        ? '找不到 MyCut 內建對齊模型。'
        : 'MyCut 對齊引擎已就緒。',
  };
}

export class LyricsBridge {
  private jobs = new Map<string, LyricsJob>();
  private controllers = new Map<string, AbortController>();
  private workers = new Map<string, ChildProcessWithoutNullStreams>();
  private snapshots = new Map<string, Project>();
  private closed = false;
  private readonly runtime: WorkerRuntime;

  constructor(
    readonly root: string,
    readonly library: Library,
    appRoot = process.cwd(),
    runtimeOverride?: WorkerOverride,
  ) {
    this.runtime = workerRuntime(appRoot, runtimeOverride);
  }

  health() {
    return {
      ready: this.runtime.available,
      engine: 'mycut-known-lyrics-whisper-small',
      message: this.runtime.message,
    };
  }

  private async fingerprint(project: Project) {
    const files = await Promise.all(
      audibleClips(project, this.library.list()).map(async (clip) => {
        const media = this.library.get(clip.mediaId!);
        const stat = await fs.stat(media.path);
        return {
          id: media.id,
          path: media.path,
          size: stat.size,
          mtime: stat.mtimeMs,
          revision: media.revision,
        };
      }),
    );
    return JSON.stringify(files);
  }

  private save(job: LyricsJob) {
    return atomicJson(path.join(this.root, job.id, 'job.json'), job);
  }

  private public(job: LyricsJob) {
    const { fingerprint: _, ...result } = job;
    return structuredClone(result);
  }

  async create(raw: unknown, settings: unknown) {
    if (this.closed) throw new Error('MyCut 歌詞對齊工具正在關閉。');
    if ([...this.jobs.values()].some((job) => !terminal(job)))
      throw new Error('已有原稿對齊工作，請等待完成或取消。');
    const health = this.health();
    if (!health.ready) throw new Error(health.message);

    const project = ProjectSchema.parse(raw),
      options = optionsSchema.parse(settings);
    if (!options.lyrics.split(/\r?\n/).some((line) => line.trim()))
      throw new Error('請貼上要對齊的原稿，或改用自動辨識。');
    const clips = audibleClips(project, this.library.list());
    const duration = Math.max(
      0,
      ...clips.map((clip) => (clip.start + clip.duration) / project.fps),
    );
    if (!duration) throw new Error('請加入有聲音且未靜音的片段，再進行原稿對齊。');
    if (duration > MAX_ALIGNMENT_SECONDS)
      throw new Error('目前原稿對齊支援 20 分鐘以內，請將音訊時間軸縮短至 20 分鐘再試。');

    const id = randomUUID();
    const job: LyricsJob = {
      id,
      projectId: project.id,
      signature: audioSignature(project, this.library.list()),
      status: 'preparing',
      message: '正在準備時間軸音訊…',
      progress: { percent: 0 },
      fingerprint: '',
    };
    this.jobs.set(id, job);
    this.snapshots.set(id, project);
    const controller = new AbortController();
    this.controllers.set(id, controller);
    try {
      job.fingerprint = await this.fingerprint(project);
      await this.save(job);
    } catch (error) {
      job.status = 'error';
      this.controllers.delete(id);
      throw error;
    }
    void this.process(job, project, duration, options, controller);
    return this.public(job);
  }

  private async runWorker(job: LyricsJob, audio: string, options: AlignmentOptions, signal: AbortSignal) {
    const worker = spawn(this.runtime.command, this.runtime.args, {
      cwd: path.dirname(this.runtime.model),
      env: {
        ...process.env,
        OMP_NUM_THREADS: '4',
        NUMBA_CACHE_DIR: path.join(this.root, 'cache', 'numba'),
        PYTHONNOUSERSITE: '1',
      },
      signal,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.workers.set(job.id, worker);

    return await new Promise<LyricProject>((resolve, reject) => {
      let buffer = '', stderr = '', result: LyricProject | undefined, failure: Error | undefined;
      const consume = (line: string) => {
        if (!line.trim()) return;
        let event: WorkerEvent;
        try {
          event = JSON.parse(line) as WorkerEvent;
        } catch {
          return;
        }
        if (event.type === 'progress') {
          job.status = 'processing';
          job.message = event.message;
          job.progress.percent = Math.max(0, Math.min(100, event.percent));
          void this.save(job).catch(() => {});
        } else if (event.type === 'result') {
          result = validateProject(event.project);
        } else if (event.type === 'error') {
          job.error = {
            code: event.code,
            message: event.message,
            details: event.details ?? '',
            suggestion: event.suggestion ?? '',
          };
          failure = new Error(
            [event.message, event.details, event.suggestion].filter(Boolean).join(' '),
          );
        }
      };
      worker.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        let newline: number;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          consume(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
        }
      });
      worker.stderr.on('data', (chunk: Buffer) => {
        stderr = (stderr + chunk.toString('utf8')).slice(-4000);
      });
      worker.on('error', (error) => reject(error));
      worker.on('close', (code) => {
        this.workers.delete(job.id);
        if (buffer.trim()) consume(buffer);
        if (signal.aborted || job.status === 'cancelled') return resolve(undefined as never);
        if (failure) return reject(failure);
        if (result) return resolve(result);
        reject(new Error(stderr.trim() || `MyCut 對齊引擎意外結束（${code ?? 'unknown'}）。`));
      });
      worker.stdin.on('error', () => {});
      worker.stdin.end(
        JSON.stringify({
          audio,
          model: this.runtime.model,
          lines: options.lyrics.split(/\r?\n/).filter((text) => text.trim()).map((text) => ({ text, units: Array.from(text) })),
          preserve_lines: options.preserve_lines,
        }),
      );
    });
  }

  private async process(
    job: LyricsJob,
    project: Project,
    duration: number,
    options: AlignmentOptions,
    controller: AbortController,
  ) {
    const file = path.join(this.root, job.id, 'audio.wav');
    try {
      await extractSpeechAudio(
        project,
        this.library,
        { mode: options.mode, language: 'zh', traditional: false, vocalFocus: false, karaoke: true },
        0,
        duration,
        file,
        controller.signal,
      );
      if (terminal(job)) return;
      job.status = 'processing';
      job.message = '正在載入 MyCut 本機對齊引擎…';
      job.progress.percent = 5;
      await this.save(job);

      const timeline = await this.runWorker(job, file, options, controller.signal);
      if (terminal(job)) return;
      const fingerprint = await this.fingerprint(this.snapshots.get(job.id)!);
      if (job.fingerprint !== fingerprint) {
        job.status = 'error';
        job.message = '音訊來源已變更，請重新對齊。';
      } else {
        job.timeline = validateProject(timeline);
        job.status = 'done';
        const pending = job.timeline.unmatched?.length ?? 0;
        job.message = pending
          ? `已定位 ${job.timeline.segments.length} 句，${pending} 句待手動校時。`
          : '原稿對齊完成，已建立時間軸。';
        job.progress.percent = 100;
      }
      await this.save(job);
    } catch (error) {
      if (!terminal(job)) {
        job.status = 'error';
        job.message = error instanceof Error ? error.message : 'MyCut 本機歌詞對齊失敗。';
        await this.save(job);
      }
    } finally {
      this.workers.delete(job.id);
      this.controllers.delete(job.id);
      await fs.rm(file, { force: true }).catch(() => {});
    }
  }

  async get(id: string) {
    z.string().uuid().parse(id);
    let job = this.jobs.get(id);
    if (!job) {
      job = JSON.parse(await fs.readFile(path.join(this.root, id, 'job.json'), 'utf8')) as LyricsJob;
      if (!terminal(job)) {
        job.status = 'error';
        job.message = 'MyCut 上次對齊因應用程式關閉而中斷，請重新開始。';
        await this.save(job);
      }
      this.jobs.set(id, job);
    }
    return this.public(job);
  }

  async cancel(id: string) {
    const job = await this.getLocal(id);
    if (!terminal(job)) {
      job.status = 'cancelled';
      job.message = '已取消，原字幕保留。';
      this.controllers.get(id)?.abort();
      this.workers.get(id)?.kill();
      await this.save(job);
    }
    return this.public(job);
  }

  private async getLocal(id: string) {
    z.string().uuid().parse(id);
    if (!this.jobs.has(id)) await this.get(id);
    return this.jobs.get(id)!;
  }

  close() {
    this.closed = true;
    for (const job of this.jobs.values())
      if (!terminal(job)) void this.cancel(job.id).catch(() => {});
  }
}
