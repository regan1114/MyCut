import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifestPath = path.join(root, 'resources/lyrics-alignment/models/manifest.json');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of await fs.open(file).then((handle) => handle.createReadStream()))
    hash.update(chunk);
  return hash.digest('hex');
}

const modelDir = path.dirname(manifestPath);
for (const model of manifest.models) {
  const output = path.join(modelDir, model.file);
  await fs.mkdir(path.dirname(output), { recursive: true });
  try {
    if ((await sha256(output)) === model.sha256) {
      console.log(`模型已通過 SHA-256：${model.file}`);
      continue;
    }
  } catch {}

  const temporary = `${output}.download`;
  await fs.rm(temporary, { force: true });
  console.log(`下載 MyCut 原稿對齊模型：${model.file}`);
  const response = await fetch(model.url, { redirect: 'follow' });
  if (!response.ok || !response.body)
    throw new Error(`下載模型失敗 (${response.status})：${model.url}`);
  await pipeline(Readable.fromWeb(response.body), await fs.open(temporary, 'w').then((handle) => handle.createWriteStream()));
  const actual = await sha256(temporary);
  if (actual !== model.sha256) {
    await fs.rm(temporary, { force: true });
    throw new Error(`模型 SHA-256 不符：${model.file}，預期 ${model.sha256}，實際 ${actual}`);
  }
  await fs.rm(output, { force: true });
  await fs.rename(temporary, output);
}
