#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const help = `Usage: npm run lyrics-aligner:evaluate -- --manifest <file> [options]

Options:
  --engine <path>   Packaged aligner executable (defaults to this platform's build)
  --model <path>    Whisper model (defaults to resources/lyrics-alignment/models/small.pt)
  --output <path>   Write the JSON report to a file (defaults to stdout)
  --help            Show this help
`;

function option(name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} 後面需要檔案路徑。`);
  return value;
}

if (args.includes('--help')) {
  process.stdout.write(help);
  process.exit(0);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateManifest(value) {
  assert(value && value.version === '1.0.0' && Array.isArray(value.samples) && value.samples.length > 0,
    'Manifest 需使用 version "1.0.0"，且 samples 不可為空。');
  const ids = new Set();
  for (const sample of value.samples) {
    assert(sample && typeof sample.id === 'string' && sample.id.trim(), '每筆樣本都需要 id。');
    assert(!ids.has(sample.id), `樣本 id 重複：${sample.id}`);
    ids.add(sample.id);
    assert(typeof sample.audio === 'string' && sample.audio.trim(), `${sample.id} 缺少 audio 路徑。`);
    assert(Array.isArray(sample.segments) && sample.segments.length > 0, `${sample.id} 缺少人工標註 segments。`);
    let previousStart = -1;
    let totalCharacters = 0;
    for (const [index, segment] of sample.segments.entries()) {
      assert(segment && typeof segment.text === 'string' && segment.text.trim(), `${sample.id} 第 ${index + 1} 句缺少 text。`);
      assert(Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.start >= 0 && segment.end > segment.start,
        `${sample.id} 第 ${index + 1} 句的 start/end 無效。`);
      assert(segment.start >= previousStart, `${sample.id} 的人工標註必須依開始時間排序。`);
      previousStart = segment.start;
      totalCharacters += Array.from(segment.text).length;
      if (segment.words !== undefined) {
        assert(Array.isArray(segment.words) && segment.words.length > 0, `${sample.id} 第 ${index + 1} 句的 words 不可為空。`);
        let previousEnd = segment.start;
        for (const word of segment.words) {
          assert(word && typeof word.text === 'string' && word.text.length > 0 &&
            Number.isFinite(word.start) && Number.isFinite(word.end) &&
            word.start >= previousEnd && word.end > word.start && word.end <= segment.end,
          `${sample.id} 第 ${index + 1} 句有無效或重疊的 word 時間。`);
          previousEnd = word.end;
        }
        assert(segment.words.map((word) => word.text).join('') === segment.text,
          `${sample.id} 第 ${index + 1} 句的 words 文字串接後必須等於 segment.text。`);
      }
    }
    assert(totalCharacters <= 12000, `${sample.id} 歌詞超過目前 12,000 字的上限。`);
  }
  return value;
}

function runAlignment(engine, model, audio, segments, cacheDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(engine, [], {
      cwd: path.dirname(model),
      env: { ...process.env, OMP_NUM_THREADS: '4', NUMBA_CACHE_DIR: cacheDir, PYTHONNOUSERSITE: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let buffer = '';
    let stderr = '';
    let timeline;
    let failure;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line.trim()) continue;
        let event;
        try { event = JSON.parse(line); } catch { continue; }
        if (event.type === 'progress') process.stderr.write(`  ${event.percent}% ${event.message}\n`);
        else if (event.type === 'result') timeline = event.project;
        else if (event.type === 'error') failure = new Error([event.message, event.details, event.suggestion].filter(Boolean).join(' '));
      }
    });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000); });
    child.once('error', reject);
    child.once('close', (code) => {
      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer);
          if (event.type === 'result') timeline = event.project;
          else if (event.type === 'error') failure = new Error([event.message, event.details, event.suggestion].filter(Boolean).join(' '));
        } catch {}
      }
      if (failure) return reject(failure);
      if (code !== 0 || !timeline) return reject(new Error(stderr.trim() || `對齊引擎結束代碼：${code}`));
      resolve(timeline);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({
      audio,
      model,
      lines: segments.map((segment) => ({ text: segment.text, units: Array.from(segment.text) })),
      preserve_lines: true,
    }));
  });
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

function summarize(values) {
  return {
    count: values.length,
    medianSeconds: percentile(values, 0.5),
    p90Seconds: percentile(values, 0.9),
    maxSeconds: values.length ? Math.max(...values) : null,
  };
}

