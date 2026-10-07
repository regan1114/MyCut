import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ProjectSchema, endFrame, type Project } from '../shared/model';
import { nextProjectName, type ProjectSummary } from '../shared/projects';
import { atomicJson, type Library } from './library';
import { ProjectSnapshots } from './project-snapshots';

export class Projects {
  private chain=Promise.resolve();
  readonly snapshots:ProjectSnapshots;
  constructor(private root:string,private library:Library,now:()=>Date=()=>new Date()){this.snapshots=new ProjectSnapshots(root,now);}
  private file(id:string,trash=false){return path.join(this.root,trash?'trash':'projects',`${id}.json`);}
  private serial<T>(fn:()=>Promise<T>):Promise<T>{const task=this.chain.catch(()=>{}).then(fn);this.chain=task.then(()=>{},()=>{});return task;}
  private async readState(id:string,trash=false):Promise<{project:Project;recoveredFrom?:'backup'|'snapshot'}>{
    const file=this.file(id,trash);
    try{return {project:ProjectSchema.parse(JSON.parse(await fs.readFile(file,'utf8')))};}catch(error){
      try{return {project:ProjectSchema.parse(JSON.parse(await fs.readFile(file+'.bak','utf8'))),recoveredFrom:'backup'};}catch{
        const snapshot=(await this.snapshots.entries(id))[0];
        if(snapshot)return {project:snapshot.project,recoveredFrom:'snapshot'};
        throw error;
      }
    }
  }
  async read(id:string,trash=false):Promise<Project>{return (await this.readState(id,trash)).project;}
  async list(trash=false):Promise<ProjectSummary[]>{const dir=path.join(this.root,trash?'trash':'projects');await fs.mkdir(dir,{recursive:true});const names=[...new Set((await fs.readdir(dir)).filter(n=>n.endsWith('.json')||n.endsWith('.json.bak')).map(n=>n.replace(/\.bak$/,'')))];const results=await Promise.all(names.map(async name=>{try{const {project:p,recoveredFrom}=await this.readState(name.slice(0,-5),trash);const cover=p.clips.filter(c=>c.kind==='video'||c.kind==='image').sort((a,b)=>a.start-b.start).map(c=>this.library.records.find(m=>m.id===c.mediaId)?.thumbnail).find(Boolean);return {id:p.id,name:p.name,updatedAt:p.updatedAt,duration:endFrame(p)/p.fps,width:p.width,height:p.height,fps:p.fps,thumbnail:cover,clips:p.clips.length,...(recoveredFrom?{recoveredFrom}:{})};}catch{return null;}}));return results.filter((p):p is NonNullable<typeof p>=>p!==null).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
  private async write(p:Project){
    const file=this.file(p.id);await fs.mkdir(path.dirname(file),{recursive:true});
    let previous:Project|undefined;
    const exists=await fs.stat(file).catch((error:NodeJS.ErrnoException)=>{if(error.code==='ENOENT')return null;throw error;});
    if(exists||await fs.stat(file+'.bak').catch(()=>null))previous=await this.read(p.id);
    if(previous){
      if(JSON.stringify({...previous,updatedAt:''})!==JSON.stringify({...p,updatedAt:''}))await this.snapshots.capture(previous,'auto');
      // Never replace a good backup with a corrupt primary file.
      await atomicJson(file+'.bak',previous);
    }
    p.updatedAt=new Date().toISOString();await atomicJson(file,p);return p;
  }
  createSnapshot(id:string){return this.serial(async()=>{await this.snapshots.capture(await this.read(id),'manual');return this.snapshots.list(id);});}
  restoreSnapshot(id:string,snapshotId:string){return this.serial(async()=>{const snapshot=await this.snapshots.read(id,snapshotId);return this.write({...snapshot,id:randomUUID(),name:(snapshot.name.slice(0,110)+' · 還原')});});}
  save(value:unknown){const p=ProjectSchema.parse(value);return this.serial(()=>this.write(p));}
  create(value:unknown){const p=ProjectSchema.parse(value);return this.serial(async()=>{if(await fs.stat(this.file(p.id)).catch(()=>null)||await fs.stat(this.file(p.id,true)).catch(()=>null))throw new Error('專案 ID 已存在');const lists=await Promise.all([this.list(),this.list(true)]);p.name=nextProjectName(lists.flat().map(p=>p.name));return this.write(p);});}
  rename(id:string,name:string){return this.serial(async()=>{const p=await this.read(id);p.name=name;return this.write(ProjectSchema.parse(p));});}
  async duplicate(id:string){const p=await this.read(id);return this.save({...p,id:randomUUID(),name:(p.name+' · 副本').slice(0,120)});}
  move(id:string,restore=false){return this.serial(async()=>{const p=await this.read(id,restore);const target=this.file(id,!restore);if(await fs.stat(target).catch(()=>null))throw new Error('目的位置已有同名專案 ID');await atomicJson(target,p);await fs.rm(this.file(id,restore),{force:true});await fs.rm(this.file(id,restore)+'.bak',{force:true});});}
}
