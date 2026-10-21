import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Library, atomicJson } from './library';
import { Projects } from './projects';
import { ffmpeg, runNative } from './native';
import { unpackedPath } from '../shared/platform';
import type { VocalJob } from '../shared/vocals';

export function vocalRuntime(appRoot:string){
 const base=unpackedPath(path.join(appRoot,'resources/vocal-separation'));
 const binary=path.join(base,`${process.platform}-${process.arch}`,'mycut-vocals',process.platform==='win32'?'mycut-vocals.exe':'mycut-vocals');
 const python=process.env.MYCUT_VOCAL_PYTHON??path.join(appRoot,'.build-tools',`vocal-separator-${process.platform}-${process.arch}`,process.platform==='win32'?'Scripts/python.exe':'bin/python');
 const worker=unpackedPath(path.join(appRoot,'tools/vocal-separator/worker.py'));
 const models=path.join(base,'models');
 const bundled=existsSync(binary);
 if(!existsSync(path.join(models,'955717e8-8726e21a.th'))||(!bundled&&(!existsSync(python)||!existsSync(worker))))throw new Error('此版本缺少人聲分離引擎，請安裝包含此功能的完整桌面版。');
 return {command:bundled?binary:python,args:bundled?[]:[worker],models};
}
export class VocalJobs {
 private jobs=new Map<string,VocalJob>();
 private controllers=new Map<string,AbortController>();
 private queue=Promise.resolve();
 private closing=false;
 constructor(private root:string,private library:Library,private projects:Projects,private appRoot:string){}
 async init(){await fs.mkdir(this.root,{recursive:true});for(const file of await fs.readdir(this.root)){if(!file.endsWith('.json'))continue;const job:VocalJob=JSON.parse(await fs.readFile(path.join(this.root,file),'utf8'));if(job.status==='queued'||job.status==='processing'){job.status='error';job.error='上次處理因程式關閉而中斷，請重新分離。';await this.save(job);await fs.rm(path.join(this.root,job.id),{recursive:true,force:true});const output=path.join(this.library.root,'media',`${job.id}-vocals.wav`);if(!this.library.records.some(m=>m.path===output))await fs.rm(output,{force:true});}this.jobs.set(job.id,job);}}
 private save(job:VocalJob){return atomicJson(path.join(this.root,`${job.id}.json`),job);}
 list(){return [...this.jobs.values()];}
 get(id:string){const job=this.jobs.get(id);if(!job)throw new Error('人聲分離工作不存在');return job;}
 async create(projectId:string,mediaId:string){
  if(this.closing)throw new Error('應用程式正在關閉');
  const source=this.library.get(mediaId),project=await this.projects.read(projectId);
  if(!project.mediaIds.includes(mediaId)&&!project.clips.some(c=>c.mediaId===mediaId))throw new Error('素材不屬於此專案');
  if(!['video','audio'].includes(source.kind)||!source.hasAudio||source.missing)throw new Error('請選擇含音訊且可讀取的影片或歌曲');
  vocalRuntime(this.appRoot);
  const existing=this.list().find(j=>j.projectId===projectId&&j.mediaId===mediaId&&['queued','processing'].includes(j.status));if(existing)return existing;
  const job:VocalJob={id:randomUUID(),projectId,mediaId,name:source.name,status:'queued',stage:'等待處理',progress:0};
  this.jobs.set(job.id,job);await this.save(job);
  const controller=new AbortController();this.controllers.set(job.id,controller);
  this.queue=this.queue.catch(()=>{}).then(()=>this.process(job,source.path,controller)).catch(()=>{});
  return job;
 }
 async dismiss(id:string){const job=this.get(id);if(['queued','processing'].includes(job.status))throw new Error('工作仍在處理');job.dismissed=true;await this.save(job);}
 async cancel(id:string){const job=this.get(id);if(['queued','processing'].includes(job.status)){this.controllers.get(id)?.abort();if(job.status==='queued'){job.status='canceled';job.stage='已取消';await this.save(job);}}return job;}
 private async process(job:VocalJob,input:string,controller:AbortController){
  const signal=controller.signal,dir=path.join(this.root,job.id),output=path.join(this.library.root,'media',`${job.id}-vocals.wav`);
  let imported=false;
  try{
   if(signal.aborted||this.closing)throw new Error('工作已取消');
   job.status='processing';job.stage='準備音訊';await this.save(job);await fs.mkdir(dir,{recursive:true});
   const wav=path.join(dir,'input.wav');const source=this.library.get(job.mediaId);
   await ffmpeg(['-i',input,'-map','0:a:0','-vn','-ac','2','-ar','44100','-c:a','pcm_f32le','-progress','pipe:1',wav],{signal,onProgress:s=>{job.progress=Math.min(.1,s/source.duration*.1);}});
   job.stage='分離人聲';job.progress=.1;const runtime=vocalRuntime(this.appRoot);
   await runNative(runtime.command,[...runtime.args,'--models',runtime.models,'--input',wav,'--output',output],{signal,onProgress:s=>{job.progress=Math.min(.95,.1+s/source.duration*.85);}});
   if(signal.aborted)throw new Error('工作已取消');
   job.stage='加入素材庫';
   const media=await this.library.import(output,true,`${path.parse(job.name).name} · 人聲.wav`);imported=true;job.outputId=media.id;
   await this.projects.addMedia(job.projectId,media.id);
   job.status='completed';job.stage='完成';job.progress=1;
  }catch(error){job.status=signal.aborted?'canceled':'error';job.error=signal.aborted?undefined:(error instanceof Error?error.message:String(error));job.stage=signal.aborted?'已取消':'分離失敗';}
  finally{this.controllers.delete(job.id);await fs.rm(dir,{recursive:true,force:true});if(!imported)await fs.rm(output,{force:true});await this.save(job);}
 }
 close(){this.closing=true;for(const controller of this.controllers.values())controller.abort();}
}
