import { projectWithOverlay } from './fixtures/project';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createCanvas } from '@napi-rs/canvas';
import { makeClip, uid } from '../shared/model';
import { defaultEffects } from '../shared/effects';
import { Library } from '../server/library';
import { Projects } from '../server/projects';
import { PortableProjects } from '../server/portable';

test('portable project restores original assets to an isolated library without the original paths',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-portable-')),from=new Library(path.join(root,'source')),to=new Library(path.join(root,'destination'));
  try{await from.init();await to.init();const image=path.join(root,'原始素材.png');const canvas=createCanvas(64,64);canvas.getContext('2d').fillRect(0,0,64,64);const pixels=canvas.toBuffer('image/png');await fs.writeFile(image,pixels);
    const m=await from.import(image,false,'旅行 中文.png'),p=projectWithOverlay(),groupId=uid();p.clips=[makeClip({kind:'image',mediaId:m.id,trackId:'main',start:0,duration:60,groupId}),makeClip({kind:'image',mediaId:m.id,trackId:'overlay',start:30,duration:30,groupId})];p.tracks.unshift({id:'fx',kind:'effect',name:'特效',hidden:false,locked:false,muted:false});p.clips.push(makeClip({kind:'effect',trackId:'fx',start:15,duration:30,effects:{...defaultEffects(),enabled:['rain']}}));
    const pack=new PortableProjects(from,new Projects(from.root,from)),file=path.join(root,'旅行.mycutpack');assert.equal(await pack.export(p,file),true);const packed=await fs.readFile(file),prefix=Buffer.from('MYCUTPACK\x00\x01\n'),length=packed.readUInt32BE(prefix.length),legacyHeader=JSON.parse(packed.subarray(prefix.length+4,prefix.length+4+length).toString());delete legacyHeader.fonts;const legacy=Buffer.from(JSON.stringify(legacyHeader)),legacySize=Buffer.alloc(4);legacySize.writeUInt32BE(legacy.length);await fs.writeFile(file,Buffer.concat([prefix,legacySize,legacy,createHash('sha256').update(legacy).digest(),packed.subarray(prefix.length+4+length+32)]));await fs.rm(image);const targetProjects=new Projects(to.root,to),restore=new PortableProjects(to,targetProjects);const restored=await restore.import(file);
    assert.notEqual(restored.id,p.id);assert.equal(to.records.length,1);assert.notEqual(restored.clips[0].mediaId,m.id);assert.equal(restored.clips[0].mediaId,restored.clips[1].mediaId);assert.equal(restored.clips[0].groupId,groupId);assert.deepEqual(restored.clips[2].effects,p.clips[2].effects);assert.equal(to.records[0].owned,true);assert.ok(to.records[0].path.startsWith(to.root));assert.deepEqual(await fs.readFile(to.records[0].path),pixels);assert.equal((await targetProjects.list()).length,1);assert.equal(restore.status.progress,1);
    const again=await restore.import(file);assert.notEqual(again.id,restored.id);assert.notEqual(again.clips[0].mediaId,restored.clips[0].mediaId);assert.equal(to.records.length,2);
    const bad=path.join(root,'broken.mycutpack'),bytes=await fs.readFile(file);bytes[bytes.length-1]^=1;await fs.writeFile(bad,bytes);await assert.rejects(()=>restore.import(bad),/校驗失敗/);assert.equal(to.records.length,2);assert.equal((await fs.readdir(path.join(to.root,'media'))).length,2);assert.equal((await targetProjects.list()).length,2);
    await fs.writeFile(bad,bytes.subarray(0,-10));await assert.rejects(()=>restore.import(bad),/長度不符/);await fs.writeFile(bad,'not a project');await assert.rejects(()=>restore.import(bad),/有效/);
    await assert.rejects(()=>pack.export(p,file),/找不到素材/);assert.notEqual((await fs.stat(file)).size,0);
  }finally{from.close();to.close();await fs.rm(root,{recursive:true,force:true});}
});
test('canceling a large portable export preserves the destination and removes partial output',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-pack-cancel-')),library=new Library(root);
  try{await library.init();const source=path.join(root,'large.raw');const handle=await fs.open(source,'w');await handle.truncate(256*1024**2);await handle.close();const id=uid();library.records.push({id,name:'large.raw',path:source,owned:false,kind:'video',duration:3600,width:1920,height:1080,hasAudio:false,size:256*1024**2});const p=projectWithOverlay();p.clips=[makeClip({kind:'video',mediaId:id,trackId:'main',start:0,duration:108000})];const pack=new PortableProjects(library,new Projects(root,library)),destination=path.join(root,'saved.mycutpack');await fs.writeFile(destination,'keep existing');const task=pack.export(p,destination);const cancel=setInterval(()=>{if(pack.status.progress>0)pack.cancel();},1);try{await assert.rejects(()=>task,/取消/);}finally{clearInterval(cancel);}assert.equal(await fs.readFile(destination,'utf8'),'keep existing');assert.equal((await fs.readdir(root)).some(name=>name.endsWith('.partial')),false);assert.equal(pack.isRunning,false);
  }finally{library.close();await fs.rm(root,{recursive:true,force:true});}
});

