import test from 'node:test';
import assert from 'node:assert/strict';
import { unpackedPath, safeFileName, availableEncoders, requireEncoder, shortcutLabel } from '../shared/platform';

test('native paths resolve outside ASAR on both systems without changing other segments',()=>{
  for(const [input,expected] of [
    ['/Applications/MyCut.app/Contents/Resources/app.asar/public/fonts','/Applications/MyCut.app/Contents/Resources/app.asar.unpacked/public/fonts'],
    [String.raw`C:\Users\王小明\AppData\Local\MyCut\resources\app.asar\resources\speech`,String.raw`C:\Users\王小明\AppData\Local\MyCut\resources\app.asar.unpacked\resources\speech`],
    [String.raw`\\server\share\My Cut\app.asar\ffmpeg.exe`,String.raw`\\server\share\My Cut\app.asar.unpacked\ffmpeg.exe`],
    ['/someapp.asar/tool','/someapp.asar/tool'],
    ['/app.asar.unpacked/tool','/app.asar.unpacked/tool'],
  ])assert.equal(unpackedPath(input),expected);
});

test('export names are valid on Windows while preserving Chinese and spaces',()=>{
  assert.equal(safeFileName('夏天的 回憶'),'夏天的 回憶');
  assert.equal(safeFileName('a:b/c\\d*e?f"g<h>i|j'),'a_b_c_d_e_f_g_h_i_j');
  for(const name of ['CON','nul.txt','COM1','LPT9','aux','COM¹'])assert.equal(safeFileName(name),'_'+name);
  assert.equal(safeFileName(' .. '),'MyCut');
  assert.equal(safeFileName('旅行. '),'旅行');
  assert.equal(safeFileName('a'.repeat(200)).length,120);
});

test('Windows only offers supported encoders and uses Ctrl shortcut labels',()=>{
  assert.deepEqual(availableEncoders('win32'),['libx264']);
  assert.ok(availableEncoders('darwin').includes('h264_videotoolbox'));
  assert.throws(()=>requireEncoder('h264_videotoolbox','win32'),/軟體編碼/);
  assert.doesNotThrow(()=>requireEncoder('libx264','win32'));
  assert.equal(shortcutLabel('win32','Z',true),'Ctrl+Shift+Z');
  assert.equal(shortcutLabel('darwin','Z',true),'⌘⇧Z');
});