function score(sample, timeline) {
  assert(Number.isFinite(timeline.duration) && timeline.duration <= 1200,
    `${sample.id} 音訊超過目前 20 分鐘的對齊上限。`);
  const actualById = new Map((timeline.segments ?? []).map((segment) => [segment.id, segment]));
  const unmatchedById = new Map((timeline.unmatched ?? []).map((line) => [line.id, line]));
  const lineErrors = [];
  const wordErrors = [];
  let annotatedWords = 0;
  let tokenizationMismatchWords = 0;
  let tokenizationMismatchLines = 0;
  let missingWordTimings = 0;

  for (const [index, reference] of sample.segments.entries()) {
    assert(reference.end <= timeline.duration, `${sample.id} 第 ${index + 1} 句的人工標註超出音訊時長。`);
    const id = index + 1;
    const actual = actualById.get(id);
    if (!actual || unmatchedById.has(id)) {
      lineErrors.push({
        id, text: reference.text, status: 'unmatched',
        reason: unmatchedById.get(id)?.reason ?? '引擎未回傳這句。',
        referenceStart: reference.start, referenceEnd: reference.end,
      });
      if (reference.words) { annotatedWords += reference.words.length; missingWordTimings += reference.words.length; }
      continue;
    }
    const startError = Math.abs(actual.start - reference.start);
    const endError = Math.abs(actual.end - reference.end);
    lineErrors.push({
      id, text: reference.text, status: 'aligned',
      referenceStart: reference.start, referenceEnd: reference.end,
      actualStart: actual.start, actualEnd: actual.end,
      startErrorSeconds: startError, endErrorSeconds: endError,
      confidence: actual.confidence ?? null,
    });

    if (!reference.words) continue;
    annotatedWords += reference.words.length;
    if (!Array.isArray(actual.words)) {
      missingWordTimings += reference.words.length;
      continue;
    }
    if (reference.words.length !== actual.words.length ||
        reference.words.some((word, wordIndex) => word.text !== actual.words[wordIndex]?.text)) {
      tokenizationMismatchLines++;
      tokenizationMismatchWords += reference.words.length;
      continue;
    }
    for (const [wordIndex, expected] of reference.words.entries()) {
      const predicted = actual.words[wordIndex];
      wordErrors.push({
        lineId: id, text: expected.text,
        startErrorSeconds: Math.abs(predicted.start - expected.start),
        endErrorSeconds: Math.abs(predicted.end - expected.end),
      });
    }
  }

  const alignedCount = lineErrors.filter((line) => line.status === 'aligned').length;
  const lineBoundaryErrors = lineErrors.filter((line) => line.status === 'aligned');
  const bothBoundaryErrors = (threshold) => lineBoundaryErrors.filter((line) =>
    line.startErrorSeconds <= threshold && line.endErrorSeconds <= threshold).length;
  const startErrors = lineBoundaryErrors.map((line) => line.startErrorSeconds);
  const endErrors = lineBoundaryErrors.map((line) => line.endErrorSeconds);
  const wordStartErrors = wordErrors.map((word) => word.startErrorSeconds);
  const wordEndErrors = wordErrors.map((word) => word.endErrorSeconds);

  return {
    id: sample.id,
    tags: { language: sample.language ?? null, genre: sample.genre ?? null, vocal: sample.vocal ?? null },
    durationSeconds: timeline.duration,
    lineCount: sample.segments.length,
    alignedLines: alignedCount,
    unmatchedLines: sample.segments.length - alignedCount,
    coverage: alignedCount / sample.segments.length,
    lineBoundaryError: {
      start: summarize(startErrors),
      end: summarize(endErrors),
      linesWithinBothBoundaries: {
        within100ms: bothBoundaryErrors(0.1),
        within250ms: bothBoundaryErrors(0.25),
        within500ms: bothBoundaryErrors(0.5),
      },
    },
    wordTiming: {
      annotatedWords,
      comparedWords: wordErrors.length,
      missingTimings: missingWordTimings,
      tokenizationMismatchLines,
      tokenizationMismatchWords,
      start: summarize(wordStartErrors),
      end: summarize(wordEndErrors),
    },
    lineResults: lineErrors,
    _wordErrors: wordErrors,
  };
}

