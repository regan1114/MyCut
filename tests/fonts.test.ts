import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { defaultFontId } from '../shared/fonts';
import { Preferences } from '../server/preferences';
import { makeClip, newProject, uid, type FontInfo } from '../shared/model';
import { applyCaptions, audioSignature, type CaptionJob } from '../shared/captions';
import { renderTextPng } from '../server/text-render';

const root=path.resolve('public/fonts');
const fonts=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8')) as (FontInfo&{sha256:string})[];
test('40 bundled fonts retain OFL notices, hashes and distinct native rendering',async()=>{
  assert.equal(fonts.length,40);assert.equal(fonts.filter(f=>f.language==='繁體中文').length,10);
  const clip=makeClip({kind:'text',trackId:'text',start:0,duration:90,text:'把日常，剪成故事。 Create your story. 123',fontSize:48});
  const render=(font:FontInfo)=>renderTextPng({...clip,fontId:font.id},1400,180,fonts,root,1400);
  const fallback=render(fonts[0]);
  for(const font of fonts){
    const bytes=await fs.readFile(path.join(root,font.file));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),font.sha256,font.id);
    assert.match(await fs.readFile(path.join(root,font.license),'utf8'),/SIL OPEN FONT LICENSE Version 1\.1/,font.id);
    if(font.id!==fonts[0].id)assert.ok(!render(font).equals(fallback),`${font.id} silently fell back to Noto Sans TC`);
  }
});
test('default follows library order; favorites survive disk reload and queued changes',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-font-preferences-'));
  try{
    let prefs=new Preferences(dir,fonts);await prefs.init();assert.equal(defaultFontId(fonts,prefs.get().favoriteFontIds),fonts[0].id);
    await Promise.all([prefs.save({favoriteFontIds:['huninn']}),prefs.save({favoriteFontIds:['chenyuluoyan','huninn','huninn','removed-font']})]);
    prefs=new Preferences(dir,fonts);await prefs.init();assert.deepEqual(prefs.get().favoriteFontIds,['huninn','chenyuluoyan']);assert.equal(defaultFontId(fonts,prefs.get().favoriteFontIds),'huninn');
    assert.throws(()=>prefs.save({favoriteFontIds:'bad'}));assert.deepEqual(prefs.get().favoriteFontIds,['huninn','chenyuluoyan']);
    await prefs.save({favoriteFontIds:['chenyuluoyan']});assert.equal(defaultFontId(fonts,prefs.get().favoriteFontIds),'chenyuluoyan');
    await prefs.save({favoriteFontIds:[]});assert.equal(defaultFontId(fonts,prefs.get().favoriteFontIds),fonts[0].id);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('new automatic captions and lyrics use the preferred font without changing existing titles',()=>{
  const p=newProject();p.clips=[makeClip({kind:'text',trackId:'text',start:0,duration:90,fontId:'notoseriftc',text:'Original title'})];
  for(const mode of ['captions','lyrics'] as const){
    const job:CaptionJob={id:uid(),projectId:p.id,name:'Test',fps:p.fps,options:{mode,language:'zh',traditional:true,vocalFocus:true},signature:audioSignature(p,[]),status:'completed',stage:'done',progress:1,completedChunks:1,totalChunks:1,duration:3,createdAt:'',cueCount:1};
    const result=applyCaptions(p,job,[{id:uid(),start:0,duration:90,text:'新增字幕'}],[],'chenyuluoyan');
    assert.equal(result.clips[0].fontId,'notoseriftc');assert.equal(result.clips[1].fontId,'chenyuluoyan');assert.equal(result.clips[1].captionType,mode);
  }
});
