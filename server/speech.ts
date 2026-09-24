import { unpackedPath } from '../shared/platform';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import * as OpenCC from 'opencc-js';
import { ProjectSchema, type Project } from '../shared/model';
import { CaptionOptionsSchema, audibleClips, audioSignature, captionWindows, type CaptionJob, type CaptionOptions, type Cue, type SpeechCapabilities } from '../shared/captions';
import { atomicJson, type Library } from './library';
import { ffmpeg, runNative } from './native';
import { tempo } from './render';
import { validWordTiming, type WordTiming } from '../shared/karaoke';

const traditional=OpenCC.Converter({from:'cn',to:'tw'});
type Token={text:string;offsets?:{from:number;to:number};p?:number;t_dtw?:number};
type Transcript={transcription:{text:string;offsets:{from:number;to:number};tokens?:Token[]}[]};
type Window=ReturnType<typeof captionWindows>[number];
type TimedText={text:string;from:number;to:number;p?:number;aligned:boolean};
const clean=(s:string)=>s.replace(/\[_[^\]]*\]/g,'').replace(/<\|[^|]*\|>/g,'').replace(/\[(?:BLANK_AUDIO|MUSIC|SILENCE|APPLAUSE)\]/gi,'').replace(/[♪♫♬]/g,'');

function wordsForCue(group:TimedText[],text:string,start:number,end:number,fps:number):WordTiming[]{
  if(!group.every(p=>p.aligned))return [];
  const raw=group.map(p=>p.text).join(''),left=raw.length-raw.trimStart().length,right=raw.trimEnd().length;
  // Phrase-level Traditional Chinese conversion can alter character count; those cases need manual timing.
  if(raw.trim().length!==text.length)return [];
  const words:WordTiming[]=[];let offset=0;
  for(const part of group){
    const from=Math.max(left,offset),to=Math.min(right,offset+part.text.length);offset+=part.text.length;if(to<=from)continue;
    const token=text.slice(from-left,to-left),previous=words.at(-1),punctuation=/^[\s\p{P}\p{S}]+$/u.test(token),cjk=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(token);
    const begins=Math.max(0,Math.round(part.from*fps)-start),ends=Math.min(end-start,Math.round(part.to*fps)-start);
    if(previous&&(punctuation||(!cjk&&!/^\s/.test(token))||begins>=end-start-1)){previous.text+=token;previous.end=Math.max(previous.end,ends);}
    else{const wordStart=Math.max(previous?.end??0,begins),wordEnd=Math.max(wordStart+1,ends);if(wordEnd>end-start){if(previous)previous.text+=token;else return [];}else words.push({text:token,start:wordStart,end:wordEnd});}
  }
  return validWordTiming(text,words)?words:[];
}

