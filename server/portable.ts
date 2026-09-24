import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import { ProjectSchema, type Project } from '../shared/model';
import { Library, type MediaRecord } from './library';
import type { Projects } from './projects';

// Sequential, uncompressed container: magic + uint32 header size + JSON header + its SHA-256,
// followed by each original's exact bytes and 32-byte SHA-256. No archive paths,
// external commands, 32-bit file offsets, or complete media buffers are needed.
const MAGIC=Buffer.from('MYCUTPACK\x00\x01\n');
const MAX_HEADER=16*1024*1024;
const HeaderSchema=z.object({format:z.literal('mycutpack'),version:z.literal(1),project:ProjectSchema,media:z.array(z.object({id:z.string().uuid(),name:z.string().max(300),bytes:z.number().int().positive().max(1024**4)})).max(20000)});
export type PortableStatus={running:boolean;kind:'export'|'import';progress:number;message:string;error?:string};

export class PortableProjects {
  status:PortableStatus={running:false,kind:'export',progress:0,message:''};
  private controller?:AbortController;
  constructor(private library:Library,private projects:Projects){}
  get isRunning(){return this.status.running;}
  cancel(){this.controller?.abort();}
  private async operation<T>(kind:'export'|'import',task:(signal:AbortSignal)=>Promise<T>):Promise<T>{
    if(this.isRunning)throw new Error('另一個專案打包／匯入工作正在執行。');
    const controller=new AbortController();this.controller=controller;this.status={running:true,kind,progress:0,message:kind==='export'?'正在準備完整專案包…':'正在檢查專案包…'};
    try{const value=await task(controller.signal);this.status={...this.status,progress:1,message:kind==='export'?'完整專案包已儲存':'完整專案包已匯入'};return value;}
    catch(e){const error=controller.signal.aborted?'已取消專案打包／匯入':e instanceof Error?e.message:String(e);this.status={...this.status,error,message:error};throw new Error(error);}
    finally{this.status.running=false;this.controller=undefined;}
  }
  private async space(dir:string,bytes:number){const st=await fs.statfs(dir);if(st.bavail*st.bsize<bytes+64*1024**2)throw new Error(`磁碟空間不足，需約 ${(bytes/1024**3).toFixed(2)} GB 加上暫存空間。`);}
  async export(value:Project,destination:string){return this.operation('export',async signal=>{
    const project=ProjectSchema.parse(value),records=[...new Set(project.clips.flatMap(c=>c.mediaId?[c.mediaId]:[]))].map(id=>this.library.get(id));
    const sources=await Promise.all(records.map(async m=>{const st=await fs.stat(m.path).catch(()=>null);if(!st?.isFile())throw new Error(`找不到素材「${m.name}」，請先重新連結。`);return {record:m,size:st.size,mtime:st.mtimeMs};}));
    const header=Buffer.from(JSON.stringify(HeaderSchema.parse({format:'mycutpack',version:1,project,media:sources.map(s=>({id:s.record.id,name:s.record.name,bytes:s.size}))})));if(header.length>MAX_HEADER)throw new Error('專案設定超過 16 MB，無法打包。');
    const targetReal=await fs.realpath(destination).catch(()=>path.resolve(destination));
    if((await Promise.all(records.map(m=>fs.realpath(m.path)))).includes(targetReal))throw new Error('專案包不能覆蓋原始素材。');
    const size=Buffer.alloc(4);size.writeUInt32BE(header.length);const total=sources.reduce((n,s)=>n+s.size,0);await this.space(path.dirname(destination),total+header.length+(sources.length+1)*32+MAGIC.length+4);
    const temporary=`${destination}.${randomUUID()}.partial`;let done=0;
    try{
      signal.throwIfAborted();await fs.writeFile(temporary,Buffer.concat([MAGIC,size,header,createHash('sha256').update(header).digest()]),{flag:'wx'});
      for(const source of sources){signal.throwIfAborted();this.status.message=`正在打包：${source.record.name}`;const hash=createHash('sha256');let copied=0;
        const meter=new Transform({transform:(chunk:Buffer,_encoding,callback)=>{hash.update(chunk);copied+=chunk.length;done+=chunk.length;this.status.progress=done/Math.max(1,total);callback(null,chunk);}});
        await pipeline(createReadStream(source.record.path,{highWaterMark:1024*1024}),meter,createWriteStream(temporary,{flags:'a'}),{signal});
        const after=await fs.stat(source.record.path);if(copied!==source.size||after.size!==source.size||after.mtimeMs!==source.mtime)throw new Error(`素材「${source.record.name}」在打包時變更，請重試。`);
        await fs.appendFile(temporary,hash.digest());
      }
      for(const source of sources){const after=await fs.stat(source.record.path);if(after.size!==source.size||after.mtimeMs!==source.mtime)throw new Error('素材在打包期間變更，請重試。');}
      signal.throwIfAborted();await fs.rename(temporary,destination);
    }finally{await fs.rm(temporary,{force:true});}
    return true;
  });}
  async import(source:string){return this.operation('import',async signal=>{
    const file=await fs.open(source,'r'),prepared:MediaRecord[]=[];let directory:string|undefined,registered=false,committed=false;
    try{
      const st=await file.stat();if(!st.isFile())throw new Error('請選擇完整專案包檔案。');
      const prefix=Buffer.alloc(MAGIC.length+4);if((await file.read(prefix,0,prefix.length,0)).bytesRead!==prefix.length||!prefix.subarray(0,MAGIC.length).equals(MAGIC))throw new Error('不是有效的 MyCut 完整專案包，或版本不支援。');
      const length=prefix.readUInt32BE(MAGIC.length);if(length<2||length>MAX_HEADER||prefix.length+length>st.size)throw new Error('專案包標頭不完整或過大。');
      const data=Buffer.alloc(length);if((await file.read(data,0,length,prefix.length)).bytesRead!==length)throw new Error('專案包標頭不完整。');
      const headerHash=Buffer.alloc(32);if((await file.read(headerHash,0,32,prefix.length+length)).bytesRead!==32||!createHash('sha256').update(data).digest().equals(headerHash))throw new Error('專案設定校驗失敗，請重新複製專案包。');
      const header=HeaderSchema.parse(JSON.parse(data.toString('utf8'))),ids=new Set(header.media.map(m=>m.id));
      if(ids.size!==header.media.length||header.project.clips.some(c=>c.mediaId&&!ids.has(c.mediaId)))throw new Error('專案包的素材清單不完整或有重複 ID。');
      let offset=prefix.length+length+32;const total=header.media.reduce((sum,m)=>sum+m.bytes,0);
      if(offset+total+header.media.length*32!==st.size)throw new Error('專案包長度不符，檔案可能損壞或尚未複製完成。');
      await this.space(this.library.root,total);signal.throwIfAborted();directory=path.join(this.library.root,'media',`package-${randomUUID()}`);await fs.mkdir(directory,{recursive:true});
      let done=0;const files:{file:string;name:string;oldId:string}[]=[];
      for(const m of header.media){signal.throwIfAborted();this.status.message=`正在還原：${m.name}`;
        const extension=path.extname(m.name).replace(/[^a-zA-Z0-9.]/g,'').slice(0,12),target=path.join(directory,`${randomUUID()}${extension}`),hash=createHash('sha256');
        const meter=new Transform({transform:(chunk:Buffer,_encoding,callback)=>{hash.update(chunk);done+=chunk.length;this.status.progress=done/Math.max(1,total)*.85;callback(null,chunk);}});
        await pipeline(createReadStream(source,{start:offset,end:offset+m.bytes-1,highWaterMark:1024*1024}),meter,createWriteStream(target,{flags:'wx'}),{signal});offset+=m.bytes;
        const expected=Buffer.alloc(32);if((await file.read(expected,0,32,offset)).bytesRead!==32||!hash.digest().equals(expected))throw new Error(`素材「${m.name}」校驗失敗，請重新複製專案包。`);offset+=32;files.push({file:target,name:m.name,oldId:m.id});
      }
      const mapping=new Map<string,string>();
      for(const [i,item] of files.entries()){signal.throwIfAborted();this.status.message=`正在建立素材庫：${item.name}`;const record=await this.library.prepare(item.file,true,item.name);prepared.push(record);mapping.set(item.oldId,record.id);this.status.progress=.85+(i+1)/Math.max(1,files.length)*.14;}
      const after=await file.stat();if(after.size!==st.size||after.mtimeMs!==st.mtimeMs)throw new Error('專案包在匯入期間變更，請重試。');
      const project=ProjectSchema.parse({...header.project,id:randomUUID(),name:(header.project.name+' · 還原').slice(0,120),clips:header.project.clips.map(c=>({...c,mediaId:c.mediaId?mapping.get(c.mediaId):undefined}))});
      signal.throwIfAborted();this.status.message='正在儲存還原的專案…';await this.library.addPrepared(prepared);registered=true;
      const saved=await this.projects.save(project);committed=true;this.library.derive(prepared);return saved;
    }finally{
      await file.close();if(!committed){if(registered)await this.library.removePrepared(prepared);else await Promise.all(prepared.map(m=>fs.rm(path.join(this.library.root,'cache',`${m.id}.jpg`),{force:true})));if(directory)await fs.rm(directory,{recursive:true,force:true});}
    }
  });}
}