function aggregate(samples) {
  const lines = samples.flatMap((sample) => sample.lineResults).filter((line) => line.status === 'aligned');
  const wordErrors = samples.flatMap((sample) => sample._wordErrors ?? []);
  const totalLines = samples.reduce((total, sample) => total + sample.lineCount, 0);
  const alignedLines = samples.reduce((total, sample) => total + sample.alignedLines, 0);
  const startErrors = lines.map((line) => line.startErrorSeconds);
  const endErrors = lines.map((line) => line.endErrorSeconds);
  const bothWithin = (threshold) => lines.filter((line) => line.startErrorSeconds <= threshold && line.endErrorSeconds <= threshold).length;
  const allWordStart = wordErrors.map((word) => word.startErrorSeconds);
  const allWordEnd = wordErrors.map((word) => word.endErrorSeconds);
  return {
    sampleCount: samples.length,
    lineCount: totalLines,
    alignedLines,
    unmatchedLines: totalLines - alignedLines,
    coverage: totalLines ? alignedLines / totalLines : 0,
    lineBoundaryError: {
      start: summarize(startErrors), end: summarize(endErrors),
      linesWithinBothBoundaries: {
        within100ms: bothWithin(0.1), within250ms: bothWithin(0.25), within500ms: bothWithin(0.5),
      },
    },
    wordTiming: {
      annotatedWords: samples.reduce((total, sample) => total + sample.wordTiming.annotatedWords, 0),
      comparedWords: wordErrors.length,
      missingTimings: samples.reduce((total, sample) => total + sample.wordTiming.missingTimings, 0),
      tokenizationMismatchLines: samples.reduce((total, sample) => total + sample.wordTiming.tokenizationMismatchLines, 0),
      tokenizationMismatchWords: samples.reduce((total, sample) => total + sample.wordTiming.tokenizationMismatchWords, 0),
      start: summarize(allWordStart), end: summarize(allWordEnd),
    },
  };
}

function breakdown(samples, field) {
  const groups = new Map();
  for (const sample of samples) {
    const value = sample.tags[field] ?? 'unknown';
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(sample);
  }
  return Object.fromEntries([...groups].map(([value, items]) => [value, aggregate(items)]));
}

async function main() {
  const manifestArg = option('--manifest');
  if (!manifestArg) throw new Error('請指定 --manifest。\n\n' + help);
  const manifestPath = path.resolve(manifestArg);
  const manifest = validateManifest(JSON.parse(await fs.readFile(manifestPath, 'utf8')));
  const model = path.resolve(option('--model') ?? path.join(root, 'resources/lyrics-alignment/models/small.pt'));
  const defaultEngine = path.join(root, 'resources/lyrics-alignment', `${process.platform}-${process.arch}`, 'mycut-aligner', process.platform === 'win32' ? 'mycut-aligner.exe' : 'mycut-aligner');
  const engine = path.resolve(option('--engine') ?? defaultEngine);
  const stat = await Promise.allSettled([fs.access(engine), fs.access(model)]);
  if (stat[0].status === 'rejected') throw new Error(`找不到對齊引擎：${engine}。請先建置 lyrics-aligner，或使用 --engine 指定已封裝的引擎。`);
  if (stat[1].status === 'rejected') throw new Error(`找不到 Whisper 模型：${model}。請先安裝模型，或使用 --model 指定路徑。`);
  const cacheDir = path.join(path.dirname(manifestPath), '.lyrics-alignment-eval-cache');
  await fs.mkdir(cacheDir, { recursive: true });

  const results = [];
  for (const sample of manifest.samples) {
    const audio = path.resolve(path.dirname(manifestPath), sample.audio);
    await fs.access(audio).catch(() => { throw new Error(`${sample.id} 找不到音訊：${audio}`); });
    process.stderr.write(`\n[${sample.id}] 正在對齊 ${sample.segments.length} 句…\n`);
    const started = performance.now();
    const timeline = await runAlignment(engine, model, audio, sample.segments, cacheDir);
    const elapsedSeconds = (performance.now() - started) / 1000;
    const result = score(sample, timeline);
    result.elapsedSeconds = Number(elapsedSeconds.toFixed(3));
    result.realTimeFactor = timeline.duration > 0 ? Number((elapsedSeconds / timeline.duration).toFixed(3)) : null;
    results.push(result);
    process.stderr.write(`  定位 ${result.alignedLines}/${result.lineCount} 句；耗時 ${result.elapsedSeconds} 秒。\n`);
  }

  const summary = aggregate(results);
  const report = {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    engine: path.relative(root, engine),
    model: path.relative(root, model),
    aggregate: summary,
    breakdown: {
      language: breakdown(results, 'language'),
      genre: breakdown(results, 'genre'),
      vocal: breakdown(results, 'vocal'),
    },
    samples: results.map(({ _wordErrors, ...sample }) => sample),
  };
  const output = option('--output');
  const json = JSON.stringify(report, null, 2) + '\n';
  if (output) {
    const target = path.resolve(output);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, json);
    process.stderr.write(`\n評估報告已寫入 ${target}\n`);
  } else {
    process.stdout.write(json);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
