import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const { inspectPython, pythonEnvironment } = await import(new URL('../scripts/lyrics-python.mjs', import.meta.url).href);
const machine = process.arch === 'arm64' ? 'arm64' : 'x86_64';

test('Python build validation accepts 3.12, rejects incompatible versions and architectures before installation', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mycut-python-version-'));
  const probe = path.join(root, 'python.cjs');
  const inspect = async (version: string, extra = {}) => {
    const info = { version, implementation: 'CPython', platform: process.platform, machine, executable: process.execPath, ...extra };
    await fs.writeFile(probe, `console.log(${JSON.stringify(JSON.stringify(info))});`);
    return inspectPython(process.execPath, [probe]);
  };
  try {
    assert.equal((await inspect('3.12.14')).minor, '3.12');
    assert.equal((await inspect('3.9.7')).minor, '3.9');
    for (const version of ['3.8.20', '3.13.0', '3.14.0']) await assert.rejects(inspect(version), /CPython 3.9–3.12/);
    await assert.rejects(inspect('3.12.14', { implementation: 'PyPy' }), /CPython 3.9–3.12/);
    await assert.rejects(inspect('3.12.14', { machine: process.arch === 'arm64' ? 'x86_64' : 'arm64' }), /必須符合建置平台/);
    assert.notEqual(pythonEnvironment(root, '3.9').python, pythonEnvironment(root, '3.12').python);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