// Only the owner window keeps a token. One-second context on either side
// improves boundary recognition without duplicating a whole subtitle sentence.
export function transcriptCues(result:Transcript,window:Window,fps:number,options:CaptionOptions):Cue[]{
  const pieces:TimedText[]=[];
  for(const segment of result.transcription??[]){
    const rawTokens=(segment.tokens??[]).filter(t=>clean(t.text).trim());
    const usable=rawTokens.map((token,index)=>{
      if(!options.karaoke||token.t_dtw===undefined||token.t_dtw<0)return token;
      const current=token.t_dtw*10,previous=rawTokens[index-1]?.t_dtw,next=rawTokens[index+1]?.t_dtw;
      return {...token,offsets:{from:Math.max(segment.offsets.from,previous!==undefined&&previous>=0?(previous*10+current)/2:token.offsets?.from??segment.offsets.from),to:Math.min(segment.offsets.to,next!==undefined&&next>=0?(current+next*10)/2:token.offsets?.to??segment.offsets.to)}};
    });
    const tokens:Token[]=[];let pending='';
    for(const t of usable){const text=clean(t.text);if(t.offsets&&t.offsets.from>=0&&t.offsets.to>t.offsets.from){tokens.push({...t,text:pending+text});pending='';}else if(tokens.length){tokens[tokens.length-1].text+=text;}else pending+=text;}
    const source:Token[]=tokens.length&&tokens.length>=usable.length*.7?tokens:[{text:segment.text,offsets:segment.offsets}];
    for(const token of source){const text=clean(token.text);if(!text.trim()||!token.offsets)continue;const from=window.from+token.offsets.from/1000,to=window.from+token.offsets.to/1000,mid=(from+to)/2;if(mid<Math.max(window.coreFrom,window.from)||mid>=Math.min(window.coreTo,window.to)||to<=from)continue;pieces.push({text,from:Math.max(window.coreFrom,window.from,from),to:Math.min(window.coreTo,window.to,to),p:token.p,aligned:source===tokens});}
  }
  const cues:Cue[]=[];let group:TimedText[]=[];
  const flush=()=>{if(!group.length)return;let text=group.map(t=>t.text).join('').trim();if(options.traditional)text=traditional(text);if(text&&!/^\s*[（(\[]?(音樂|音乐|伴奏|music|silence|無聲|无声)[）)\]]?[.。]?\s*$/i.test(text)){const start=Math.round(group[0].from*fps),end=Math.round(group[group.length-1].to*fps);if(end>start)cues.push({id:randomUUID(),start,duration:end-start,text,confidence:group.reduce((s,t)=>s+(t.p??1),0)/group.length,...(options.karaoke?{words:wordsForCue(group,text,start,end,fps)}:{})});}group=[];};
  for(const part of pieces){const text=group.map(t=>t.text).join('');const cjk=/[\u2E80-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(text+part.text);const limit=options.mode==='lyrics'?(cjk?16:38):(cjk?24:60);const last=group[group.length-1];if(last&&(part.from-last.to>(options.mode==='lyrics'?.45:.8)||[...text+part.text].length>limit||part.to-group[0].from>(options.mode==='lyrics'?5:7)))flush();group.push(part);if(/[。！？!?]$/.test(part.text.trim())||options.mode==='lyrics'&&/[，,;；]$/.test(part.text.trim()))flush();}flush();return cues;
}

export async function extractSpeechAudio(p:Project,library:Library,options:CaptionOptions,from:number,to:number,dest:string,signal?:AbortSignal){
  const clips=audibleClips(p,library.list(),options.clipId).filter(c=>c.start/p.fps<to&&(c.start+c.duration)/p.fps>from);
  if(!clips.length)return false;if(clips.length>64)throw new Error('此段音訊來源超過 64 個，請選取單一片段辨識');
  const n=(v:number)=>String(Number(v.toFixed(8)));const duration=to-from;
  const args=['-f','lavfi','-i','anullsrc=r=16000:cl=mono'];const graph=[`[0:a]atrim=duration=${n(duration)},asetpts=PTS-STARTPTS[silent]`];const audio=['[silent]'];let index=1;
  for(const c of clips){const start=Math.max(from,c.start/p.fps),end=Math.min(to,(c.start+c.duration)/p.fps);const elapsed=start-c.start/p.fps,length=end-start,delay=start-from;
    args.push('-ss',n(c.sourceIn+elapsed*c.speed),'-t',n(length*c.speed),'-i',library.get(c.mediaId!).path);
    let volume=n(c.volume);const local=`(t+${n(elapsed)})`;if(c.audioFadeIn)volume+=`*clip(${local}/${n(c.audioFadeIn/p.fps)},0,1)`;if(c.audioFadeOut)volume+=`*clip((${n(c.duration/p.fps)}-${local})/${n(c.audioFadeOut/p.fps)},0,1)`;
    const filters=['asetpts=PTS-STARTPTS',tempo(c.speed),'aresample=16000','aformat=sample_fmts=fltp:channel_layouts=mono',`atrim=duration=${n(length)}`];if(c.denoise)filters.push('afftdn=nf=-25');filters.push(`volume='${volume}':eval=frame`,`adelay=${Math.round(delay*16000)}S:all=1`);graph.push(`[${index}:a]${filters.join(',')}[a${index}]`);audio.push(`[a${index++}]`);
  }
  const focus=options.mode==='lyrics'&&options.vocalFocus?'highpass=f=100,lowpass=f=6500,':'';
  graph.push(`${audio.join('')}amix=inputs=${audio.length}:duration=first:normalize=0,${focus}alimiter=limit=0.95:latency=1,apad,atrim=duration=${n(duration)}[out]`);
  const script=dest+'.filters';await fs.writeFile(script,graph.join(';\n'));try{await ffmpeg([...args,'-filter_complex_script',script,'-map','[out]','-ac','1','-ar','16000','-c:a','pcm_s16le','-t',n(duration),dest],{signal});}finally{await fs.rm(script,{force:true});}return true;
}
async function pcmBounds(file:string){const b=await fs.readFile(file);let pcm=Buffer.alloc(0);for(let offset=12;offset+8<=b.length;){const length=b.readUInt32LE(offset+4),end=Math.min(b.length,offset+8+length);if(b.toString('ascii',offset,offset+4)==='data'){pcm=b.subarray(offset+8,end);break;}offset+=8+length+(length%2);}let first=-1,last=0;const block=1600;for(let from=0;from<pcm.length;from+=block*2){const to=Math.min(pcm.length,from+block*2);let sum=0;for(let i=from;i+2<=to;i+=2){const v=pcm.readInt16LE(i)/32768;sum+=v*v;}if(Math.sqrt(sum/Math.max(1,(to-from)/2))>.0003){if(first<0)first=from/2;last=to/2;}}return first<0?null:{pcm,first:Math.max(0,first-3200),last:Math.min(pcm.length/2,last+3200)};}
export async function nonSilent(file:string){return !!await pcmBounds(file);}
// Remove only silent edges, preserving a 200 ms margin and the exact source
// offset. Long leading silence can otherwise stretch Whisper token timestamps.
export async function prepareSpeechWav(file:string){const bounds=await pcmBounds(file);if(!bounds)return null;const {pcm,first,last}=bounds;const data=pcm.subarray(first*2,last*2);const header=Buffer.alloc(44);header.write('RIFF',0);header.writeUInt32LE(data.length+36,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(16000,24);header.writeUInt32LE(32000,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(data.length,40);await fs.writeFile(file,Buffer.concat([header,data]));return {offset:first/16000,duration:(last-first)/16000};}
type Saved={job:CaptionJob;project:Project;fingerprints:{id:string;size:number;mtimeMs:number}[];cues:Cue[];windows:Window[]};

export class SpeechJobs {
  private records=new Map<string,Saved>();private active?:{id:string;controller:AbortController;promise:Promise<void>};private closing=false;
  readonly binary:string;readonly model:string;
  constructor(private root:string,private library:Library,appRoot:string){const resources=unpackedPath(path.join(appRoot,'resources/speech'));this.binary=path.join(resources,`${process.platform}-${process.arch}`,process.platform==='win32'?'whisper-cli.exe':'whisper-cli');this.model=path.join(resources,'ggml-small-q5_1.bin');}
  async capabilities():Promise<SpeechCapabilities>{const available=!!await fs.stat(this.binary).catch(()=>null)&&(await fs.stat(this.model).catch(()=>null))?.size===190085487;return {available,model:'Whisper Small · 多語言 · 本機離線',engine:'whisper.cpp 1.8.6',...(!available?{reason:'此平台尚未安裝辨識引擎或模型，請執行 speech:install 後重新啟動。'}:{})};}
  async init(){await fs.mkdir(this.root,{recursive:true});for(const name of await fs.readdir(this.root)){if(!/^[0-9a-f-]{36}$/.test(name))continue;try{const saved:Saved=JSON.parse(await fs.readFile(path.join(this.root,name,'job.json'),'utf8'));saved.project=ProjectSchema.parse(saved.project);if(saved.job.status==='running'||saved.job.status==='queued'){saved.job.status='paused';saved.job.stage='上次工作已保存，可繼續辨識';}this.records.set(saved.job.id,saved);}catch{ /* An interrupted temporary file is not a completed checkpoint. */ }}}
  get isRunning(){return !!this.active||[...this.records.values()].some(s=>s.job.status==='queued');}
  get(id:string){const s=this.records.get(id);if(!s)throw new Error('辨識工作不存在');return {...s.job,cues:s.cues};}
  list(projectId?:string){return [...this.records.values()].filter(s=>!projectId||s.job.projectId===projectId).map(s=>({...s.job,cues:undefined})).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
  private dir(id:string){return path.join(this.root,id);}
  private persist(s:Saved){return atomicJson(path.join(this.dir(s.job.id),'job.json'),s);}
  private async fingerprints(p:Project,options:CaptionOptions){const ids=[...new Set(audibleClips(p,this.library.list(),options.clipId).map(c=>c.mediaId!))];return Promise.all(ids.map(async id=>{const st=await fs.stat(this.library.get(id).path).catch(()=>{throw new Error('找不到音訊素材，請先重新連結');});return {id,size:st.size,mtimeMs:st.mtimeMs};}));}
  async create(project:unknown,settings:unknown){const p=ProjectSchema.parse(project),options=CaptionOptionsSchema.parse(settings);const capabilities=await this.capabilities();if(!capabilities.available)throw new Error(capabilities.reason);const clips=audibleClips(p,this.library.list(),options.clipId);if(!clips.length)throw new Error('沒有可辨識的聲音。請將影片或音訊加入時間軸，並確認軌道未靜音。');const from=Math.min(...clips.map(c=>c.start/p.fps)),to=Math.max(...clips.map(c=>(c.start+c.duration)/p.fps));const windows=captionWindows(from,to);
    const job:CaptionJob={id:randomUUID(),projectId:p.id,name:p.name,fps:p.fps,options,signature:audioSignature(p,this.library.list(),options.clipId),status:'queued',stage:'等待辨識',progress:0,completedChunks:0,totalChunks:windows.length,duration:to-from,createdAt:new Date().toISOString(),cueCount:0};const saved:Saved={job,project:p,fingerprints:await this.fingerprints(p,options),cues:[],windows};await this.persist(saved);this.records.set(job.id,saved);this.pump();return job;
  }
  async pause(id:string){const s=this.records.get(id);if(!s)throw new Error('辨識工作不存在');if(s.job.status==='completed')return;s.job.status='paused';s.job.stage='已暫停，進度已保存';if(this.active?.id===id){this.active.controller.abort();await this.active.promise;}await this.persist(s);}
  async resume(id:string){const s=this.records.get(id);if(!s)throw new Error('辨識工作不存在');if(!['paused','failed'].includes(s.job.status))return;if(JSON.stringify(await this.fingerprints(s.project,s.job.options))!==JSON.stringify(s.fingerprints))throw new Error('來源檔案已變更，請建立新的辨識工作');s.job.status='queued';s.job.error=undefined;s.job.stage='等待繼續辨識';await this.persist(s);this.pump();}
  private pump(){if(this.active||this.closing)return;const s=[...this.records.values()].find(s=>s.job.status==='queued');if(!s)return;const controller=new AbortController();const promise=this.run(s,controller.signal).finally(()=>{this.active=undefined;this.pump();});this.active={id:s.job.id,controller,promise};}
  private async run(s:Saved,signal:AbortSignal){const {job}=s;const dir=this.dir(job.id);const wav=path.join(dir,'chunk.wav'),prefix=path.join(dir,'transcript');try{job.status='running';job.stage='準備音訊';await this.persist(s);
    for(let i=job.completedChunks;i<s.windows.length;i++){if(signal.aborted)throw new Error('工作已暫停');if(JSON.stringify(await this.fingerprints(s.project,job.options))!==JSON.stringify(s.fingerprints))throw new Error('來源檔案已變更，請建立新的辨識工作');const w=s.windows[i];job.stage=`擷取音訊 ${i+1} / ${s.windows.length}`;const hasAudio=await extractSpeechAudio(s.project,this.library,job.options,w.from,w.to,wav,signal);let cues:Cue[]=[];
      const audio=hasAudio?await prepareSpeechWav(wav):null;
      if(audio){job.stage=`${job.options.karaoke?'辨識並對齊字詞':job.options.mode==='lyrics'?'辨識歌詞':'辨識語音'} ${i+1} / ${s.windows.length}`;await runNative(this.binary,['-m',this.model,'-f',wav,'-l',job.options.language,'-t',String(Math.min(4,os.availableParallelism())),'-ojf','-of',prefix,'-ng','-np','-sns',...(job.options.karaoke?['-dtw','small','-nfa']:[]),'-bs','3','-bo','3'],{signal});const result:Transcript=JSON.parse(await fs.readFile(prefix+'.json','utf8'));cues=transcriptCues(result,{...w,from:w.from+audio.offset,to:w.from+audio.offset+audio.duration},job.fps,job.options);}
      if(signal.aborted)throw new Error('工作已暫停');if(s.cues.length+cues.length>20000)throw new Error('辨識結果超過 20,000 則，請改選片段分次處理');s.cues.push(...cues);job.completedChunks=i+1;job.progress=(i+1)/s.windows.length;job.cueCount=s.cues.length;await this.persist(s);await fs.rm(wav,{force:true});await fs.rm(prefix+'.json',{force:true});
    }
    job.status='completed';job.stage=job.cueCount?'辨識完成，請校對後加入時間軸':'未辨識到文字，請檢查音訊或指定語言';
  }catch(e){job.status=signal.aborted?'paused':'failed';job.stage=signal.aborted?'已暫停，進度已保存':'辨識失敗';if(!signal.aborted)job.error=e instanceof Error?e.message:String(e);}finally{await fs.rm(wav,{force:true}).catch(()=>{});await fs.rm(prefix+'.json',{force:true}).catch(()=>{});await this.persist(s).catch(e=>{job.status='failed';job.error=`無法儲存辨識進度：${e.message}`;});}}
  close(){this.closing=true;this.active?.controller.abort();}
}
