import { z } from 'zod';
import { EffectsSchema, defaultEffects } from './effects';
import { KaraokeSchema } from './karaoke';

export const uid = () => crypto.randomUUID();
export const FpsSchema = z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(50), z.literal(60)]);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const frame = z.number().int().min(0).max(60 * 60 * 24 * 60);
export const KeyframeSchema = z.object({ frame, x: z.number().min(-2).max(2), y: z.number().min(-2).max(2), scale: z.number().min(0.05).max(4), opacity: z.number().min(0).max(1) });
export const ClipSchema = z.object({
  id: z.string().uuid(), trackId: z.string().min(1).max(100), kind: z.enum(['video', 'image', 'audio', 'text', 'shape', 'effect']),
  mediaId: z.string().uuid().optional(), name: z.string().max(300), start: frame, duration: frame.min(1),
  groupId: z.string().uuid().optional(), linkId: z.string().uuid().optional(), effects: EffectsSchema.optional(),
  captionJobId: z.string().uuid().optional(), captionType: z.enum(['captions','lyrics']).optional(),
  sourceIn: z.number().min(0).max(86400).default(0), speed: z.number().min(0.25).max(4).default(1),
  x: z.number().min(-2).max(2).default(0), y: z.number().min(-2).max(2).default(0), scale: z.number().min(0.05).max(4).default(1),
  rotation: z.number().min(-180).max(180).default(0), opacity: z.number().min(0).max(1).default(1),
  flipX: z.boolean().default(false), flipY: z.boolean().default(false), fit: z.enum(['contain','cover']).default('contain'),
  crop: z.number().min(0).max(0.45).default(0), volume: z.number().min(0).max(2).default(1),
  fadeIn: frame.default(0), fadeOut: frame.default(0), audioFadeIn: frame.default(0), audioFadeOut: frame.default(0),
  brightness: z.number().min(-1).max(1).default(0), contrast: z.number().min(0.1).max(3).default(1), saturation: z.number().min(0).max(3).default(1),
  blur: z.number().min(0).max(20).default(0), chroma: z.boolean().default(false), chromaColor: hex.default('#00ff00'),
  chromaSimilarity: z.number().min(0.01).max(0.5).default(0.15), denoise: z.boolean().default(false),
  text: z.string().max(3000).default('在這裡，寫下你的故事。'), fontId: z.string().max(100).default('notosanstc'),
  fontSize: z.number().min(12).max(300).default(72), color: hex.default('#ffffff'), textBackground: z.boolean().default(false),
  karaoke: KaraokeSchema.default({}),
  shape: z.enum(['rectangle','circle']).default('rectangle'), keyframes: z.array(KeyframeSchema).max(300).default([]),
});
export const TrackSchema = z.object({ id: z.string().min(1).max(100), name: z.string().max(100), kind: z.enum(['video','audio','text','effect']), muted: z.boolean().default(false), hidden: z.boolean().default(false), locked: z.boolean().default(false) });
export const ProjectSchema = z.object({
  version: z.literal(1), id: z.string().uuid(), name: z.string().min(1).max(120), width: z.number().int().min(160).max(4096), height: z.number().int().min(160).max(4096),
  fps: FpsSchema, background: hex.default('#101418'), tracks: z.array(TrackSchema).min(1).max(32), clips: z.array(ClipSchema).max(20000),
  effects: EffectsSchema.default({}),
  markers: z.array(z.object({ id: z.string().uuid(), frame, name: z.string().max(100) })).max(1000).default([]), updatedAt: z.string().default(''),
}).superRefine((p, ctx) => {
  if (p.width % 2 || p.height % 2) ctx.addIssue({ code:'custom', message:'畫布尺寸必須為偶數' });
  if (new Set(p.clips.map(c => c.id)).size !== p.clips.length || new Set(p.tracks.map(t => t.id)).size !== p.tracks.length) ctx.addIssue({ code:'custom', message:'軌道或片段 ID 重複' });
  for (const c of p.clips) {
    if(c.kind==='effect' && (!c.effects || p.tracks.find(t=>t.id===c.trackId)?.kind!=='effect')) ctx.addIssue({code:'custom',message:'特效片段需要特效參數與特效軌道'});
    if(c.kind!=='effect' && p.tracks.find(t=>t.id===c.trackId)?.kind==='effect') ctx.addIssue({code:'custom',message:'特效軌道只能放置特效片段'});
    if (!p.tracks.some(t => t.id === c.trackId)) ctx.addIssue({ code:'custom', message:'片段所屬軌道不存在' });
    if (['video','audio','image'].includes(c.kind) && !c.mediaId) ctx.addIssue({ code:'custom', message:'片段缺少素材' });
    if (c.start + c.duration > 60 * 60 * 24 * p.fps) ctx.addIssue({code:'custom', message:'專案長度超過 24 小時'});
  }
});
export type Clip = z.infer<typeof ClipSchema>;
export type Track = z.infer<typeof TrackSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Keyframe = z.infer<typeof KeyframeSchema>;
export type Media = { id:string; name:string; kind:'video'|'audio'|'image'; duration:number; width:number; height:number; size:number; hasAudio:boolean; thumbnail?:string; proxy?:string; proxyStatus?:'queued'|'processing'|'ready'|'error'; waveform?:number[]; missing?:boolean; revision?:number };
export type ExportSettings = { resolution:720|1080|2160; quality:'standard'|'high'; encoder:'libx264'|'h264_videotoolbox' };
export type ExportJob = { id:string; name:string; status:'queued'|'running'|'paused'|'failed'|'completed'; progress:number; completedSegments:number; totalSegments:number; duration:number; createdAt:string; error?:string; output?:string; settings:ExportSettings };
export type FontInfo = { id:string; family:string; label:string; language:'繁體中文'|'Latin'; category:string; file:string; license:string; source:string };

