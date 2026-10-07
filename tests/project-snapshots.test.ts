import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { makeClip, newProject, uid } from '../shared/model';
import { Library } from '../server/library';
import { Projects } from '../server/projects';
import { SNAPSHOT_INTERVAL_MS, SNAPSHOT_LIMIT } from '../server/project-snapshots';

test('snapshots throttle automatic saves, retain ten newest and restore an independent project with media references',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-snapshots-')),library=new Library(root);
 let time=Date.now();const projects=new Projects(root,library,()=>new Date(time));
 try{
  const p=newProject();p.mediaIds=[uid()];p.clips=[makeClip({kind:'shape',trackId:'main',start:0,duration:90})];await projects.save(p);
  const edited={...p,name:'edited'};await projects.save(edited);let rows=await projects.snapshots.list(p.id);assert.equal(rows.length,1);assert.equal(rows[0].name,p.name);
  await projects.save({...edited,name:'edited again'});assert.equal((await projects.snapshots.list(p.id)).length,1);
  time+=SNAPSHOT_INTERVAL_MS;await projects.save({...edited,name:'latest'});rows=await projects.snapshots.list(p.id);assert.equal(rows.length,2);assert.equal(rows[0].name,'edited again');
  for(let i=0;i<12;i++)await projects.createSnapshot(p.id);rows=await projects.snapshots.list(p.id);assert.equal(rows.length,SNAPSHOT_LIMIT);assert.equal(rows[0].reason,'manual');
  assert.equal((await fs.readdir(path.join(root,'snapshots',p.id))).length,SNAPSHOT_LIMIT);
  const restored=await projects.restoreSnapshot(p.id,rows[0].id);assert.notEqual(restored.id,p.id);assert.equal(restored.name,'latest · 還原');assert.deepEqual(restored.clips,p.clips);assert.deepEqual(restored.mediaIds,p.mediaIds);assert.equal((await projects.read(p.id)).name,'latest');
  await projects.save({...restored,clips:[]});assert.deepEqual((await projects.read(p.id)).clips,p.clips);
  const old=rows.at(-1)!.id;await projects.createSnapshot(p.id);await assert.rejects(()=>projects.snapshots.read(p.id,old));
  await assert.rejects(()=>projects.snapshots.read(p.id,'../bad'));await assert.rejects(()=>projects.restoreSnapshot(uid(),rows[0].id));
 }finally{library.close();await fs.rm(root,{recursive:true,force:true});}
});

test('corrupt or missing primary files recover visibly, preserve a valid backup and can fall back to snapshots',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-recovery-')),library=new Library(root),projects=new Projects(root,library);
 try{
  const p=newProject();p.name='recover me';await projects.save(p);await projects.createSnapshot(p.id);await projects.save({...p,name:'newer'});
  const file=path.join(root,'projects',p.id+'.json');await fs.writeFile(file,'broken');assert.equal((await projects.list())[0].recoveredFrom,'backup');assert.equal((await projects.read(p.id)).name,p.name);
  await projects.save({...p,name:'recovered edit'});assert.equal(JSON.parse(await fs.readFile(file+'.bak','utf8')).name,p.name);assert.equal((await projects.list())[0].recoveredFrom,undefined);
  await fs.rm(file);assert.equal((await projects.list())[0].recoveredFrom,'backup');await projects.save({...p,name:'after missing primary'});
  await fs.writeFile(file,'broken');await fs.writeFile(file+'.bak','broken too');assert.equal((await projects.list())[0].recoveredFrom,'snapshot');assert.equal((await projects.read(p.id)).name,p.name);
  await projects.move(p.id);assert.equal((await projects.list()).length,0);assert.equal((await projects.list(true)).length,1);await projects.move(p.id,true);assert.equal((await projects.snapshots.list(p.id)).length,1);
  await fs.writeFile(path.join(root,'snapshots',p.id,uid()+'.json'),'corrupt');assert.equal((await projects.snapshots.list(p.id)).length,1);
 }finally{library.close();await fs.rm(root,{recursive:true,force:true});}
});
