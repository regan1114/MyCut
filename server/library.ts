import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ffmpeg, probe } from './native';
import type { Media } from '../shared/model';

export type MediaRecord = Media & { path:string; owned:boolean };
export async function atomicJson(file:string,value:unknown) { const tmp=`${file}.${randomUUID()}.tmp`; await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(tmp,JSON.stringify(value,null,2));await fs.rename(tmp,file); }
export class Library {
  records:MediaRecord[]=[];
  private chain=Promise.resolve();
  private proxyQueue=Promise.resolve();
  private closing=false;
  private controllers=new Set<AbortController>();
  constructor(public root:string){}
  async init(){await fs.mkdir(path.join(this.root,'cache'),{recursive:true});await fs.mkdir(path.join(this.root,'media'),{recursive:true});try {this.records=JSON.parse(await fs.readFile(path.join(this.root,'library.json'),'utf8'));}catch(e:any){if(e.code!=='ENOENT')throw e;}for(const m of this.records){m.missing=!(await fs.stat(m.path).catch(()=>null));if(m.proxyStatus==='processing'||m.proxyStatus==='queued')m.proxyStatus='error';}}
  list(){return this.records.map(({path:_,owned:__,...m})=>m);}
  get(id:string){const record=this.records.find(m=>m.id===id);if(!record)throw new Error('素材不存在');return record;}
  save(){this.chain=this.chain.catch(()=>{}).then(()=>atomicJson(path.join(this.root,'library.json'),this.records));return this.chain;}
  async import(file:string,owned=false,name=path.basename(file)){
    const existing=this.records.find(m=>m.path===file);if(existing)return existing;
    const m=await this.prepare(file,owned,name);await this.addPrepared([m]);this.derive([m]);return m;
  }
  async prepare(file:string,owned=false,name=path.basename(file)):Promise<MediaRecord>{
    const stat=await fs.stat(file);if(!stat.isFile())throw new Error('請選擇媒體檔案');
    const info=await probe(file);const v=info.streams.find((s:any)=>s.codec_type==='video'&& !s.disposition?.attached_pic);const a=info.streams.find((s:any)=>s.codec_type==='audio');
    const still=/\.(png|jpe?g|webp|bmp|tiff?)$/i.test(name);
    if(!v&&!a)throw new Error('此檔案沒有可用的影像或音訊');
    const duration=Number(info.format.duration??v?.duration??a?.duration??0);
    if(!still&&(!Number.isFinite(duration)||duration<=0))throw new Error('無法讀取素材長度');
    const m:MediaRecord={id:randomUUID(),name,path:file,owned,kind:still?'image':v?'video':'audio',duration:still?5:duration,width:v?.width??0,height:v?.height??0,size:stat.size,hasAudio:!!a};
    if(v){try {const thumb=path.join(this.root,'cache',`${m.id}.jpg`);await ffmpeg(['-ss',still?'0':String(Math.min(1,duration/3)),'-i',file,'-frames:v','1','-vf','scale=400:240:force_original_aspect_ratio=decrease','-q:v','4',thumb]);m.thumbnail=`/media/${m.id}/thumbnail`;}catch{ /* The original remains available if a thumbnail cannot be decoded. */ }}
    return m;
  }
  async addPrepared(records:MediaRecord[]){this.records.push(...records);try{await this.save();}catch(e){this.records=this.records.filter(m=>!records.includes(m));throw e;}}
  async removePrepared(records:MediaRecord[]){this.records=this.records.filter(m=>!records.includes(m));await this.save();await Promise.all(records.map(m=>fs.rm(path.join(this.root,'cache',`${m.id}.jpg`),{force:true})));}
  derive(records:MediaRecord[]){for(const m of records)if(m.hasAudio)this.queueWaveform(m);}
  private queueWaveform(m:MediaRecord){this.proxyQueue=this.proxyQueue.then(async()=>{if(this.closing)return;const controller=new AbortController();this.controllers.add(controller);const file=path.join(this.root,'cache',`${m.id}.wave`);try{
    await ffmpeg(['-i',m.path,'-vn','-ac','1','-ar','8000','-f','f32le',file],{signal:controller.signal});
    // Incremental reduction: 1-hour audio never becomes a full PCM buffer in JS.
    const bins=new Float32Array(600);let count=0,carry=Buffer.alloc(0);const total=Math.ceil(m.duration*8000);
    for await(const b of createReadStream(file)){const buf=Buffer.concat([carry,b as Buffer]);let i=0;for(;i+4<=buf.length;i+=4){const n=Math.min(599,Math.floor(count++/total*600));bins[n]=Math.max(bins[n],Math.abs(buf.readFloatLE(i)));}carry=buf.subarray(i);}
    m.waveform=Array.from(bins);await this.save();
  }catch{}finally{this.controllers.delete(controller);await fs.rm(file,{force:true});}});}
  async proxy(id:string){const m=this.get(id);if(m.kind!=='video'||m.proxyStatus==='ready'||m.proxyStatus==='queued'||m.proxyStatus==='processing')return;m.proxyStatus='queued';await this.save();
    this.proxyQueue=this.proxyQueue.then(async()=>{if(this.closing)return;const controller=new AbortController();this.controllers.add(controller);m.proxyStatus='processing';await this.save();const dest=path.join(this.root,'cache',`${id}.proxy.mp4`);const tmp=dest+'.partial.mp4';try{await ffmpeg(['-i',m.path,'-vf','scale=960:540:force_original_aspect_ratio=decrease:force_divisible_by=2','-c:v','libx264','-preset','ultrafast','-crf','27','-threads','2','-c:a','aac','-b:a','96k','-movflags','+faststart',tmp],{signal:controller.signal});await fs.rename(tmp,dest);m.proxy=`/media/${id}/proxy`;m.proxyStatus='ready';}catch{m.proxyStatus='error';await fs.rm(tmp,{force:true});}finally{this.controllers.delete(controller);await this.save();}});
  }
  async relink(id:string,file:string){const m=this.get(id);const info=await probe(file);if(!info.streams.length)throw new Error('無法讀取替代素材');m.path=file;m.revision=Date.now();m.missing=false;m.proxy=undefined;m.proxyStatus=undefined;await this.save();}
  close(){this.closing=true;for(const c of this.controllers)c.abort();}
}