export function newProject(): Project { return {version:1,id:uid(),name:'未命名專案',width:1920,height:1080,fps:30,background:'#101418',tracks:[
  {id:'text',name:'文字與字幕',kind:'text',muted:false,hidden:false,locked:false},
  {id:'overlay',name:'疊加畫面',kind:'video',muted:false,hidden:false,locked:false},
  {id:'main',name:'主影片',kind:'video',muted:false,hidden:false,locked:false},
  {id:'voice',name:'人聲',kind:'audio',muted:false,hidden:false,locked:false},
  {id:'music',name:'音樂',kind:'audio',muted:false,hidden:false,locked:false},
],clips:[],effects:defaultEffects(),markers:[],updatedAt:new Date().toISOString()}; }
export function makeClip(partial: Partial<Clip> & Pick<Clip,'kind'|'trackId'|'start'|'duration'>): Clip { return ClipSchema.parse({id:uid(),name:partial.kind === 'text' ? '文字' : '新片段',...partial}); }
export const endFrame = (p:Project) => Math.max(0,...p.clips.map(c=>c.start+c.duration));
export const seconds = (frame:number, fps:number) => frame / fps;
export const clamp = (n:number, min:number, max:number) => Math.max(min,Math.min(max,n));
export function timecode(frame:number,fps:number) { const f=Math.max(0,Math.round(frame)); return [Math.floor(f/fps/3600),Math.floor(f/fps/60)%60,Math.floor(f/fps)%60, f%fps].map(n=>String(n).padStart(2,'0')).join(':'); }
export function shortTime(s:number) { return s>=3600 ? `${Math.floor(s/3600)}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(Math.floor(s)%60).padStart(2,'0')}` : `${Math.floor(s/60)}:${String(Math.floor(s)%60).padStart(2,'0')}`; }
export function splitClip(clip:Clip, at:number, fps:number): Clip[] {
  const offset = at - clip.start;
  if(offset<=0 || offset>=clip.duration) return [clip];
  const middle = evaluateClip(clip,offset);
  const leftKeys = clip.keyframes.length ? [...clip.keyframes.filter(k=>k.frame<offset), {frame:offset,...middle}] : [];
  const rightKeys = clip.keyframes.length ? [{frame:0,...middle},...clip.keyframes.filter(k=>k.frame>offset).map(k=>({...k,frame:k.frame-offset}))] : [];
  return [{...clip,duration:offset,fadeOut:0,audioFadeOut:0,keyframes:leftKeys}, {...clip,id:uid(),start:at,duration:clip.duration-offset,sourceIn:clip.sourceIn+offset/fps*clip.speed,fadeIn:0,audioFadeIn:0,keyframes:rightKeys,karaoke:{...clip.karaoke,offset:(clip.karaoke?.offset??0)+offset}}];
}
export function evaluateClip(c:Clip,relativeFrame:number): Omit<Keyframe,'frame'> {
  const keys = [...c.keyframes].sort((a,b)=>a.frame-b.frame);
  if (!keys.length) return {x:c.x,y:c.y,scale:c.scale,opacity:c.opacity};
  const next=keys.find(k=>k.frame>=relativeFrame)??keys[keys.length-1];
  const prev=[...keys].reverse().find(k=>k.frame<=relativeFrame)??keys[0];
  const f=next.frame===prev.frame?0:clamp((relativeFrame-prev.frame)/(next.frame-prev.frame),0,1);
  return {x:prev.x+(next.x-prev.x)*f,y:prev.y+(next.y-prev.y)*f,scale:prev.scale+(next.scale-prev.scale)*f,opacity:prev.opacity+(next.opacity-prev.opacity)*f};
}
export function clipOpacity(c:Clip,relative:number) { return evaluateClip(c,relative).opacity * (c.fadeIn ? clamp(relative/c.fadeIn,0,1):1) * (c.fadeOut?clamp((c.duration-relative)/c.fadeOut,0,1):1); }
export function activeClips(p:Project,at:number) { const order=new Map(p.tracks.slice().reverse().filter(t=>!t.hidden).map((t,i)=>[t.id,i]));return p.clips.filter(c=>c.kind!=='effect'&&order.has(c.trackId)&&c.start<=at&&c.start+c.duration>at).sort((a,b)=>order.get(a.trackId)!-order.get(b.trackId)!); }
export function parseSrt(text:string,fps:number,trackId='text'): Clip[] {
  const blocks=text.replace(/^\uFEFF/,'').replace(/\r/g,'').trim().split(/\n\s*\n/);
  const parse=(s:string)=> { const m=s.match(/(\d+):(\d{2}):(\d{2})[,.](\d{3})/); return m?Math.round((+m[1]*3600 + +m[2]*60 + +m[3]+ +m[4]/1000)*fps):NaN; };
  return blocks.flatMap(b=>{const lines=b.split('\n');const i=lines.findIndex(l=>l.includes('-->'));if(i<0)return[];const [a,z]=lines[i].split('-->').map(parse); const content=lines.slice(i+1).join('\n').replace(/<[^>]*>/g,'');if(!Number.isFinite(a)||!Number.isFinite(z)||z<=a||!content.trim())return[];return [makeClip({kind:'text',trackId,start:a,duration:z-a,captionType:'captions',name:content.slice(0,30),text:content,y:0.35,fontSize:56,textBackground:true})];});
}
export function toSrt(p:Project) { const stamp=(f:number)=>{const ms=Math.round(f/p.fps*1000);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};return p.clips.filter(c=>c.kind==='text').sort((a,b)=>a.start-b.start).map((c,i)=>`${i+1}\n${stamp(c.start)} --> ${stamp(c.start+c.duration)}\n${c.text}\n`).join('\n'); }
