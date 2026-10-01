import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { run } from './native-downloads.mjs';
import { basePython, inspectPython, pythonEnvironment } from './lyrics-python.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const platform = process.argv[2] || process.platform;
const arch = process.argv[3] || process.arch;
if (platform !== process.platform || arch !== process.arch)
  throw new Error(`對齊引擎須在目標平台原生建置；目前 ${process.platform}-${process.arch}，要求 ${platform}-${arch}。`);

let python = process.env.MYCUT_ALIGNMENT_BUILD_PYTHON;
let expectedMinor;
if (!python) {
  const base = basePython(root);
  expectedMinor = base.minor;
  python = pythonEnvironment(root, base.minor).python;
  try {
    await fs.access(python);
  } catch {
    await run(process.execPath, [path.join(root, 'scripts/setup-lyrics-aligner.mjs')], { env: { ...process.env, PYTHON: base.executable } });
  }
}
const pythonInfo = inspectPython(python);
if (expectedMinor && pythonInfo.minor !== expectedMinor) throw new Error(`建置環境版本不符：要求 ${expectedMinor}，目前是 ${pythonInfo.version}。`);

const source = path.join(root, 'tools/lyrics-aligner/worker.py');
const target = path.join(root, 'resources/lyrics-alignment', `${platform}-${arch}`);
const work = path.join(root, '.build-tools', `pyinstaller-work-${platform}-${arch}`);
const dist = path.join(target, 'mycut-aligner');
const binary = path.join(dist, platform === 'win32' ? 'mycut-aligner.exe' : 'mycut-aligner');
const stamp = path.join(target, 'build-manifest.json');
const fingerprint = createHash('sha256');
for (const file of [
  source,
  path.join(root, 'tools/lyrics-aligner/alignment-runtime-requirements.txt'),
  path.join(root, 'tools/lyrics-aligner/alignment-build-requirements.txt'),
  fileURLToPath(import.meta.url),
  path.join(root, 'scripts/lyrics-python.mjs'),
]) fingerprint.update(await fs.readFile(file));
fingerprint.update(`${python}\n${pythonInfo.version}\nPyInstaller 6.15.0\n${platform}-${arch}`);
const buildHash = fingerprint.digest('hex');
try {
  const previous = JSON.parse(await fs.readFile(stamp, 'utf8'));
  await fs.access(binary);
  if (previous.sha256 === buildHash) {
    console.log(`MyCut 本機原稿對齊引擎已是目前版本：${binary}`);
    process.exit(0);
  }
} catch {}
await fs.rm(dist, { recursive: true, force: true });
await fs.rm(work, { recursive: true, force: true });
await fs.mkdir(target, { recursive: true });

const pythonPath = path.join(root, `.build-tools/pyinstaller-${pythonInfo.minor}`);
let extraPythonPath = process.env.PYTHONPATH || '';
try {
  await run(python, ['-c', 'import PyInstaller'], { stdio: 'ignore' });
} catch {
  const pipTarget = pythonPath;
  try {
    await run(python, ['-c', 'import PyInstaller'], {
      stdio: 'ignore',
      env: { ...process.env, PYTHONPATH: [pipTarget, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter) },
    });
  } catch {
    await run(python, [
      '-m', 'pip', 'install', '--disable-pip-version-check', '--no-warn-script-location',
      '--target', pipTarget, 'PyInstaller==6.15.0', 'pyinstaller-hooks-contrib==2026.7',
    ]);
  }
  extraPythonPath = [pipTarget, extraPythonPath].filter(Boolean).join(path.delimiter);
}

const args = [
  '-m', 'PyInstaller', '--noconfirm', '--clean', '--onedir',
  '--name', 'mycut-aligner', '--distpath', target, '--workpath', work,
  '--specpath', path.join(root, '.build-tools'),
  '--collect-data', 'stable_whisper',
  '--collect-all', 'whisper',
  '--collect-all', 'torchaudio',
  '--collect-all', 'opencc',
  '--collect-all', 'tiktoken',
  '--exclude-module', 'transformers',
  '--hidden-import', 'tiktoken_ext.openai_public',
  '--hidden-import', 'tiktoken_ext',
  source,
];
const env = { ...process.env };
if (extraPythonPath) env.PYTHONPATH = extraPythonPath;
const localCache = path.join(root, '.build-tools/cache');
env.PYINSTALLER_CONFIG_DIR = path.join(localCache, 'pyinstaller');
env.HF_HOME = path.join(localCache, 'huggingface');
env.TRANSFORMERS_CACHE = path.join(localCache, 'transformers');
env.TORCH_HOME = path.join(localCache, 'torch');
env.XDG_CACHE_HOME = path.join(localCache, 'xdg');
await fs.mkdir(env.PYINSTALLER_CONFIG_DIR, { recursive: true });
await run(python, args, { cwd: root, env });
await fs.access(binary);
if (platform !== 'win32') await fs.chmod(binary, 0o755);
await fs.writeFile(stamp, JSON.stringify({ target: `${platform}-${arch}`, pythonVersion: pythonInfo.version, sha256: buildHash }, null, 2) + '\n');
console.log(`MyCut 本機原稿對齊引擎已建置：${binary}`);
