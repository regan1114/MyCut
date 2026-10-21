import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Library } from '../server/library';
import { Projects } from '../server/projects';
import { VocalJobs, vocalRuntime } from '../server/vocals';
import { ffmpeg, probe } from '../server/native';
import { newProject } from '../shared/model';

const rootDir=process.cwd();
let available=true;try{vocalRuntime(rootDir);}catch{available=false;}
const sleep=()=>new Promise(resolve=>setTimeout(resolve,100));
test('missing vocal runtime gives an actionable error',()=>assert.throws(()=>vocalRuntime('/no-such-app'),/人聲分離引擎/));
test('real vocal separation imports valid audio into the original project and supports cancel',{skip:!available,timeout:180000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-vocals-')),library=new Library(root);await library.init();
 const projects=new Projects(root,library),jobs=new VocalJobs(path.join(root,'vocals'),library,projects,rootDir);await jobs.init();
 try{
  const input=path.join(root,'mixture.wav');
  await ffmpeg(['-i','tests/fixtures/original-en.wav','-f','lavfi','-i','sine=frequency=220:duration=2','-filter_complex','[0:a][1:a]amix=inputs=2:duration=shortest','-t','2','-ac','2','-ar','44100',input]);
  const source=await library.import(input),p=newProject(),other=newProject();p.mediaIds=[source.id];await projects.save(p);await projects.save(other);
  await assert.rejects(jobs.create(other.id,source.id),/不屬於/);
  source.hasAudio=false;await assert.rejects(jobs.create(p.id,source.id),/含音訊/);source.hasAudio=true;
  source.missing=true;await assert.rejects(jobs.create(p.id,source.id),/可讀取/);source.missing=false;
  const job=await jobs.create(p.id,source.id);assert.equal((await jobs.create(p.id,source.id)).id,job.id);
  while(['queued','processing'].includes(job.status))await sleep();
  assert.equal(job.status,'completed',job.error);assert.equal(job.progress,1);assert.ok(job.outputId);
  const output=library.get(job.outputId);assert.equal(output.kind,'audio');assert.equal(output.hasAudio,true);assert.match(output.name,/人聲.wav$/);
  const info=await probe(output.path);assert.ok(Math.abs(Number(info.format.duration)-2)<.02);
  assert.ok((await projects.read(p.id)).mediaIds.includes(output.id));assert.deepEqual((await projects.read(other.id)).mediaIds,[]);
  const raw=path.join(root,'voice.f32'),original=path.join(root,'input.f32');
  for(const [input,output] of [[source.path,original],[library.get(job.outputId).path,raw]])await ffmpeg(['-i',input,'-f','f32le','-ac','1','-ar','8000',output]);
  const a=await fs.readFile(raw),b=await fs.readFile(original);let energy=0,difference=0;
  for(let i=0;i<a.length;i+=4){energy+=a.readFloatLE(i)**2;difference+=(a.readFloatLE(i)-b.readFloatLE(i))**2;}
  assert.ok(energy>1e-6,'voice is not silent');assert.ok(difference>1e-6,'model actually separates rather than copies');
  const canceled=await jobs.create(p.id,source.id);await jobs.cancel(canceled.id);
  while(['queued','processing'].includes(canceled.status))await sleep();assert.equal(canceled.status,'canceled');assert.equal(canceled.outputId,undefined);
  await jobs.dismiss(job.id);assert.equal(jobs.get(job.id).dismissed,true);
  assert.deepEqual((await projects.read(p.id)).clips,[]);
 }finally{jobs.close();library.close();await fs.rm(root,{recursive:true,force:true});}
});

test('restart marks interrupted work as failed and removes unimported partial audio',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-vocal-recovery-')),library=new Library(root);await library.init();
 const projects=new Projects(root,library),dir=path.join(root,'vocals'),p=newProject(),id=p.id;
 await fs.mkdir(path.join(dir,id),{recursive:true});await fs.writeFile(path.join(dir,id,'input.wav'),'partial');
 const output=path.join(root,'media',`${id}-vocals.wav`);await fs.writeFile(output,'partial');
 await fs.writeFile(path.join(dir,`${id}.json`),JSON.stringify({id,projectId:p.id,mediaId:p.id,name:'中斷的影片',status:'processing',stage:'分離人聲',progress:.4}));
 const jobs=new VocalJobs(dir,library,projects,rootDir);
 try{await jobs.init();assert.equal(jobs.get(id).status,'error');assert.match(jobs.get(id).error!,/中斷/);await assert.rejects(fs.stat(output));await assert.rejects(fs.stat(path.join(dir,id)));}
 finally{jobs.close();library.close();await fs.rm(root,{recursive:true,force:true});}
});
