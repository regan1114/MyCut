import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './native-downloads.mjs';
import { basePython, inspectPython, pythonEnvironment } from './lyrics-python.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const platform = process.platform;
const arch = process.arch;
if (!['darwin', 'win32'].includes(platform) || !['x64', 'arm64'].includes(arch))
  throw new Error(`不支援的本機對齊建置目標：${platform}-${arch}`);
const base = basePython(root);
const { directory: envRoot, python } = pythonEnvironment(root, base.minor);
await fs.mkdir(path.dirname(envRoot), { recursive: true });

try {
  await fs.access(python);
} catch {
  await run(base.command, [...base.args, '-m', 'venv', envRoot]);
}
const environment = inspectPython(python);
if (environment.minor !== base.minor) throw new Error(`建置環境版本不符：${python} 是 ${environment.version}，要求 ${base.minor}。`);

await run(python, [
  '-m',
  'pip',
  'install',
  '--disable-pip-version-check',
  '--no-warn-script-location',
  '-r',
  path.join(root, 'tools/lyrics-aligner/alignment-build-requirements.txt'),
]);
await run(python, ['-m', 'pip', 'check']);
console.log(`本機對齊建置環境已準備（Python ${environment.version}）：${envRoot}`);
