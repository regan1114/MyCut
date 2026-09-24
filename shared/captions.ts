import { insertTimedClips } from './placement';
import { z } from 'zod';
import { validWordTiming, defaultKaraoke, enhancedLrc, type WordTiming } from './karaoke';
import { makeClip, uid, type Media, type Project } from './model';

export const CaptionOptionsSchema=z.object({mode:z.enum(['captions','lyrics']),language:z.enum(['auto','zh','en','ja','ko','es','fr','de']).default('auto'),traditional:z.boolean().default(true),clipId:z.string().uuid().optional(),vocalFocus:z.boolean().default(true),karaoke:z.boolean().optional()});
export type CaptionOptions=z.infer<typeof CaptionOptionsSchema>;
export type Cue={id:string;start:number;duration:number;text:string;confidence?:number;words?:WordTiming[]};
export type CaptionJob={id:string;projectId:string;name:string;fps:number;options:CaptionOptions;signature:string;status:'queued'|'running'|'paused'|'failed'|'completed';stage:string;progress:number;completedChunks:number;totalChunks:number;duration:number;createdAt:string;error?:string;cueCount:number;cues?:Cue[]};
export type SpeechCapabilities={available:boolean;model:string;engine:string;reason?:string};
export function audibleClips(p:Project,media:Media[],clipId?:string){return p.clips.filter(c=>(c.kind==='video'||c.kind==='audio')&&(!clipId||c.id===clipId)&&c.volume>0&&p.tracks.some(t=>t.id===c.trackId&&!t.hidden&&!t.muted)&&media.some(m=>m.id===c.mediaId&&m.hasAudio));}
export function audioSignature(p:Project,media:Media[],clipId?:string){return JSON.stringify({fps:p.fps,clips:audibleClips(p,media,clipId).map(c=>({id:c.id,mediaId:c.mediaId,start:c.start,duration:c.duration,sourceIn:c.sourceIn,speed:c.speed,volume:c.volume,fadeIn:c.audioFadeIn,fadeOut:c.audioFadeOut,denoise:c.denoise})).sort((a,b)=>a.id.localeCompare(b.id))});}
export function captionWindows(from:number,to:number,coreSeconds=30){const windows=[];for(let core=from;core<to;core+=coreSeconds)windows.push({from:Math.max(from,core-1),to:Math.min(to,core+coreSeconds+1),coreFrom:core,coreTo:Math.min(to,core+coreSeconds)});return windows;}
export function validateCues(cues:Cue[],fps:number){if(!cues.length)throw new Error('沒有可加入的字幕');if(cues.length>20000)throw new Error('字幕數量過多');for(const c of cues)if(!c.text.trim()||c.text.length>3000||!Number.isInteger(c.start)||c.start<0||!Number.isInteger(c.duration)||c.duration<1||c.start+c.duration>86400*fps)throw new Error('請檢查字幕文字、開始與結束時間');}
export function applyCaptions(p:Project,job:CaptionJob,cues:Cue[],media:Media[],fontId='notosanstc'):Project{
  if(p.id!==job.projectId)throw new Error('辨識結果屬於另一個專案');
  if(audioSignature(p,media,job.options.clipId)!==job.signature)throw new Error('音訊時間軸已改變，請重新辨識以確保時間正確');
  validateCues(cues,p.fps);const existing=p.clips.find(c=>c.captionJobId===job.id);const track=existing? p.tracks.find(t=>t.id===existing.trackId):undefined;
  const oldTrackIds=new Set(p.clips.filter(c=>c.captionJobId===job.id).map(c=>c.trackId));if(p.tracks.some(t=>oldTrackIds.has(t.id)&&t.locked))throw new Error('請先解鎖這批字幕的軌道');if(!track&&p.tracks.length>=32)throw new Error('最多 32 條軌道，請先移除一條空軌道');
  const trackId=track?.id??uid();const name=job.options.mode==='lyrics'?'自動歌詞':'自動字幕';
  const clips=cues.map(c=>makeClip({kind:'text',trackId,start:c.start,duration:c.duration,text:c.text,name:c.text.trim().slice(0,30),fontId,fontSize:56,y:.35,textBackground:true,captionJobId:job.id,captionType:job.options.mode,karaoke:{...defaultKaraoke(),enabled:!!job.options.karaoke&&validWordTiming(c.text,c.words??[]),source:'whisper',words:validWordTiming(c.text,c.words??[])?c.words!:[]}}));
  const remaining=p.clips.filter(c=>c.captionJobId!==job.id);const retained=p.tracks.filter(t=>t.id===trackId||!oldTrackIds.has(t.id)||remaining.some(c=>c.trackId===t.id));
  const result=insertTimedClips({...p,tracks:track?retained:[{id:trackId,name,kind:'text' as const,muted:false,hidden:false,locked:false},...p.tracks],clips:remaining},clips);if(result.clips.length>20000)throw new Error('專案片段數超過 20,000');return result;
}
export function cuesToSrt(cues:Cue[],fps:number){const stamp=(f:number)=>{const ms=Math.round(f/fps*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};return [...cues].sort((a,b)=>a.start-b.start).map((c,i)=>`${i+1}\n${stamp(c.start)} --> ${stamp(c.start+c.duration)}\n${c.text}\n`).join('\n');}
export function cuesToLrc(cues:Cue[],fps:number){return [...cues].sort((a,b)=>a.start-b.start).map(c=>{const cs=Math.round(c.start/fps*100);return `[${String(Math.floor(cs/6000)).padStart(2,'0')}:${String(Math.floor(cs/100)%60).padStart(2,'0')}.${String(cs%100).padStart(2,'0')}]${c.text.replace(/\n/g,' ')}`;}).join('\n');}

export function cuesToEnhancedLrc(cues:Cue[],fps:number){return cues.map(c=>enhancedLrc(c.text,c.words??[],fps,c.start)).join('\n');}
