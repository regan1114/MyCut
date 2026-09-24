import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { makeClip, newProject, uid } from '../shared/model';
import { defaultEffects } from '../shared/effects';
import { Library } from '../server/library';
import { Projects } from '../server/projects';
import { PortableProjects } from '../server/portable';

test('portable project restores original assets to an isolated library without the original paths',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-portable-')),from=new Library(path.join(root,'source')),to=new Library(path.join(root,'destination'));
  try{await from.init();await to.init();const image=path.join(root,'原始素材.png');const canvas=createCanvas(64,64);canvas.getContext('2d').fillRect(0,0,64,64);const pixels=canvas.toBuffer('image/png');await fs.writeFile(image,pixels);
    const m=await from.import(image,false,'旅行 中文.png'),p=newProject(),groupId=uid();p.clips=[makeClip({kind:'image',mediaId:m.id,trackId:'main',start:0,duration:60,groupId}),makeClip({kind:'image',mediaId:m.id,trackId:'overlay',start:30,duration:30,groupId})];p.tracks.unshift({id:'fx',kind:'effect',name:'特效',hidden:false,locked:false,muted:false});p.clips.push(makeClip({kind:'effect',trackId:'fx',start:15,duration:30,effects:{...defaultEffects(),enabled:['rain']}}));
    const pack=new PortableProjects(from,new Projects(from.root,from)),file=path.join(root,'旅行.mycutpack');assert.equal(await pack.export(p,file),true);await fs.rm(image);const targetProjects=new Projects(to.root,to),restore=new PortableProjects(to,targetProjects);const restored=await restore.import(file);
    assert.notEqual(restored.id,p.id);assert.equal(to.records.length,1);assert.notEqual(restored.clips[0].mediaId,m.id);assert.equal(restored.clips[0].mediaId,restored.clips[1].mediaId);assert.equal(restored.clips[0].groupId,groupId);assert.deepEqual(restored.clips[2].effects,p.clips[2].effects);assert.equal(to.records[0].owned,true);assert.ok(to.records[0].path.startsWith(to.root));assert.deepEqual(await fs.readFile(to.records[0].path),pixels);assert.equal((await targetProjects.list()).length,1);assert.equal(restore.status.progress,1);
    const again=await restore.import(file);assert.notEqual(again.id,restored.id);assert.notEqual(again.clips[0].mediaId,restored.clips[0].mediaId);assert.equal(to.records.length,2);
    const bad=path.join(root,'broken.mycutpack'),bytes=await fs.readFile(file);bytes[bytes.length-1]^=1;await fs.writeFile(bad,bytes);await assert.rejects(()=>restore.import(bad),/校驗失敗/);assert.equal(to.records.length,2);assert.equal((await fs.readdir(path.join(to.root,'media'))).length,2);assert.equal((await targetProjects.list()).length,2);
    await fs.writeFile(bad,bytes.subarray(0,-10));await assert.rejects(()=>restore.import(bad),/長度不符/);await fs.writeFile(bad,'not a project');await assert.rejects(()=>restore.import(bad),/有效/);
    await assert.rejects(()=>pack.export(p,file),/找不到素材/);assert.notEqual((await fs.stat(file)).size,0);
  }finally{from.close();to.close();await fs.rm(root,{recursive:true,force:true});}
});
test('canceling a large portable export preserves the destination and removes partial output',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-pack-cancel-')),library=new Library(root);
  try{await library.init();const source=path.join(root,'large.raw');const handle=await fs.open(source,'w');await handle.truncate(256*1024**2);await handle.close();const id=uid();library.records.push({id,name:'large.raw',path:source,owned:false,kind:'video',duration:3600,width:1920,height:1080,hasAudio:false,size:256*1024**2});const p=newProject();p.clips=[makeClip({kind:'video',mediaId:id,trackId:'main',start:0,duration:108000})];const pack=new PortableProjects(library,new Projects(root,library)),destination=path.join(root,'saved.mycutpack');await fs.writeFile(destination,'keep existing');const task=pack.export(p,destination);const cancel=setInterval(()=>{if(pack.status.progress>0)pack.cancel();},1);try{await assert.rejects(()=>task,/取消/);}finally{clearInterval(cancel);}assert.equal(await fs.readFile(destination,'utf8'),'keep existing');assert.equal((await fs.readdir(root)).some(name=>name.endsWith('.partial')),false);assert.equal(pack.isRunning,false);
  }finally{library.close();await fs.rm(root,{recursive:true,force:true});}
});
