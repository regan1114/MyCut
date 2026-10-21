import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {createCanvas} from '@napi-rs/canvas';
import {Library} from '../server/library';
import {Jobs} from '../server/jobs';
import {Storage} from '../server/storage';
import {newProject,makeClip} from '../shared/model';
test('cleanup removes disposable exports and proxies, preserving active jobs, media and projects',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-storage-')),library=new Library(root),jobs=new Jobs(path.join(root,'exports'),library,[],path.resolve('public/fonts'));
 try{await library.init();await jobs.init();const original=path.join(root,'media','logo.png');await fs.writeFile(original,createCanvas(20,20).toBuffer('image/png'));const media=await library.import(original,true);const proxy=path.join(root,'cache',`${media.id}.proxy.mp4`);await fs.writeFile(proxy,Buffer.alloc(120));media.proxyStatus='ready';media.proxy=`/media/${media.id}/proxy`;const thumbnail=path.join(root,'cache',`${media.id}.jpg`);await fs.writeFile(thumbnail,'thumbnail');
 const stale=path.join(jobs.root,randomUUID()),referenced=path.join(jobs.root,randomUUID());await fs.mkdir(stale);await fs.mkdir(referenced);await fs.writeFile(path.join(stale,'output.mp4'),Buffer.alloc(200));await fs.copyFile(original,path.join(referenced,'original.png'));await library.import(path.join(referenced,'original.png'));
 const p=newProject();p.clips=[makeClip({kind:'shape',trackId:'main',start:0,duration:9000})];const active=await jobs.create(p,{resolution:720,quality:'standard',encoder:'libx264'});await jobs.pause(active.id);await fs.writeFile(path.join(jobs.dir(active),'keep'),'paused');
 const projects=path.join(root,'projects','test','logos');await fs.mkdir(projects,{recursive:true});await fs.writeFile(path.join(projects,'logo.png'),'keep logo');
 const storage=new Storage(library,jobs),info=await storage.info();assert.equal(info.folders.reduce((n,f)=>n+f.bytes,0),320);const result=await storage.clear();assert.equal(result.freedBytes,320);assert.equal(await fs.stat(stale).catch(()=>null),null);assert.equal(await fs.stat(proxy).catch(()=>null),null);assert.equal(media.proxy,undefined);assert.equal(media.proxyStatus,undefined);assert.equal(await fs.readFile(thumbnail,'utf8'),'thumbnail');assert.equal(await fs.readFile(path.join(jobs.dir(active),'keep'),'utf8'),'paused');assert.ok(await fs.stat(path.join(referenced,'original.png')));assert.ok(await fs.stat(original));assert.equal(await fs.readFile(path.join(projects,'logo.png'),'utf8'),'keep logo');assert.equal((await storage.clear()).freedBytes,0);
 }finally{for(const j of jobs.list())await jobs.remove(j.id);jobs.close();library.close();await fs.rm(root,{recursive:true,force:true});}
});
