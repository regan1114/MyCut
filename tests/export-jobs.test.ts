import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Jobs } from '../server/jobs';
import { Library } from '../server/library';
import { makeClip, newProject, type ExportSettings } from '../shared/model';

const settings:ExportSettings={resolution:720,quality:'standard',encoder:'libx264'};
const project=(seconds:number)=>{const p=newProject();p.clips=[makeClip({kind:'shape',trackId:'main',start:0,duration:p.fps*seconds})];return p;};
async function waitFor(check:()=>boolean){const until=Date.now()+30000;while(!check()){assert.ok(Date.now()<until,'export timed out');await new Promise(resolve=>setTimeout(resolve,20));}}

test('exports do not restore or write history; cancellation stops rendering and clears partial work',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-export-jobs-')),library=new Library(root),jobs=new Jobs(path.join(root,'exports'),library,[],path.resolve('public/fonts'));
 try{
  await library.init();const legacy=path.join(jobs.root,'legacy');await fs.mkdir(legacy,{recursive:true});await fs.writeFile(path.join(legacy,'job.json'),JSON.stringify({id:'legacy',status:'completed'}));await fs.writeFile(path.join(legacy,'output.mp4'),'existing movie');
  await jobs.init();assert.deepEqual(jobs.list(),[]);
  const active=await jobs.create(project(300),settings),queued=await jobs.create(project(1),settings);
  assert.equal(queued.status,'queued');await jobs.remove(queued.id);assert.equal(jobs.get(active.id).id,active.id);assert.equal(jobs.isRunning,true);
  await waitFor(()=>active.progress>0);assert.equal(await fs.stat(path.join(jobs.dir(active),'job.json')).catch(()=>null),null);
  await jobs.remove(active.id);assert.equal(jobs.isRunning,false);assert.deepEqual(jobs.list(),[]);assert.equal(await fs.stat(jobs.dir(active)).catch(()=>null),null);assert.equal(await fs.stat(jobs.dir(queued)).catch(()=>null),null);
  await jobs.remove(active.id);assert.equal(await fs.readFile(path.join(legacy,'output.mp4'),'utf8'),'existing movie');
  const next=await jobs.create(project(1),settings);await waitFor(()=>!jobs.isRunning);assert.equal(next.status,'completed',next.error);
  const output=path.join(jobs.dir(next),'output.mp4');assert.ok((await fs.stat(output)).size>100);await jobs.remove(next.id);assert.deepEqual(jobs.list(),[]);assert.ok((await fs.stat(output)).size>100);
  const restarted=new Jobs(jobs.root,library,[],path.resolve('public/fonts'));await restarted.init();assert.deepEqual(restarted.list(),[]);
 }finally{for(const job of jobs.list())await jobs.remove(job.id);jobs.close();library.close();await fs.rm(root,{recursive:true,force:true});}
});

test('chosen destination is saved before completion; cancellation preserves existing file and save failures can retry',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-export-save-')),library=new Library(root),jobs=new Jobs(path.join(root,'exports'),library,[],path.resolve('public/fonts')),destination=path.join(root,'影片.mp4');
 try{
  await library.init();await jobs.init();await fs.writeFile(destination,'existing movie');
  const canceled=await jobs.create(project(300),settings,destination);await waitFor(()=>canceled.progress>0);await jobs.remove(canceled.id);assert.equal(await fs.readFile(destination,'utf8'),'existing movie');
  const saved=await jobs.create(project(1),settings,destination);await waitFor(()=>!jobs.isRunning);assert.equal(saved.status,'completed',saved.error);assert.equal(saved.savedPath,destination);assert.deepEqual(await fs.readFile(destination),await fs.readFile(path.join(jobs.dir(saved),'output.mp4')));await jobs.remove(saved.id);assert.ok((await fs.stat(destination)).size>100);
  const folder=path.join(root,'unmounted'),retry=await jobs.create(project(1),settings,path.join(folder,'retry.mp4'));await waitFor(()=>!jobs.isRunning);assert.equal(retry.status,'failed');assert.match(retry.error!,/儲存失敗/);assert.equal(retry.savedPath,undefined);await fs.mkdir(folder);await jobs.resume(retry.id);await waitFor(()=>!jobs.isRunning);assert.equal(retry.status,'completed',retry.error);assert.ok((await fs.stat(retry.savedPath!)).size>100);assert.deepEqual(await fs.readdir(folder),['retry.mp4']);
 }finally{for(const job of jobs.list())await jobs.remove(job.id);jobs.close();library.close();await fs.rm(root,{recursive:true,force:true});}
});
