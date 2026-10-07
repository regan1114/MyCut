import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ProjectSchema, endFrame, type Project } from '../shared/model';
import type { ProjectSnapshotSummary } from '../shared/projects';
import { atomicJson } from './library';

export const SNAPSHOT_LIMIT=10;
export const SNAPSHOT_INTERVAL_MS=5*60*1000;
const SnapshotSchema=z.object({id:z.string().uuid(),createdAt:z.string().datetime(),reason:z.enum(['auto','manual']),project:ProjectSchema});
type Snapshot=z.infer<typeof SnapshotSchema>;
export class ProjectSnapshots {
  private lastCapture=new Map<string,number>();
  constructor(private root:string,private now:()=>Date=()=>new Date()){}
  private directory(id:string){return path.join(this.root,'snapshots',z.string().uuid().parse(id));}
  async entries(id:string):Promise<Snapshot[]>{
    const dir=this.directory(id),files=await fs.readdir(dir).catch((error:NodeJS.ErrnoException)=>{if(error.code==='ENOENT')return [];throw error;});
    const rows=await Promise.all(files.filter(file=>/^[\da-f-]+\.json$/i.test(file)).map(async file=>{
      try{const row=SnapshotSchema.parse(JSON.parse(await fs.readFile(path.join(dir,file),'utf8')));return row.project.id===id&&`${row.id}.json`===file?row:null;}catch{return null;}
    }));
    return rows.filter((row):row is Snapshot=>row!==null).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
  }
  async list(id:string):Promise<ProjectSnapshotSummary[]>{return (await this.entries(id)).map(({id,createdAt,reason,project})=>({id,createdAt,reason,projectUpdatedAt:project.updatedAt,name:project.name,clips:project.clips.length,duration:endFrame(project)/project.fps}));}
  async capture(project:Project,reason:Snapshot['reason']){
    const now=this.now(),cached=this.lastCapture.get(project.id);
    if(reason==='auto'&&cached!==undefined&&now.getTime()-cached<SNAPSHOT_INTERVAL_MS)return;
    const rows=await this.entries(project.id);
    if(reason==='auto'&&rows.length&&now.getTime()-Date.parse(rows[0].createdAt)<SNAPSHOT_INTERVAL_MS){this.lastCapture.set(project.id,Date.parse(rows[0].createdAt));return;}
    const row:Snapshot={id:randomUUID(),createdAt:new Date(Math.max(now.getTime(),rows.length?Date.parse(rows[0].createdAt)+1:0)).toISOString(),reason,project:ProjectSchema.parse(project)},dir=this.directory(project.id);
    await fs.mkdir(dir,{recursive:true});await atomicJson(path.join(dir,`${row.id}.json`),row);
    this.lastCapture.set(project.id,Date.parse(row.createdAt));
    const ordered=[row,...rows].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
    await Promise.all(ordered.slice(SNAPSHOT_LIMIT).map(old=>fs.rm(path.join(dir,`${old.id}.json`),{force:true})));
    return row;
  }
  async read(id:string,snapshotId:string){
    const file=path.join(this.directory(id),`${z.string().uuid().parse(snapshotId)}.json`);
    const row=SnapshotSchema.parse(JSON.parse(await fs.readFile(file,'utf8')));
    if(row.project.id!==id||row.id!==snapshotId)throw new Error('快照與專案不符');
    return row.project;
  }
}
