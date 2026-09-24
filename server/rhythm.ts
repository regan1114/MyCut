import { projectNeedsSpectrum } from '../shared/effect-timeline';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { ffmpegPath } from './native';
import { SpectrumAnalyser, SPECTRUM_BANDS, WAVE_SAMPLES } from '../shared/spectrum';
import { atomicJson, type Library, type MediaRecord } from './library';
import type { Project } from '../shared/model';
import { RHYTHM_RATE, type AudioFeatures, type AudioFeaturesJson } from '../shared/rhythm';

// Cache keyed by file contents' identity, not just media ID (relinking invalidates it).
const pending=new Map<string,Promise<AudioFeaturesJson>>();
export async function audioFeatures(library:Library,id:string,signal?:AbortSignal,spectral=false):Promise<AudioFeaturesJson>{
  const media=library.get(id);if(!media.hasAudio)return {rate:RHYTHM_RATE,energy:'',beats:[]};
  const stat=await fs.stat(media.path);
  const key=createHash('sha256').update(JSON.stringify([media.path,stat.size,stat.mtimeMs,spectral?'fft512-v1':'rms-onset-v1'])).digest('hex');
  const file=path.join(library.root,'cache',`rhythm-${key}.json`);
  try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e:any){if(e.code!=='ENOENT')throw e;}
  // Export analyses have their own cancellation; UI requests share in-flight work.
  const cacheKey=`${library.root}:${key}`;
  if(!signal&&pending.has(cacheKey))return pending.get(cacheKey)!;
  const task=analyse(media,signal,spectral).then(async data=>{await atomicJson(file,data);return data;});
  if(!signal){pending.set(cacheKey,task);try{return await task;}finally{pending.delete(cacheKey);}}
  return task;
}
async function analyse(media:MediaRecord,signal?:AbortSignal,spectral=false):Promise<AudioFeaturesJson>{
  if(signal?.aborted)throw new Error('工作已暫停');
  if(media.duration>96*3600)throw new Error('節奏分析單一素材長度上限為 96 小時');
  if(spectral&&media.duration>24*3600)throw new Error('頻譜分析單一素材長度上限為 24 小時');
  const child=spawn(ffmpegPath,['-hide_banner','-nostdin','-threads','1','-i',media.path,'-vn','-ac','1','-ar','8000','-f','f32le','pipe:1'],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  let err='';child.stderr.on('data',b=>{err=(err+b.toString()).slice(-4000);});
  const cancel=()=>child.kill('SIGTERM');signal?.addEventListener('abort',cancel,{once:true});
  const complete=new Promise<void>((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(signal?.aborted?'工作已暫停':err||'無法分析音訊')));});complete.catch(()=>{});
  const energy=new Uint8Array(Math.ceil(media.duration*RHYTHM_RATE)+RHYTHM_RATE*2),beats:number[]=[];
  const analyser=spectral?new SpectrumAnalyser():undefined,bands=spectral?new Uint8Array(energy.length*SPECTRUM_BANDS):undefined,waveform=spectral?new Uint8Array(energy.length*WAVE_SAMPLES):undefined;
  let lastBands=new Uint8Array(SPECTRUM_BANDS);
  let carry=Buffer.alloc(0),samples=0,sum=0,index=0,lastBeat=-1,history:number[]=[];
  const append=()=>{const value=Math.min(255,Math.round(Math.sqrt(sum/Math.max(1,samples))*3*255));
    if(index>=energy.length)throw new Error('素材音訊長度與資料不符，請重新匯入');
    if(analyser){if(index%2===0)lastBands=analyser.spectrum();bands!.set(lastBands,index*SPECTRUM_BANDS);waveform!.set(analyser.waveform(),index*WAVE_SAMPLES);}
    energy[index]=value;const mean=history.length?history.reduce((s,v)=>s+v,0)/history.length:0;
    const variance=history.length?history.reduce((s,v)=>s+(v-mean)**2,0)/history.length:0;
    if(value>mean+Math.sqrt(variance)*1.5+8&&value>18&&index/RHYTHM_RATE-lastBeat>.22){lastBeat=index/RHYTHM_RATE;beats.push(lastBeat);}
    history.push(value);if(history.length>43)history.shift();index++;samples=0;sum=0;
  };
  try{
    for await(const chunk of child.stdout){const buf=Buffer.concat([carry,chunk as Buffer]);let i=0;
      for(;i+4<=buf.length;i+=4){const sample=buf.readFloatLE(i),v=Number.isFinite(sample)?sample:0;sum+=v*v;analyser?.push(v);if(++samples===8000/RHYTHM_RATE)append();}carry=Buffer.from(buf.subarray(i));
    }
    await complete;if(samples)append();return {rate:RHYTHM_RATE,energy:Buffer.from(energy.subarray(0,index)).toString('base64'),beats,...(bands?{bands:Buffer.from(bands.subarray(0,index*SPECTRUM_BANDS)).toString('base64'),waveform:Buffer.from(waveform!.subarray(0,index*WAVE_SAMPLES)).toString('base64')}:{})};
  }finally{signal?.removeEventListener('abort',cancel);child.kill('SIGTERM');await complete.catch(()=>{});}
}
export async function projectFeatures(p:Project,library:Library,signal?:AbortSignal){
  const result=new Map<string,AudioFeatures>();
  for(const id of new Set(p.clips.filter(c=>['audio','video'].includes(c.kind)&&c.volume>0&&p.tracks.some(t=>t.id===c.trackId&&!t.muted&&!t.hidden)).flatMap(c=>c.mediaId?[c.mediaId]:[]))){
    const data=await audioFeatures(library,id,signal,projectNeedsSpectrum(p));result.set(id,{energy:Buffer.from(data.energy,'base64'),beats:data.beats,bands:data.bands?Buffer.from(data.bands,'base64'):undefined,waveform:data.waveform?Buffer.from(data.waveform,'base64'):undefined});
  }
  return result;
}
