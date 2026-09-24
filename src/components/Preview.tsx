import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Maximize, Volume2, VolumeX } from 'lucide-react';
import { activeClips, clamp, clipOpacity, evaluateClip, endFrame, timecode, type Project, type Media, type FontInfo, type Clip } from '../../shared/model';
import { clipSvg } from '../../shared/text-svg';
import { drawTextFrame, hasKaraoke } from '../../shared/karaoke';
import { renderEffects } from '../../shared/effects';
import { effectLayersAt } from '../../shared/effect-timeline';
import { sampleRhythm } from '../../shared/rhythm';
import { useRhythm } from '../hooks/useRhythm';

type Props={project:Project;media:Media[];fonts:FontInfo[];frame:number;playing:boolean;setFrame:(v:number)=>void;setPlaying:(v:boolean)=>void;onSelect:(id:string)=>void;selected?:string;onError:(s:string)=>void};
type PreviewSource={element:HTMLVideoElement|HTMLImageElement|HTMLAudioElement;url:string;gain?:GainNode;node?:MediaElementAudioSourceNode};
type TextSurface={canvas:HTMLCanvasElement;clip?:Clip;fonts?:FontInfo[];fontRevision?:number;projectWidth?:number;frame?:number;animated?:boolean};
function releaseSource(source:PreviewSource){
  const el=source.element;el.onload=null;el.onerror=null;
  if(el instanceof HTMLMediaElement){el.onloadeddata=null;el.onseeked=null;el.pause();el.removeAttribute('src');el.load();}else el.removeAttribute('src');
  source.node?.disconnect();source.gain?.disconnect();
}
export default function Preview({project:p,media,fonts,frame,playing,setFrame,setPlaying,onSelect,selected,onError}:Props){
  const canvas=useRef<HTMLCanvasElement>(null);const stage=useRef<HTMLDivElement>(null);const sources=useRef(new Map<string,PreviewSource>());
  // Cache only active text, with at most eight 960×540 surfaces plus one reusable overflow surface.
  const textSurfaces=useRef(new Map<string,TextSurface>()),overflowText=useRef<TextSurface|undefined>(undefined);
  const fontLoads=useRef(new Map<string,Promise<FontFace[]>>()),[fontRevision,setFontRevision]=useState(0);
  const effectSource=useRef<HTMLCanvasElement|null>(null);const effectScratch=useRef<HTMLCanvasElement|null>(null);const rhythm=useRhythm(p,media);
  const audioContext=useRef<AudioContext|undefined>(undefined);const [muted,setMuted]=useState(false);const [ready,setReady]=useState(0);const props=useRef({p,frame,playing});props.current={p,frame,playing};
  const active=useMemo(()=>activeClips(p,frame),[p,frame]);const previewScale=Math.min(1,960/p.width,540/p.height),width=Math.max(1,Math.round(p.width*previewScale)),height=Math.max(1,Math.round(p.height*previewScale));
  const duration=useMemo(()=>endFrame(p),[p.clips]);
  const fontKey=JSON.stringify([...new Set(active.filter(c=>c.kind==='text').flatMap(c=>[fonts.find(f=>f.id===c.fontId)?.family??'Noto Sans TC','Noto Sans TC']))].sort());
  useEffect(()=>{let animation=0;let started=0;let first=frame;const animate=(now:number)=>{if(!started){started=now;first=props.current.frame;}const next=first+Math.floor((now-started)/1000*props.current.p.fps);const end=duration;if(next>=end){setFrame(Math.max(0,end-1));setPlaying(false);return;}if(next!==props.current.frame)setFrame(next);animation=requestAnimationFrame(animate);};if(playing)animation=requestAnimationFrame(animate);return()=>cancelAnimationFrame(animation);},[playing,setFrame,setPlaying,duration]);
  useEffect(()=>{
    const ids=new Set(active.map(c=>c.id));for(const [id,s] of sources.current){if(!ids.has(id)){releaseSource(s);sources.current.delete(id);}}
    for(const c of active){
      const m=media.find(m=>m.id===c.mediaId);let url='';
      if(c.kind==='text')continue;
      if(c.kind==='shape')url=`data:image/svg+xml;charset=utf-8,${encodeURIComponent(clipSvg(c,width,height,fonts,p.width))}`;
      else if(m)url=(m.proxy&&c.kind==='video')?m.proxy:`/media/${m.id}/original`;
      if(!url)continue;let source=sources.current.get(c.id);
      if(!source||source.url!==url){if(source)releaseSource(source);const el=c.kind==='video'?document.createElement('video'):c.kind==='audio'?document.createElement('audio'):new Image();
        source={element:el,url};sources.current.set(c.id,source);el.crossOrigin='anonymous';
        if(el instanceof HTMLMediaElement){el.preload='auto';el.onloadeddata=()=>setReady(v=>v+1);el.onseeked=()=>setReady(v=>v+1);el.onerror=()=>onError(`無法預覽「${c.name}」，可在素材庫建立相容的代理檔。`);if(el instanceof HTMLVideoElement)el.playsInline=true;}
        else el.onload=()=>setReady(v=>v+1);el.src=url;
      }
      if(source.element instanceof HTMLMediaElement){const el=source.element;const target=c.sourceIn+(frame-c.start)/p.fps*c.speed;
        if(Math.abs(el.currentTime-target)>(playing?.15:1/p.fps/2)){try{el.currentTime=target;}catch{}}
        el.playbackRate=c.speed;const t=p.tracks.find(t=>t.id===c.trackId);const rel=frame-c.start;const volume=muted||t?.muted?0:c.volume*(c.audioFadeIn?clamp(rel/c.audioFadeIn,0,1):1)*(c.audioFadeOut?clamp((c.duration-rel)/c.audioFadeOut,0,1):1);
        if(playing){try{if(!audioContext.current)audioContext.current=new AudioContext();if(!source.node){source.node=audioContext.current.createMediaElementSource(el);source.gain=audioContext.current.createGain();source.node.connect(source.gain);source.gain.connect(audioContext.current.destination);}void audioContext.current.resume();source.gain!.gain.value=volume;el.volume=1;}catch{el.volume=Math.min(1,volume);}if(el.paused)el.play().catch(()=>{});}
        else el.pause();
      }
    }
  },[p,media,fonts,frame,playing,muted,width,height]);
  useEffect(()=>{
    let canceled=false;const families=JSON.parse(fontKey) as string[];if(!families.length)return;
    void Promise.all(families.map(family=>{
      let promise=fontLoads.current.get(family);
      if(!promise){promise=document.fonts.load(`400 16px "${family}"`).catch(error=>{fontLoads.current.delete(family);throw error;});fontLoads.current.set(family,promise);}
      return promise;
    })).then(()=>{if(!canceled)setFontRevision(v=>v+1);}).catch(()=>{if(!canceled)onError('預覽字型載入失敗，請重新選取字型或開啟專案。');});
    return()=>{canceled=true;};
  },[fontKey]);
  useEffect(()=>{const cvs=canvas.current;const ctx=cvs?.getContext('2d');if(!cvs||!ctx)return;ctx.clearRect(0,0,width,height);ctx.fillStyle=p.background;ctx.fillRect(0,0,width,height);
    const textIds=new Set(active.filter(c=>c.kind==='text').map(c=>c.id));for(const [id,surface] of textSurfaces.current)if(!textIds.has(id)){surface.canvas.width=0;surface.canvas.height=0;textSurfaces.current.delete(id);}
    for(const c of active){if(c.kind==='audio')continue;let source:HTMLVideoElement|HTMLImageElement|HTMLCanvasElement|HTMLAudioElement|undefined=sources.current.get(c.id)?.element;
      if(c.kind==='text'){
        let surface=textSurfaces.current.get(c.id);
        if(!surface){if(textSurfaces.current.size<8){surface={canvas:document.createElement('canvas')};textSurfaces.current.set(c.id,surface);}else surface=overflowText.current??(overflowText.current={canvas:document.createElement('canvas')});}
        const changed=surface.clip!==c||surface.fonts!==fonts||surface.fontRevision!==fontRevision||surface.projectWidth!==p.width||surface.canvas.width!==width||surface.canvas.height!==height;
        if(changed)surface.animated=hasKaraoke(c);
        if(changed||surface.animated&&surface.frame!==frame){
          if(surface.canvas.width!==width||surface.canvas.height!==height){surface.canvas.width=width;surface.canvas.height=height;}
          drawTextFrame(surface.canvas.getContext('2d')!,c,width,height,fonts,p.width,frame-c.start);
          Object.assign(surface,{clip:c,fonts,fontRevision,projectWidth:p.width,frame});
        }
        source=surface.canvas;
      }
      if(!source||source instanceof HTMLAudioElement)continue;
      const sw=source instanceof HTMLVideoElement?source.videoWidth:source instanceof HTMLCanvasElement?source.width:source.naturalWidth;const sh=source instanceof HTMLVideoElement?source.videoHeight:source instanceof HTMLCanvasElement?source.height:source.naturalHeight;if(!sw||!sh)continue;
      const state=evaluateClip(c,frame-c.start);const crop=c.crop;const cw=sw*(1-2*crop),ch=sh*(1-2*crop);const ratio=c.fit==='cover'?Math.max(width/cw,height/ch):Math.min(width/cw,height/ch);
      ctx.save();ctx.translate(width/2+width*state.x,height/2+height*state.y);ctx.rotate(c.rotation*Math.PI/180);ctx.scale(state.scale*(c.flipX?-1:1),state.scale*(c.flipY?-1:1));ctx.globalAlpha=clipOpacity(c,frame-c.start);
      if(c.fit==='cover'){ctx.beginPath();ctx.rect(-width/2,-height/2,width,height);ctx.clip();}
      ctx.filter=`brightness(${Math.max(0,1+c.brightness)}) contrast(${c.contrast}) saturate(${c.saturation}) blur(${c.blur*width/p.width}px)`;
      if(c.chroma){const temp=document.createElement('canvas');temp.width=Math.round(cw*ratio);temp.height=Math.round(ch*ratio);const tctx=temp.getContext('2d',{willReadFrequently:true})!;tctx.drawImage(source,sw*crop,sh*crop,cw,ch,0,0,temp.width,temp.height);const data=tctx.getImageData(0,0,temp.width,temp.height);const rgb=c.chromaColor.slice(1).match(/../g)!.map(h=>parseInt(h,16));for(let i=0;i<data.data.length;i+=4){const distance=Math.sqrt(((data.data[i]-rgb[0])**2+(data.data[i+1]-rgb[1])**2+(data.data[i+2]-rgb[2])**2)/3)/255;data.data[i+3]*=clamp((distance-c.chromaSimilarity)/.08,0,1);}tctx.putImageData(data,0,0);ctx.drawImage(temp,-temp.width/2,-temp.height/2);}
      else ctx.drawImage(source,sw*crop,sh*crop,cw,ch,-cw*ratio/2,-ch*ratio/2,cw*ratio,ch*ratio);
      ctx.restore();
    }
    const layers=effectLayersAt(p,frame);if(layers.length){const source=effectSource.current??(effectSource.current=document.createElement('canvas'));if(source.width!==width||source.height!==height){source.width=width;source.height=height;}const sc=source.getContext('2d')!;const scratch=effectScratch.current??(effectScratch.current=document.createElement('canvas'));if(scratch.width!==width||scratch.height!==height){scratch.width=width;scratch.height=height;}
      for(const effects of layers){sc.clearRect(0,0,width,height);sc.drawImage(cvs,0,0);renderEffects(ctx,source,width,height,frame/p.fps,effects,sampleRhythm(p,frame/p.fps,rhythm.features,effects.speed),scratch.getContext('2d')!);}
    }
  },[p,frame,media,fonts,ready,fontRevision,width,height,rhythm.features]);
  useEffect(()=>{const map=sources.current;return()=>{for(const s of map.values())releaseSource(s);map.clear();for(const surface of textSurfaces.current.values()){surface.canvas.width=0;surface.canvas.height=0;}textSurfaces.current.clear();if(overflowText.current){overflowText.current.canvas.width=0;overflowText.current.canvas.height=0;overflowText.current=undefined;}void audioContext.current?.close();audioContext.current=undefined;};},[]);
  const seek=(f:number)=>{setPlaying(false);setFrame(clamp(f,0,Math.max(0,duration-1)));};
  return <section className="preview-panel"><div className="panel-header"><span>播放器</span><span className="subtle">{p.width} × {p.height} <span className="dot">·</span> {p.fps} fps</span></div>
    <div className="preview-stage" ref={stage}><div className="canvas-wrap" style={{aspectRatio:`${p.width}/${p.height}`}}><canvas ref={canvas} width={width} height={height} onClick={()=>{const clip=active.slice().reverse().find(c=>c.kind!=='audio');if(clip)onSelect(clip.id);}}/>
    {rhythm.status&&<div className={`fx-analysis ${rhythm.error?'error':''}`} role="status">{rhythm.status}{rhythm.error&&<button onClick={rhythm.retry}>重試</button>}</div>}
    {!p.clips.length&&<div className="preview-empty"><div className="empty-frame"><Play size={30}/></div><h2>每一個故事，都從這裡開始。</h2><p>匯入素材，拖放到時間軸</p></div>}</div></div>
    <div className="player-controls"><div className="time-display"><b>{timecode(frame,p.fps)}</b><span>/ {timecode(duration,p.fps)}</span></div><div className="play-buttons"><button data-tooltip="回到開頭" aria-label="回到開頭" onClick={()=>seek(0)}><SkipBack size={16}/></button><button className="play-main" data-tooltip={playing?'暫停（Space）':'播放（Space）'} aria-label={playing?'暫停（Space）':'播放（Space）'} disabled={!p.clips.length} onClick={()=>{if(frame>=duration-1)setFrame(0);setPlaying(!playing);}}>{playing?<Pause size={18} fill="currentColor"/>:<Play size={18} fill="currentColor"/>}</button><button data-tooltip="到結尾" aria-label="到結尾" onClick={()=>seek(duration-1)}><SkipForward size={16}/></button></div><div className="player-options"><button data-tooltip={muted?'取消預覽靜音':'預覽靜音'} aria-label={muted?'取消預覽靜音':'預覽靜音'} onClick={()=>setMuted(!muted)}>{muted?<VolumeX size={16}/>:<Volume2 size={16}/>}</button><span className="preview-quality">540p 預覽</span><button data-tooltip="全螢幕預覽" aria-label="全螢幕預覽" onClick={()=>void stage.current?.requestFullscreen()}><Maximize size={16}/></button></div></div>
  </section>;
}
