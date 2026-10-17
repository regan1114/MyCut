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

test('missing and corrupt font files fall back safely and reimport repairs the original id and label',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-missing-font-'));
  try{
    const bytes=await fs.readFile(path.join(fontRoot,bundled.find(f=>f.id==='huninn')!.file)),initial=[...bundled],original=new CustomFonts(root,initial);await original.init();const font=await original.import(bytes,'原來的字型.ttf');
    for(const failure of ['missing','corrupt']){
      if(failure==='missing')await fs.rm(original.file(font.id));else await fs.writeFile(original.file(font.id),'broken');
      const fonts=[...bundled],store=new CustomFonts(root,fonts);await assert.doesNotReject(()=>store.init());const fallback=fonts.find(f=>f.id===font.id)!;assert.equal(fallback.missing,true);assert.equal(fallback.family,'Noto Sans TC');assert.throws(()=>store.packageEntry(font.id),/重新匯入/);
      const c=makeClip({kind:'text',trackId:'text',start:0,duration:90,text:'字型遺失',fontId:font.id});assert.deepEqual(renderTextPng(c,640,180,fonts,fontRoot,1920),renderTextPng({...c,fontId:'notosanstc'},640,180,fonts,fontRoot,1920));
      const repaired=await store.import(bytes,'改名後.ttf');assert.equal(repaired.id,font.id);assert.equal(repaired.label,'原來的字型');assert.equal(repaired.missing,undefined);assert.equal(fonts.length,41);assert.ok(store.packageEntry(font.id));
    }
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('a damaged custom font manifest is preserved and does not stop startup',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-font-manifest-'));
  try{const store=new CustomFonts(root,[...bundled]);await store.init();const file=path.join(store.root,'manifest.json');await fs.writeFile(file,'broken manifest');const fonts=[...bundled];await assert.doesNotReject(()=>new CustomFonts(root,fonts).init());assert.equal(fonts.length,bundled.length);assert.equal(await fs.readFile(file+'.corrupt','utf8'),'broken manifest');}finally{await fs.rm(root,{recursive:true,force:true});}
});
