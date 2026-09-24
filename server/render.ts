import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Resvg } from '@resvg/resvg-js';
import type { Clip, ExportSettings, FontInfo, Project } from '../shared/model';
import { clipSvg } from '../shared/text-svg';
import type { Library } from './library';
import { ffmpeg } from './native';
import { segmentHasEffects } from '../shared/effect-timeline';
import { renderEffectStream } from './effects-render';
import { hasKaraoke } from '../shared/karaoke';
import { renderKaraokeSegment } from './karaoke-render';
import { renderTextPng } from './text-render';

const n=(v:number)=>Number(v.toFixed(8)).toString();
export function outputSize(p:Project,resolution:number){const ratio=resolution/Math.min(p.width,p.height);return {width:Math.round(p.width*ratio/2)*2,height:Math.round(p.height*ratio/2)*2};}
export function segmentPlan(p:Project,chunkSeconds=10){
  const end=Math.max(0,...p.clips.map(c=>c.start+c.duration));const set=new Set([0,end]);
  for(let f=chunkSeconds*p.fps;f<end;f+=chunkSeconds*p.fps)set.add(f);
  for(const c of p.clips){set.add(c.start);set.add(c.start+c.duration);}
  const marks=[...set].sort((a,b)=>a-b);return marks.slice(0,-1).map((from,i)=>({from,to:marks[i+1]}));
}
export function keyExpression(c:Clip,prop:'x'|'y'|'scale'|'opacity',time:string,fps:number){
  const keys=[...c.keyframes].sort((a,b)=>a.frame-b.frame);if(!keys.length)return n(c[prop]);
  let expression=n(keys[keys.length-1][prop]);
  for(let i=keys.length-2;i>=0;i--){const a=keys[i],b=keys[i+1];if(a.frame===b.frame)continue;const av=n(a[prop]);expression=`if(lt(${time},${n(b.frame/fps)}),${av}+(${n(b[prop]-a[prop])})*clip((${time}-${n(a.frame/fps)})/${n((b.frame-a.frame)/fps)},0,1),${expression})`;}
  return expression;
}
export function tempo(speed:number){const filters=[];while(speed<0.5){filters.push('atempo=0.5');speed/=0.5;}while(speed>2){filters.push('atempo=2');speed/=2;}filters.push(`atempo=${n(speed)}`);return filters.join(',');}
export async function renderSegment(p:Project,library:Library,fonts:FontInfo[],fontRoot:string,from:number,to:number,settings:ExportSettings,dest:string,workdir:string,options:{signal?:AbortSignal;onProgress?:(s:number)=>void;size?:{width:number;height:number}}={}){
  const {width:W,height:H}=options.size??outputSize(p,settings.resolution);const dur=(to-from)/p.fps;
  const tracks=p.tracks.slice().reverse();
  const clips=tracks.flatMap(t=>t.hidden?[]:p.clips.filter(c=>c.kind!=='effect'&&c.trackId===t.id&&c.start<to&&c.start+c.duration>from));
  if(clips.length>32)throw new Error('同時疊加片段超過 32 個，請先合併部分軌道再匯出。');
  const args=['-f','lavfi','-i',`color=c=${p.background}:s=${W}x${H}:r=${p.fps}:d=${n(dur)}`,'-f','lavfi','-i','anullsrc=r=48000:cl=stereo'];
  const filters=[`[0:v]format=yuv420p[base0]`,`[1:a]atrim=end_sample=${Math.round(dur*48000)},asetpts=PTS-STARTPTS[silence]`];let input=2,layer=0;const audio=['[silence]'];
  await fs.mkdir(workdir,{recursive:true});
  const temporary:string[]=[],karaokeCount=clips.filter(hasKaraoke).length;let karaokeDone=0;
  const renderingOptions={...options,onProgress:karaokeCount?(s:number)=>options.onProgress?.(dur*.15+s*.85):options.onProgress};
  try{
  for(const c of clips){
    const track=p.tracks.find(t=>t.id===c.trackId)!;const start=Math.max(from,c.start),end=Math.min(to,c.start+c.duration);const length=(end-start)/p.fps,delay=(start-from)/p.fps,elapsed=(start-c.start)/p.fps;
    let file:string,hasAudio=false;const animatedText=hasKaraoke(c);
    if(animatedText){file=path.join(workdir,`karaoke-${c.id}-${from}.mov`);temporary.push(file);await renderKaraokeSegment(c,p,fonts,fontRoot,start,end,W,H,file,options.signal,ratio=>options.onProgress?.(dur*.15*(karaokeDone+ratio)/karaokeCount));karaokeDone++;}
    else if(c.kind==='text'||c.kind==='shape'){
      const svg=clipSvg(c,W,H,fonts,p.width);const hash=createHash('sha256').update(c.kind==='text'?'canvas-text-v1':'svg-shape-v1').update(svg).digest('hex').slice(0,24);file=path.join(workdir,`${hash}.png`);
      if(!await fs.stat(file).catch(()=>null)){
        await fs.writeFile(file,c.kind==='text'?renderTextPng(c,W,H,fonts,fontRoot,p.width):new Resvg(svg,{font:{loadSystemFonts:false}}).render().asPng());
      }
    }else{const media=library.get(c.mediaId!);file=media.path;hasAudio=media.hasAudio;}
    if(animatedText)args.push('-t',n(length),'-i',file);
    else if(c.kind==='image'||c.kind==='text'||c.kind==='shape')args.push('-loop','1','-framerate',String(p.fps),'-t',n(length),'-i',file);
    else args.push('-ss',n(c.sourceIn+elapsed*c.speed),'-t',n(length*c.speed),'-i',file);
    const idx=input++;
    if(c.kind!=='audio'){
      const t=`(t+${n(elapsed)})`,T=`(T+${n(elapsed)})`;const scale=keyExpression(c,'scale',t,p.fps);
      const chain=[`setpts=(PTS-STARTPTS)/${n(animatedText?1:c.speed)}`,`fps=${p.fps}`,`trim=duration=${n(length)}`];
      if(c.crop>0)chain.push(`crop=iw*${n(1-2*c.crop)}:ih*${n(1-2*c.crop)}`);
      if(c.flipX)chain.push('hflip');if(c.flipY)chain.push('vflip');
      chain.push(`scale=${W}:${H}:force_original_aspect_ratio=${c.fit==='cover'?'increase':'decrease'}:flags=bicubic`);
      if(c.fit==='cover')chain.push(`crop=${W}:${H}`);
      if(c.brightness||c.contrast!==1||c.saturation!==1)chain.push(`eq=brightness=${c.brightness}:contrast=${c.contrast}:saturation=${c.saturation}`);
      if(c.blur)chain.push(`gblur=sigma=${n(c.blur*W/p.width)}`);
      chain.push('format=rgba');
      if(c.chroma)chain.push(`colorkey=${c.chromaColor}:${c.chromaSimilarity}:0.08`);
      chain.push(`pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black@0`);
      if(c.rotation)chain.push(`rotate=${n(c.rotation*Math.PI/180)}:ow=rotw(${n(c.rotation*Math.PI/180)}):oh=roth(${n(c.rotation*Math.PI/180)}):c=black@0`);
      if(c.scale!==1||c.keyframes.length)chain.push(`scale=w='max(2,trunc(iw*(${scale})/2)*2)':h='max(2,trunc(ih*(${scale})/2)*2)':eval=frame:flags=bicubic`);
      let opacity=keyExpression(c,'opacity',T,p.fps);
      if(c.fadeIn)opacity+=`*clip(${T}/${n(c.fadeIn/p.fps)},0,1)`;
      if(c.fadeOut)opacity+=`*clip((${n(c.duration/p.fps)}-${T})/${n(c.fadeOut/p.fps)},0,1)`;
      if(c.keyframes.some(k=>k.opacity!==c.keyframes[0].opacity)||c.fadeIn||c.fadeOut)chain.push(`geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*(${opacity})'`);
      else {const alpha=c.keyframes[0]?.opacity??c.opacity;if(alpha!==1)chain.push(`colorchannelmixer=aa=${n(alpha)}`);}
      chain.push(`setpts=PTS+${n(delay)}/TB`);filters.push(`[${idx}:v]${chain.join(',')}[v${idx}]`);
      const local=`(t+${n((from-c.start)/p.fps)})`;
      filters.push(`[base${layer}][v${idx}]overlay=x='(W-w)/2+W*(${keyExpression(c,'x',local,p.fps)})':y='(H-h)/2+H*(${keyExpression(c,'y',local,p.fps)})':eof_action=pass:enable='gte(t,${n(delay)})*lt(t,${n(delay+length)})':format=auto[base${++layer}]`);
    }
    if(hasAudio&&!track.muted&&c.volume>0){
      const local=`(t+${n(elapsed)})`;let vol=n(c.volume);if(c.audioFadeIn)vol+=`*clip(${local}/${n(c.audioFadeIn/p.fps)},0,1)`;if(c.audioFadeOut)vol+=`*clip((${n(c.duration/p.fps)}-${local})/${n(c.audioFadeOut/p.fps)},0,1)`;
      const af=[`asetpts=PTS-STARTPTS`,tempo(c.speed),'aresample=48000','aformat=sample_fmts=fltp:channel_layouts=stereo',`atrim=duration=${n(length)}`];if(c.denoise)af.push('afftdn=nf=-25');af.push(`volume='${vol}':eval=frame`,`adelay=${Math.round(delay*48000)}S:all=1`);filters.push(`[${idx}:a]${af.join(',')}[a${idx}]`);audio.push(`[a${idx}]`);
    }
  }
  filters.push(`[base${layer}]format=yuv420p[vout]`);
  filters.push(`${audio.join('')}amix=inputs=${audio.length}:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.98:latency=1,apad,atrim=end_sample=${Math.round(dur*48000)}[aout]`);
  const graph=path.join(workdir,`graph-${from}.txt`);await fs.writeFile(graph,filters.join(';\n'));
  if(segmentHasEffects(p,from,to)){
    try{await renderEffectStream([...args,'-filter_complex_script',graph],p,library,fonts,fontRoot,from,to,W,H,settings,dest,workdir,renderingOptions);}finally{await fs.rm(graph,{force:true});}
    return;
  }
  args.push('-filter_complex_script',graph,'-map','[vout]','-map','[aout]','-c:v',settings.encoder);
  if(settings.encoder==='libx264')args.push('-preset','fast','-crf',settings.quality==='high'?'18':'23','-threads','2');
  else args.push('-b:v',`${settings.resolution===2160?40:settings.resolution===1080?12:6}M`,'-allow_sw','1');
  args.push('-pix_fmt','yuv420p','-r',String(p.fps),'-video_track_timescale',String(p.fps*1000),'-c:a','pcm_s16le','-ar','48000','-ac','2','-t',n(dur),'-progress','pipe:1','-nostats',dest);
  try{await ffmpeg(args,renderingOptions);}finally{await fs.rm(graph,{force:true});}
  }finally{await Promise.all(temporary.map(file=>fs.rm(file,{force:true})));}
}
