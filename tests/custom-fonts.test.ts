import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CustomFonts } from '../server/custom-fonts';
import { Preferences } from '../server/preferences';
import { renderTextPng } from '../server/text-render';
import { makeClip,type FontInfo } from '../shared/model';

const fontRoot=path.resolve('public/fonts'),bundled=JSON.parse(await fs.readFile(path.join(fontRoot,'manifest.json'),'utf8')) as FontInfo[];
test('imported fonts are deduplicated, reload with favorites and render through native exports',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-custom-fonts-'));
  try{
    const fonts=[...bundled];let store=new CustomFonts(root,fonts);await store.init();const bytes=await fs.readFile(path.join(fontRoot,bundled.find(f=>f.id==='huninn')!.file));
    const font=await store.import(bytes,'我的字型.TTF');assert.equal(font.label,'我的字型');assert.equal(font.custom,true);assert.equal(fonts.length,41);
    const duplicate=await store.import(bytes,'再次匯入.ttf');assert.equal(duplicate.id,font.id);assert.equal(fonts.length,41);
    const prefs=new Preferences(root,fonts);await prefs.init();await prefs.save({favoriteFontIds:[font.id]});
    const reloaded=[...bundled];store=new CustomFonts(root,reloaded);await store.init();assert.equal(reloaded.length,41);const loadedPrefs=new Preferences(root,reloaded);await loadedPrefs.init();assert.deepEqual(loadedPrefs.get().favoriteFontIds,[font.id]);
    const c=makeClip({kind:'text',trackId:'text',start:0,duration:90,text:'把日常剪成故事 Custom font',fontSize:100,fontId:font.id,textOutline:3});const custom=renderTextPng(c,640,180,reloaded,fontRoot,1920),expected=renderTextPng({...c,fontId:'huninn'},640,180,reloaded,fontRoot,1920),fallback=renderTextPng({...c,fontId:'notosanstc'},640,180,reloaded,fontRoot,1920);assert.deepEqual(custom,expected);assert.ok(!custom.equals(fallback));
    assert.equal(await fs.readFile(store.file(font.id)).then(b=>b.equals(bytes)),true);
    assert.throws(()=>store.import(Buffer.from('not a font'),'bad.ttf'));assert.throws(()=>store.import(bytes,'bad.png'));assert.equal(reloaded.length,41);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});
