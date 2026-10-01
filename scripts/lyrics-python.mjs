import path from 'node:path';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

export function inspectPython(command, args = []) {
  const info = JSON.parse(execFileSync(command, [...args, '-c',
    'import json, platform, sys; print(json.dumps({"version": platform.python_version(), "implementation": platform.python_implementation(), "machine": platform.machine(), "platform": sys.platform, "executable": sys.executable}))',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  if (info.implementation !== 'CPython' || !/^3\.(9|10|11|12)\./.test(info.version))
    throw new Error(`對齊引擎需要 CPython 3.9–3.12；目前是 ${info.implementation} ${info.version}。目前固定的相依套件尚不支援 3.13 以上，請以 PYTHON 指向 Python 3.12。`);
  const arch = { x86_64: 'x64', AMD64: 'x64', arm64: 'arm64', aarch64: 'arm64' }[info.machine];
  if (info.platform !== process.platform || arch !== process.arch)
    throw new Error(`Python 必須符合建置平台 ${process.platform}-${process.arch}；目前是 ${info.platform}-${info.machine}。`);
  return { ...info, command, args, minor: info.version.split('.').slice(0, 2).join('.') };
}

export function basePython(root) {
  const configured = process.env.PYTHON;
  if (configured) return inspectPython(configured, process.platform === 'win32' && configured === 'py' ? ['-3.12'] : []);
  // Prefer the prepared 3.12 environment over an older system python3.
  const prepared = pythonEnvironment(root, '3.12').python;
  if (existsSync(prepared)) return inspectPython(prepared);
  const candidates = process.platform === 'win32'
    ? [['py', ['-3.12']], ['py', ['-3']]]
    : [['python3.12', []], ['python3', []]];
  let lastError;
  for (const [command, args] of candidates) {
    try { return inspectPython(command, args); } catch (error) { lastError = error; }
  }
  throw new Error(`找不到可用的 Python 3.9–3.12，請安裝 Python 3.12 或設定 PYTHON。${lastError?.message ?? ''}`);
}

export function pythonEnvironment(root, minor) {
  const directory = path.join(root, '.build-tools', `lyrics-aligner-${process.platform}-${process.arch}-py${minor}`);
  return { directory, python: path.join(directory, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python') };
}
