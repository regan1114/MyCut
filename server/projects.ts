import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ProjectSchema, endFrame, type Project } from '../shared/model';
import type { ProjectSummary } from '../shared/projects';
import { atomicJson, type Library } from './library';

export class Projects {
  private chain=Promise.resolve();
  constructor(private root:string,private library:Library){}
  private file(id:string,trash=false){return path.join(this.root,trash?'trash':'projects',`${id}.json`);}
  private serial<T>(fn:()=>Promise<T>):Promise<T>{const task=this.chain.catch(()=>{}).then(fn);this.chain=task.then(()=>{});return task;}
  async read(id:string,trash=false):Promise<Project>{const file=this.file(id,trash);try{return ProjectSchema.parse(JSON.parse(await fs.readFile(file,'utf8')));}catch{return ProjectSchema.parse(JSON.parse(await fs.readFile(file+'.bak','utf8')));}}
  async list(trash=false):Promise<ProjectSummary[]>{const dir=path.join(this.root,trash?'trash':'projects');await fs.mkdir(dir,{recursive:true});const names=(await fs.readdir(dir)).filter(n=>n.endsWith('.json'));const results=await Promise.all(names.map(async name=>{try{const p=await this.read(name.slice(0,-5),trash);const cover=p.clips.filter(c=>c.kind==='video'||c.kind==='image').sort((a,b)=>a.start-b.start).map(c=>this.library.records.find(m=>m.id===c.mediaId)?.thumbnail).find(Boolean);return {id:p.id,name:p.name,updatedAt:p.updatedAt,duration:endFrame(p)/p.fps,width:p.width,height:p.height,fps:p.fps,thumbnail:cover,clips:p.clips.length};}catch{return null;}}));return results.filter((p):p is NonNullable<typeof p>=>p!==null).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
  save(value:unknown){const p=ProjectSchema.parse(value);return this.serial(async()=>{p.updatedAt=new Date().toISOString();const file=this.file(p.id);await fs.mkdir(path.dirname(file),{recursive:true});await fs.copyFile(file,file+'.bak').catch(()=>{});await atomicJson(file,p);return p;});}
  rename(id:string,name:string){return this.serial(async()=>{const p=await this.read(id);p.name=name;p.updatedAt=new Date().toISOString();await atomicJson(this.file(id),ProjectSchema.parse(p));return p;});}
  async duplicate(id:string){const p=await this.read(id);return this.save({...p,id:randomUUID(),name:(p.name+' · 副本').slice(0,120)});}
  move(id:string,restore=false){return this.serial(async()=>{const p=await this.read(id,restore);const target=this.file(id,!restore);if(await fs.stat(target).catch(()=>null))throw new Error('目的位置已有同名專案 ID');await atomicJson(target,p);await fs.rm(this.file(id,restore),{force:true});await fs.rm(this.file(id,restore)+'.bak',{force:true});});}
}
