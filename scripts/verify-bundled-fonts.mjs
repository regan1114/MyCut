import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { sha256 } from './native-downloads.mjs';

export async function verifyBundledFonts(unpacked){
  const root=path.join(unpacked,'public/fonts');
  const fonts=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
  assert.deepEqual(fonts,JSON.parse(await fs.readFile('public/fonts/manifest.json','utf8')));
  assert.ok((await fs.readFile(path.join(root,'fonts.css'))).equals(await fs.readFile('public/fonts/fonts.css')));
  for(const font of fonts){
    assert.equal(await sha256(path.join(root,font.file)),font.sha256,font.id);
    assert.ok((await fs.readFile(path.join(root,font.license))).equals(await fs.readFile(path.join('public/fonts',font.license))),`${font.id} license`);
  }
  return fonts.length;
}