test('portable project retains imported bin assets that have not been added to the timeline',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-portable-bin-')),source=new Library(path.join(root,'source')),target=new Library(path.join(root,'target'));
  try{await source.init();await target.init();const file=path.join(root,'unused.png');await fs.writeFile(file,createCanvas(32,32).toBuffer('image/png'));
    const m=await source.import(file),p=projectWithOverlay();p.mediaIds=[m.id];const pack=path.join(root,'bin.mycutpack');await new PortableProjects(source,new Projects(source.root,source)).export(p,pack);await fs.rm(file);
    const restored=await new PortableProjects(target,new Projects(target.root,target)).import(pack);assert.equal(restored.clips.length,0);assert.equal(restored.mediaIds.length,1);assert.notEqual(restored.mediaIds[0],m.id);assert.equal(target.get(restored.mediaIds[0]).name,'unused.png');
  }finally{source.close();target.close();await fs.rm(root,{recursive:true,force:true});}
});

test('portable packs carry used custom fonts into a fresh library, repair missing fonts and reject corrupt font bytes',async()=>{
  const {CustomFonts}=await import('../server/custom-fonts'),{renderTextPng}=await import('../server/text-render');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-pack-fonts-')),source=new Library(path.join(root,'source')),target=new Library(path.join(root,'target'));
  try{
    await source.init();await target.init();const fontRoot=path.resolve('public/fonts'),bundled=JSON.parse(await fs.readFile(path.join(fontRoot,'manifest.json'),'utf8')),sourceFonts=[...bundled],targetFonts=[...bundled],sf=new CustomFonts(source.root,sourceFonts),tf=new CustomFonts(target.root,targetFonts);await sf.init();await tf.init();
    const fontBytes=await fs.readFile(path.join(fontRoot,bundled.find((f:{id:string})=>f.id==='huninn').file)),font=await sf.import(fontBytes,'我的字型.ttf');await sf.import(await fs.readFile(path.join(fontRoot,bundled.find((f:{id:string})=>f.id==='montserrat').file)),'未使用.ttf');
    const p=projectWithOverlay();p.clips=[makeClip({kind:'text',trackId:'text',start:0,duration:60,text:'字型跨電腦',fontId:font.id,textOutline:4,fontSize:70})];p.tracks.find(t=>t.id==='text')!.textStyle={fontId:font.id};
    const file=path.join(root,'fonts.mycutpack'),pack=new PortableProjects(source,new Projects(source.root,source),sf);await pack.export(p,file);const bytes=await fs.readFile(file);const magicLength=Buffer.from('MYCUTPACK\x00\x01\n').length,headerLength=bytes.readUInt32BE(magicLength),header=JSON.parse(bytes.subarray(magicLength+4,magicLength+4+headerLength).toString());assert.equal(header.version,2);assert.equal(header.fonts.length,1);
    const projects=new Projects(target.root,target),restore=new PortableProjects(target,projects,tf),restored=await restore.import(file);assert.equal(restored.clips[0].fontId,font.id);assert.equal(targetFonts.filter(f=>f.custom).length,1);assert.deepEqual(await fs.readFile(tf.file(font.id)),fontBytes);assert.deepEqual(renderTextPng(restored.clips[0],640,180,targetFonts,fontRoot,1920),renderTextPng(p.clips[0],640,180,sourceFonts,fontRoot,1920));
    await fs.rm(tf.file(font.id));const restartedFonts=[...bundled],restarted=new CustomFonts(target.root,restartedFonts);await restarted.init();assert.equal(restartedFonts.find(f=>f.id===font.id).missing,true);await new PortableProjects(target,projects,restarted).import(file);assert.equal(restartedFonts.find(f=>f.id===font.id).missing,undefined);
    const bad=path.join(root,'bad-font.mycutpack'),corrupt=Buffer.from(bytes);corrupt[corrupt.length-40]^=1;await fs.writeFile(bad,corrupt);const count=(await projects.list()).length;await assert.rejects(()=>restore.import(bad),/校驗失敗/);assert.equal((await projects.list()).length,count);
    await fs.rm(sf.file(font.id));await assert.rejects(()=>pack.export(p,file),/重新匯入/);assert.deepEqual(await fs.readFile(file),bytes);await sf.import(fontBytes,'再次匯入.ttf');assert.deepEqual(await fs.readFile(sf.file(font.id)),fontBytes);
  }finally{source.close();target.close();await fs.rm(root,{recursive:true,force:true});}
});
