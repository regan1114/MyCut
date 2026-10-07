import { platform, shortcut } from '../platform';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Scissors, Trash2, Copy, Magnet, ZoomIn, ZoomOut, ScanLine, Plus, Eye, EyeOff, Volume2, VolumeX, LockKeyhole, LockKeyholeOpen, Type, Film, Music2, Flag, Layers, ChevronRight, Group, Ungroup, Link2, Unlink2, Sparkles } from 'lucide-react';
import { clamp, endFrame, shortTime, timecode, uid, type Clip, type Media, type Project } from '../../shared/model';

import { compatibleTrack, editableSelection, expandSelection, moveSelection, trimSelection } from '../../shared/editing';
import { primaryTextTrack } from '../../shared/placement';

const zoomModifier=platform==='darwin'?'metaKey':'altKey';
const zoomKey=platform==='darwin'?'Meta':'Alt';

type Props={project:Project;media:Media[];frame:number;selected?:string;selectedIds:string[];onSelection:(ids:string[])=>void;onRelation:(key:'groupId'|'linkId',enabled:boolean)=>void;onError:(e:unknown)=>void;onSelect:(id?:string)=>void;setFrame:(n:number)=>void;setPlaying:(b:boolean)=>void;update:(fn:(p:Project)=>Project,history?:boolean)=>void;checkpoint:()=>void;onSplit:()=>void;onDelete:()=>void;onDuplicate:()=>void;onAddMedia:(id:string,track?:string,start?:number)=>void;onAddTrack:()=>void;onMarker:()=>void};
export default function Timeline({project:p,media,frame,selected,selectedIds,onSelection,onRelation,onError,onSelect,setFrame,setPlaying,update,checkpoint,onSplit,onDelete,onDuplicate,onAddMedia,onAddTrack,onMarker}:Props){
 const gestureCleanup=useRef<(()=>void)|undefined>(undefined);
 useEffect(()=>()=>gestureCleanup.current?.(),[]);
 const [marquee,setMarquee]=useState<{x:number;y:number;width:number;height:number}>();
 const [snapGuide,setSnapGuide]=useState<number>();
 const [textDragPreview,setTextDragPreview]=useState<{id:string;label:string;start:number;duration:number;top:number;valid:boolean;target?:string;insertion?:number}>();
 const [seekVersion,setSeekVersion]=useState(0);
 const [zoom,setZoom]=useState(55);const [snap,setSnap]=useState(true);const [view,setView]=useState({left:0,width:800});const scroll=useRef<HTMLDivElement>(null);const end=useMemo(()=>endFrame(p),[p.clips]);const totalSeconds=Math.max(30,end/p.fps+10,frame/p.fps+10);const width=Math.max(view.width,totalSeconds*zoom);const pxFrame=zoom/p.fps;
 const zoomAnchor=useRef<{seconds:number;offset:number}|undefined>(undefined);
 const timeline=useRef<HTMLElement>(null);
 const zoomKeyPressed=useRef(false);
 const mediaById=useMemo(()=>new Map(media.map(m=>[m.id,m])),[media]);
 const byTrack=useMemo(()=>{const groups=new Map<string,Clip[]>();for(const c of p.clips){const group=groups.get(c.trackId)??[];group.push(c);groups.set(c.trackId,group);}return groups;},[p.clips]);
 useEffect(()=>{const el=scroll.current;if(!el)return;const obs=new ResizeObserver(()=>setView(v=>({...v,width:el.clientWidth})));obs.observe(el);return()=>obs.disconnect();},[]);
 useEffect(()=>{
   // Accept a held Command/Alt key even when the wheel event lacks its modifier.
   const key=(event:KeyboardEvent)=>{zoomKeyPressed.current=event[zoomModifier]||(event.type==='keydown'&&event.key===zoomKey);};
   const blur=()=>{zoomKeyPressed.current=false;gestureCleanup.current?.();setMarquee(undefined);};
   window.addEventListener('keydown',key,true);window.addEventListener('keyup',key,true);window.addEventListener('blur',blur);
   return()=>{window.removeEventListener('keydown',key,true);window.removeEventListener('keyup',key,true);window.removeEventListener('blur',blur);};
 },[]);
 useEffect(()=>{
   const el=scroll.current,container=timeline.current;if(!el||!container)return;
   const wheel=(event:WheelEvent)=>{
     const amount=event.deltaY||event.deltaX;
     if(!(event[zoomModifier]||zoomKeyPressed.current)||!amount)return;event.preventDefault();if(gestureCleanup.current)return;
     const delta=amount*(event.deltaMode===1?16:event.deltaMode===2?el.clientHeight:1),next=clamp(zoom*Math.exp(-clamp(delta,-100,100)*.002),.12,200);if(next===zoom)return;
     const offset=clamp(event.clientX-el.getBoundingClientRect().left,0,el.clientWidth);
     zoomAnchor.current={seconds:(el.scrollLeft+offset)/zoom,offset};setZoom(next);
   };
   container.addEventListener('wheel',wheel,{passive:false});return()=>container.removeEventListener('wheel',wheel);
 },[zoom]);
 useLayoutEffect(()=>{const el=scroll.current,anchor=zoomAnchor.current;if(!el||!anchor)return;el.scrollLeft=anchor.seconds*zoom-anchor.offset;setView({left:el.scrollLeft,width:el.clientWidth});},[zoom]);
 // Pointer selection already targets visible content; do not scroll away from the grabbed part of a long clip.
 useEffect(()=>{const el=scroll.current,c=p.clips.find(c=>c.id===selected);if(!el||!c||gestureCleanup.current)return;const x=c.start*pxFrame;if(x<el.scrollLeft||x>el.scrollLeft+el.clientWidth-40)el.scrollLeft=Math.max(0,x-60);},[selected]);
 useEffect(()=>{const el=scroll.current;if(!el)return;if(zoomAnchor.current){zoomAnchor.current=undefined;return;}if(gestureCleanup.current)return;const x=frame*pxFrame,right=el.clientWidth*.8;if(x>el.scrollLeft+right)el.scrollLeft=Math.max(0,x-right);else if(x<el.scrollLeft+40&&el.scrollLeft>0)el.scrollLeft=Math.max(0,x-el.clientWidth*.2);},[frame,pxFrame,view.width,seekVersion]);
 const drag=(event:PointerEvent<HTMLDivElement>,clip:Clip,mode:'move'|'left'|'right')=>{
   if(event.button!==0)return;gestureCleanup.current?.();setMarquee(undefined);setSnapGuide(undefined);event.preventDefault();event.stopPropagation();setPlaying(false);
   const component=expandSelection(p,[clip.id]);
   if(mode==='move'&&(event.shiftKey||event.metaKey||event.ctrlKey)){onSelection(selectedIds.includes(clip.id)?selectedIds.filter(id=>!component.includes(id)):[...new Set([...selectedIds,...component])]);return;}
   const ids=selectedIds.includes(clip.id)?selectedIds:component;onSelection([...ids.filter(id=>id!==clip.id),clip.id]);
   let movingClips:Clip[];
   try{movingClips=editableSelection(p,ids);}catch(e){onError(e);return;}
   const movingIds=new Set(movingClips.map(c=>c.id));
   const snapPoints=snap?[...new Set([...p.clips.filter(c=>!movingIds.has(c.id)).flatMap(c=>[c.start,c.start+c.duration]),0,frame])]:[];
   const snapEdges=movingClips.flatMap(c=>(mode==='move'?['left','right'] as const:[mode]).map(side=>({id:c.id,side,frame:side==='left'?c.start:c.start+c.duration})));
   const minDelta=-Math.min(...movingClips.map(c=>c.start)),maxDelta=86400*p.fps-Math.max(...movingClips.map(c=>c.start+c.duration));
   const deferred=mode==='move'&&clip.kind==='text'&&ids.length===1;
   const element=event.currentTarget,originX=event.clientX,originY=event.clientY,grabY=originY-element.getBoundingClientRect().top,originScrollLeft=scroll.current!.scrollLeft,newLaneId=uid(),newLaneIds=[newLaneId];let started=false,pending:Project|undefined,pendingError:unknown;element.setPointerCapture(event.pointerId);
   // Keep the hit regions fixed while the preview adds/removes lanes under the pointer.
   const lanes=Array.from(scroll.current!.querySelectorAll<HTMLElement>('[data-track]')).map(el=>({track:p.tracks.find(t=>t.id===el.dataset.track)!,rect:el.getBoundingClientRect()}));
   const move=(e:globalThis.PointerEvent)=>{if(e.pointerId!==event.pointerId||!(e.buttons&1))return;if(!started&&Math.hypot(e.clientX-originX,e.clientY-originY)<3)return;if(!started){if(!deferred)checkpoint();started=true;}
     // Use the original pointer position, not the snapped preview, so dragging past 7px releases the snap.
     const rawDelta=(e.clientX-originX+(deferred?scroll.current!.scrollLeft-originScrollLeft:0))/pxFrame,delta=Math.round(rawDelta);
     let preview:typeof textDragPreview;
     try{let next:Project,guide:number|undefined,snappedEdge:typeof snapEdges[number]|undefined,editDelta=delta,distance=7/pxFrame;
       for(const point of snapPoints)for(const edge of snapEdges){
         const candidate=point-edge.frame,d=Math.abs(candidate-rawDelta);
         if(d<distance&&(mode!=='move'||candidate>=minDelta&&candidate<=maxDelta)){editDelta=candidate;distance=d;guide=point;snappedEdge=edge;}
       }
       if(mode==='move'){
         // Subtitle previews leave the track layout intact, so hit testing follows the visible rows even after scrolling.
         const regions=deferred?Array.from(scroll.current!.querySelectorAll<HTMLElement>('[data-track]')).map(el=>({track:p.tracks.find(t=>t.id===el.dataset.track)!,rect:el.getBoundingClientRect()})):lanes;
         const track=regions.find(l=>e.clientY>=l.rect.top&&e.clientY<l.rect.bottom)?.track;let base=p,target=ids.length===1&&track&&!track.locked&&compatibleTrack(clip.kind,track)&&track.id!==clip.trackId?track.id:undefined;
         if(deferred){
           const viewport=scroll.current!.getBoundingClientRect(),body=scroll.current!.parentElement!.getBoundingClientRect(),content=scroll.current!.querySelector('.timeline-content')!.getBoundingClientRect();
           const inside=e.clientX>=viewport.left&&e.clientX<=viewport.right&&e.clientY>=body.top&&e.clientY<=body.bottom;
           const boundary=inside&&Math.abs(e.clientY-originY)>=8?regions.filter(l=>l.track.kind==='text'&&!l.track.locked).flatMap(l=>[{track:l.track,at:l.rect.top,after:false},{track:l.track,at:l.rect.bottom,after:true}]).filter(b=>Math.abs(b.at-e.clientY)<=6).sort((a,b)=>Math.abs(a.at-e.clientY)-Math.abs(b.at-e.clientY))[0]:undefined;
           preview={id:clip.id,label:clip.text.replace(/\s+/g,' ').trim()||'空白文字',start:clip.start+clamp(delta,minDelta,maxDelta),duration:clip.duration,top:e.clientY-content.top-grabY,valid:inside&&(!!boundary||track?.kind==='text'&&!track.locked),target:track?.kind==='text'?track.id:undefined,insertion:boundary?boundary.at-content.top:undefined};
           if(!preview.valid){pending=undefined;pendingError=undefined;setTextDragPreview(preview);setSnapGuide(undefined);return;}
           if(boundary){if(p.tracks.length>=32)throw new Error('最多 32 條軌道，請先移除一條空軌道。');const tracks=[...p.tracks];tracks.splice(tracks.findIndex(t=>t.id===boundary.track.id)+(boundary.after?1:0),0,{id:newLaneId,name:'文字與字幕',kind:'text',muted:false,hidden:false,locked:false,manualTextLane:true});base={...p,tracks};target=newLaneId;}
           if(target){const primary=primaryTextTrack(p)?.id;base={...base,tracks:base.tracks.map(t=>(t.id===target||t.id===clip.trackId)&&t.id!==primary?{...t,manualTextLane:true}:t)};}
         }
         next=moveSelection(base,ids,editDelta,target);
       }
       else next=trimSelection(p,ids,mode,editDelta,media);
       if(snappedEdge){const aligned=next.clips.find(c=>c.id===snappedEdge.id);if(!aligned||(snappedEdge.side==='left'?aligned.start:aligned.start+aligned.duration)!==guide)guide=undefined;}
       const added=next.tracks.filter(t=>!p.tracks.some(old=>old.id===t.id));
       const laneIds=new Map(added.map((t,i)=>[t.id,newLaneIds[i]??(newLaneIds[i]=uid())]));
       if(laneIds.size)next={...next,tracks:next.tracks.map(t=>laneIds.has(t.id)?{...t,id:laneIds.get(t.id)!}:t),clips:next.clips.map(c=>laneIds.has(c.trackId)?{...c,trackId:laneIds.get(c.trackId)!}:c)};
       if(deferred&&preview){pending=next;pendingError=undefined;setTextDragPreview({...preview,start:next.clips.find(c=>c.id===clip.id)!.start});}
       else update(()=>next,false);
       setSnapGuide(guide);
     }catch(error){setSnapGuide(undefined);if(deferred){pending=undefined;pendingError=error;if(preview)setTextDragPreview({...preview,valid:false});}else onError(error);}
   };
   const up=(event?:Event)=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);window.removeEventListener('blur',up);element.removeEventListener('lostpointercapture',up);gestureCleanup.current=undefined;setSnapGuide(undefined);setTextDragPreview(undefined);if(deferred&&event?.type==='pointerup'){if(pending){const next=pending;checkpoint();update(()=>next,false);}else if(pendingError)onError(pendingError);}};gestureCleanup.current=up;window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true});window.addEventListener('pointercancel',up,{once:true});window.addEventListener('blur',up,{once:true});if(deferred)element.addEventListener('lostpointercapture',up,{once:true});
 };
 const selectArea=(event:PointerEvent<HTMLDivElement>)=>{
   if(event.button!==0)return;gestureCleanup.current?.();setMarquee(undefined);event.preventDefault();setPlaying(false);const el=scroll.current!,content=el.querySelector('.timeline-content')!.getBoundingClientRect();
   const start={x:event.clientX-content.left,y:event.clientY-content.top},additive=event.shiftKey||event.metaKey||event.ctrlKey;let moved=false;
   event.currentTarget.setPointerCapture(event.pointerId);
   const move=(e:globalThis.PointerEvent)=>{const rect=el.querySelector('.timeline-content')!.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;if(!moved&&Math.hypot(x-start.x,y-start.y)<4)return;moved=true;
     const box={x:Math.max(0,Math.min(start.x,x)),y:Math.min(start.y,y),width:Math.abs(x-start.x),height:Math.abs(y-start.y)};setMarquee(box);
     const tracks=new Set(Array.from(el.querySelectorAll<HTMLElement>('[data-track]')).filter(lane=>{const r=lane.getBoundingClientRect();return r.bottom-rect.top>box.y&&r.top-rect.top<box.y+box.height;}).map(lane=>lane.dataset.track));
     const found=p.clips.filter(c=>tracks.has(c.trackId)&&c.start*pxFrame<box.x+box.width&&(c.start+c.duration)*pxFrame>box.x).map(c=>c.id);onSelection(expandSelection(p,additive?[...selectedIds,...found]:found));
   };
   const up=(e:globalThis.PointerEvent)=>{if(!moved&&e.type!=='pointercancel'){if(!additive)onSelection([]);setFrame(Math.max(0,Math.round(start.x/pxFrame)));}setMarquee(undefined);cleanup();};const cleanup=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);gestureCleanup.current=undefined;};gestureCleanup.current=cleanup;window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true});window.addEventListener('pointercancel',up,{once:true});
 };
 const seek=(e:PointerEvent<HTMLDivElement>)=>{if(e.button!==0)return;gestureCleanup.current?.();setMarquee(undefined);setPlaying(false);const el=scroll.current!;const get=(x:number)=>Math.max(0,Math.round((x-el.getBoundingClientRect().left+el.scrollLeft)/pxFrame));setFrame(get(e.clientX));e.currentTarget.setPointerCapture(e.pointerId);const move=(ev:globalThis.PointerEvent)=>setFrame(get(ev.clientX));const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);gestureCleanup.current=undefined;setSeekVersion(v=>v+1);};gestureCleanup.current=up;window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true});window.addEventListener('pointercancel',up,{once:true});};
 const interval=zoom>=80?1:zoom>=35?2:zoom>=12?5:zoom>=4?15:zoom>=1?60:300;const firstTick=Math.floor(view.left/zoom/interval)*interval;const ticks=[];for(let s=firstTick;s<Math.min(totalSeconds,(view.left+view.width)/zoom+interval);s+=interval)ticks.push(s);
 const previewLeft=textDragPreview?Math.max(textDragPreview.start*pxFrame,view.left-50):0;
 const previewWidth=textDragPreview?Math.max(6,Math.min(textDragPreview.start*pxFrame+Math.max(6,textDragPreview.duration*pxFrame),view.left+view.width+50)-previewLeft):0;
 const trackToggle=(id:string,key:'muted'|'hidden'|'locked')=>update(p=>({...p,tracks:p.tracks.map(t=>t.id===id?{...t,[key]:!t[key]}:t)}));
 return <section ref={timeline} className="timeline"><div className="timeline-toolbar"><div className="timeline-tools"><button data-tooltip={`分割（${shortcut('B')}）`} aria-label={`分割（${shortcut('B')}）`} onClick={onSplit} disabled={!selected}><Scissors size={17}/></button><button data-tooltip={`複製片段（${shortcut('D')}）`} aria-label={`複製片段（${shortcut('D')}）`} onClick={onDuplicate} disabled={!selected}><Copy size={16}/></button><button data-tooltip="刪除（Delete）" aria-label="刪除（Delete）" onClick={onDelete} disabled={!selected}><Trash2 size={16}/></button>{(selectedIds.length>1||p.clips.some(c=>selectedIds.includes(c.id)&&(c.groupId||c.linkId)))&&<i/>}{selectedIds.length>1&&<button data-tooltip="建立群組" aria-label="建立群組" disabled={selectedIds.length<2} onClick={()=>onRelation('groupId',true)}><Group size={16}/></button>}{p.clips.some(c=>selectedIds.includes(c.id)&&c.groupId)&&<button data-tooltip="解除群組" aria-label="解除群組" disabled={!p.clips.some(c=>selectedIds.includes(c.id)&&c.groupId)} onClick={()=>onRelation('groupId',false)}><Ungroup size={16}/></button>}{selectedIds.length>1&&<button data-tooltip="音畫連動" aria-label="音畫連動" disabled={selectedIds.length<2} onClick={()=>onRelation('linkId',true)}><Link2 size={16}/></button>}{p.clips.some(c=>selectedIds.includes(c.id)&&c.linkId)&&<button data-tooltip="解除音畫連動" aria-label="解除音畫連動" disabled={!p.clips.some(c=>selectedIds.includes(c.id)&&c.linkId)} onClick={()=>onRelation('linkId',false)}><Unlink2 size={16}/></button>}<i/><button aria-pressed={snap} data-tooltip={snap?'磁吸對齊已開啟：靠近片段邊緣時吸附，拖遠即可移開':'磁吸對齊已關閉'} aria-label="磁吸對齊" className={`timeline-snap-toggle ${snap?'active':''}`} onClick={()=>{gestureCleanup.current?.();setSnap(!snap);setSnapGuide(undefined);}}><Magnet size={16}/><span>磁吸對齊</span><span className="snap-switch" aria-hidden="true"/></button><button data-tooltip="新增標記（M）" aria-label="新增標記（M）" onClick={onMarker}><Flag size={16}/></button><button data-tooltip="新增軌道" aria-label="新增軌道" onClick={onAddTrack}><Layers size={17}/><Plus size={11}/></button></div><div className="zoom-tools"><button data-tooltip="符合整段影片" aria-label="符合整段影片" onClick={()=>setZoom(clamp(view.width/(Math.max(10,end/p.fps)+5),.12,150))}><ScanLine size={17}/></button><button data-tooltip="縮小時間軸" aria-label="縮小時間軸" onClick={()=>setZoom(z=>Math.max(.12,z/1.5))}><ZoomOut size={16}/></button><input aria-label="時間軸縮放" data-tooltip={`${platform==='darwin'?'Command':'Alt'}＋滑鼠滾輪縮放`} type="range" min={-2.12} max={5.3} step={.05} value={Math.log(zoom)} onChange={e=>setZoom(Math.exp(+e.target.value))}/><button data-tooltip="放大時間軸" aria-label="放大時間軸" onClick={()=>setZoom(z=>Math.min(200,z*1.5))}><ZoomIn size={16}/></button></div></div>
 <div className="timeline-body"><div className="track-headers"><div className="track-header-ruler"><span>軌道</span><ChevronRight size={12}/></div>{p.tracks.map(t=><div key={t.id} className={`track-header ${t.locked?'locked':''}`}><div className="track-title">{t.kind==='effect'?<Sparkles size={14}/>:t.kind==='text'?<Type size={14}/>:t.kind==='audio'?<Music2 size={14}/>:<Film size={14}/>}<span>{t.name}</span></div><div className="track-actions"><button data-tooltip={t.hidden?'顯示軌道':'隱藏軌道'} aria-label={t.hidden?'顯示軌道':'隱藏軌道'} onClick={()=>trackToggle(t.id,'hidden')}>{t.hidden?<EyeOff size={12}/>:<Eye size={12}/>}</button><button data-tooltip={t.muted?'取消靜音':'靜音軌道'} aria-label={t.muted?'取消靜音':'靜音軌道'} onClick={()=>trackToggle(t.id,'muted')}>{t.muted?<VolumeX size={12}/>:<Volume2 size={12}/>}</button><button data-tooltip={t.locked?'解鎖':'鎖定軌道'} aria-label={t.locked?'解鎖':'鎖定軌道'} onClick={()=>trackToggle(t.id,'locked')}>{t.locked?<LockKeyhole size={12}/>:<LockKeyholeOpen size={12}/>}</button></div></div>)}</div>
 <div className="timeline-scroll" ref={scroll} onScroll={e=>setView({left:e.currentTarget.scrollLeft,width:e.currentTarget.clientWidth})}><div className="timeline-content" style={{width}}><div className="time-ruler" onPointerDown={seek}>{ticks.map(s=><div key={s} className="ruler-tick" style={{left:s*zoom}}><span>{shortTime(s)}</span></div>)}{p.markers.map(m=>m.frame*pxFrame>=view.left&&m.frame*pxFrame<view.left+view.width&&<button key={m.id} className="marker" data-tooltip={`${m.name}（雙擊刪除）`} aria-label={`${m.name}（雙擊刪除）`} style={{left:m.frame*pxFrame}} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();setFrame(m.frame);}} onDoubleClick={()=>update(p=>({...p,markers:p.markers.filter(x=>x.id!==m.id)}))}><Flag size={12} fill="currentColor"/></button>)}</div>
 {p.tracks.map(t=><div data-track={t.id} key={t.id} className={`track-lane ${t.hidden?'hidden-track':''} ${t.locked?'locked':''} ${textDragPreview?.valid&&textDragPreview.target===t.id&&textDragPreview.insertion===undefined?'drop-target':''}`} onPointerDown={selectArea} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';}} onDrop={e=>{e.preventDefault();if(t.locked||t.kind==='effect')return;const mediaId=e.dataTransfer.getData('mycut/media');if(mediaId)onAddMedia(mediaId,t.id,Math.max(0,Math.round((e.clientX-scroll.current!.getBoundingClientRect().left+scroll.current!.scrollLeft)/pxFrame)));}}>
 {(byTrack.get(t.id)??[]).filter(c=>c.start*pxFrame+Math.max(c.duration*pxFrame,8)>=view.left-100&&c.start*pxFrame<view.left+view.width+100).map(c=>{const label=c.kind==='text'?(c.text.replace(/\s+/g,' ').trim()||'空白文字'):c.name;const m=c.mediaId?mediaById.get(c.mediaId):undefined;const left=c.start*pxFrame;const visibleLeft=Math.max(left,view.left-50);const fullWidth=Math.max(6,c.duration*pxFrame);const displayWidth=Math.min(left+fullWidth,view.left+view.width+50)-visibleLeft;return <div key={c.id} role="button" aria-label={`${label}，${timecode(c.start,p.fps)}`} data-tooltip={label.length>160?label.slice(0,160)+'…':label} tabIndex={0} className={`timeline-clip clip-${c.kind} ${selectedIds.includes(c.id)?'selected':''} ${textDragPreview?.id===c.id?'drag-source':''}`} style={{left:visibleLeft,width:displayWidth}} onPointerDown={e=>drag(e,c,'move')} onKeyDown={e=>{if(e.key==='Enter')onSelect(c.id);}}>
 {m?.thumbnail&&<div className="clip-thumbnails" style={{backgroundImage:`url(${m.thumbnail})`,backgroundPositionX:left-visibleLeft}}/>}{m?.waveform&&c.kind==='audio'&&<svg className="waveform" viewBox="0 0 600 40" preserveAspectRatio="none">{m.waveform.filter((_,i)=>i%3===0).map((v,i)=><line key={i} x1={i*3} x2={i*3} y1={20-v*18} y2={20+v*18} stroke="currentColor" strokeWidth="1.5"/>)}</svg>}
 <span className="clip-name">{c.kind==='effect'?<Sparkles size={11}/>:c.kind==='text'?<Type size={11}/>:c.kind==='audio'?<Music2 size={11}/>:<Film size={11}/>}<span>{label}</span>{c.linkId&&<Link2 size={11}/>} {c.groupId&&<Group size={11}/>} {c.speed!==1&&<b>{c.speed}×</b>}</span>{c.keyframes.length>0&&<div className="clip-keyframes">{c.keyframes.map((k,i)=><span key={i} style={{left:k.frame*pxFrame+left-visibleLeft}}>◆</span>)}</div>}
 {visibleLeft===left&&<div className="trim-handle left" onPointerDown={e=>drag(e,c,'left')}/>} {visibleLeft+displayWidth>=left+fullWidth&&<div className="trim-handle right" onPointerDown={e=>drag(e,c,'right')}/>}
 </div>;})}</div>)}{marquee&&<div className="timeline-marquee" style={{left:marquee.x,top:marquee.y,width:marquee.width,height:marquee.height}}/>}{textDragPreview&&<div className={`timeline-drag-preview ${textDragPreview.valid?'':'invalid'}`} aria-hidden="true" style={{left:previewLeft,top:textDragPreview.top,width:previewWidth}}><Type size={11}/><span>{textDragPreview.label}</span></div>}{textDragPreview?.valid&&textDragPreview.insertion!==undefined&&<div className="timeline-track-insertion" aria-hidden="true" style={{top:textDragPreview.insertion}}/>}{snap&&snapGuide!==undefined&&<div className="timeline-snap-guide" aria-hidden="true" style={{left:snapGuide*pxFrame}}/>}<div className="playhead" style={{left:frame*pxFrame}}><div className="playhead-cap" onPointerDown={seek}/></div>
 </div></div></div><div className="timeline-footer"><span><span className="status-dot"/> 本機剪輯</span><span>{p.clips.length} 個片段 {selectedIds.length>1&&`（已選 ${selectedIds.length} 個）`}<span className="dot">·</span> {p.tracks.length} 條軌道</span><span className="timeline-duration">專案長度 {timecode(end,p.fps)}</span></div></section>;
}
