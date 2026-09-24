import { clamp, evaluateClip, ProjectSchema, splitClip, uid, type Clip, type Media, type Project } from './model';
import { appendClips, firstFreeStart, firstRangeAfter, occupiedRanges, insertTimedClips } from './placement';

/** Groups and linked audio/video are selected as a connected set. */
export function expandSelection(p:Project, ids:readonly string[]):string[] {
  const byId=new Map(p.clips.map(c=>[c.id,c])),groups=new Map<string,string[]>(),links=new Map<string,string[]>();
  for(const c of p.clips){if(c.groupId){const list=groups.get(c.groupId)??[];list.push(c.id);groups.set(c.groupId,list);}if(c.linkId){const list=links.get(c.linkId)??[];list.push(c.id);links.set(c.linkId,list);}}
  const selected=new Set(ids.filter(id=>byId.has(id))),queue=[...selected];
  for(let i=0;i<queue.length;i++){const c=byId.get(queue[i])!;for(const [key,map] of [[c.groupId,groups],[c.linkId,links]] as const){if(!key)continue;for(const id of map.get(key)??[]){if(!selected.has(id)){selected.add(id);queue.push(id);}}map.delete(key);}}
  return p.clips.filter(c=>selected.has(c.id)).map(c=>c.id);
}
export function editableSelection(p:Project,ids:readonly string[]) {
  const selected=new Set(expandSelection(p,ids));const clips=p.clips.filter(c=>selected.has(c.id));
  if(clips.some(c=>p.tracks.find(t=>t.id===c.trackId)?.locked))throw new Error('選取的群組或連動片段包含鎖定軌道，請先解鎖。');
  return clips;
}
export const compatibleTrack=(kind:Clip['kind'],track:Project['tracks'][number])=>kind==='effect'?track.kind==='effect':kind==='audio'?track.kind==='audio':track.kind==='video'||track.kind==='text';
export function moveSelection(p:Project,ids:readonly string[],delta:number,trackId?:string):Project {
  const clips=editableSelection(p,ids);if(!clips.length)return p;
  let low=-Math.min(...clips.map(c=>c.start)),high=86400*p.fps-Math.max(...clips.map(c=>c.start+c.duration));
  let d=clamp(Math.round(delta),low,high);
  const selected=new Set(clips.map(c=>c.id));const target=p.tracks.find(t=>t.id===trackId);
  if(target&&(target.locked||!compatibleTrack(clips[0].kind,target)))throw new Error('此軌道無法放置選取的片段。');
  const ranges=occupiedRanges(p,selected);
  if(clips.length===1&&target&&target.id!==clips[0].trackId){d=firstFreeStart(ranges.get(target.id)??[],clips[0].start+d,clips[0].duration)-clips[0].start;if(d>high)throw new Error('此軌道沒有足夠空間。');}
  else if(clips.some(c=>firstFreeStart(ranges.get(c.trackId)??[],c.start+d,c.duration)!==c.start+d)){
    for(const c of clips){const lane=ranges.get(c.trackId)??[],i=firstRangeAfter(lane,c.start);if(lane[i]&&lane[i].start<c.start+c.duration)return p;low=Math.max(low,(lane[i-1]?.end??0)-c.start);high=Math.min(high,(lane[i]?.start??86400*p.fps)-c.start-c.duration);}
    if(low>high)return p;d=clamp(d,low,high);
  }
  return {...p,clips:p.clips.map(c=>selected.has(c.id)?{...c,start:c.start+d,...(clips.length===1&&target?{trackId:target.id}:{})}:c)};
}
function maximumDuration(c:Clip,p:Project,media:Media[]) {
  const m=media.find(m=>m.id===c.mediaId);
  return Math.max(1,Math.min(86400*p.fps-c.start,m&&m.kind!=='image'?Math.floor((m.duration-c.sourceIn)/c.speed*p.fps):86400*p.fps));
}
/** Trims use one common delta so linked tracks keep their relative timing. */
export function trimSelection(p:Project,ids:readonly string[],edge:'left'|'right',delta:number,media:Media[]):Project {
  const clips=editableSelection(p,ids);if(!clips.length)return p;
  let low=-Infinity,high=Infinity;
  const neighbours=new Map<string,{before:number;after:number}>();
  for(const track of p.tracks){const lane=p.clips.filter(c=>c.trackId===track.id).sort((a,b)=>a.start-b.start);let end=0;for(let i=0;i<lane.length;i++){neighbours.set(lane[i].id,{before:end,after:lane[i+1]?.start??86400*p.fps});end=Math.max(end,lane[i].start+lane[i].duration);}}
  for(const c of clips){const m=media.find(m=>m.id===c.mediaId);
    if(edge==='left'){low=Math.max(low,-c.start,m&&m.kind!=='image'?-Math.floor(c.sourceIn/c.speed*p.fps):-c.start);high=Math.min(high,c.duration-1);}
    else{low=Math.max(low,1-c.duration);high=Math.min(high,maximumDuration(c,p,media)-c.duration);}
    const adjacent=neighbours.get(c.id)!;if(edge==='left')low=Math.max(low,adjacent.before-c.start);else high=Math.min(high,adjacent.after-c.start-c.duration);
  }
  if(low>high)return p;
  const d=clamp(Math.round(delta),low,high),selected=new Set(clips.map(c=>c.id));
  return {...p,clips:p.clips.map(c=>{
    if(!selected.has(c.id))return c;
    if(edge==='right'){const duration=c.duration+d;const state=evaluateClip(c,duration);return {...c,duration,keyframes:c.keyframes.some(k=>k.frame>duration)?[...c.keyframes.filter(k=>k.frame<duration),{frame:duration,...state}]:c.keyframes};}
    const m=media.find(m=>m.id===c.mediaId),state=evaluateClip(c,d);
    const keys=c.keyframes.filter(k=>k.frame>=d).map(k=>({...k,frame:k.frame-d}));
    if(c.keyframes.some(k=>k.frame<d)&&!keys.some(k=>k.frame===0))keys.unshift({frame:0,...state});
    return {...c,start:c.start+d,duration:c.duration-d,sourceIn:m&&m.kind!=='image'?c.sourceIn+d/p.fps*c.speed:c.sourceIn,karaoke:{...c.karaoke,offset:c.karaoke.offset+d},keyframes:keys};
  })};
}
export function duplicateSelection(p:Project,ids:readonly string[]) {
  const clips=editableSelection(p,ids);if(!clips.length)return {project:p,ids:[]};
  const delta=Math.max(...clips.map(c=>c.start+c.duration))-Math.min(...clips.map(c=>c.start));
  const groups=new Map<string,string>(),links=new Map<string,string>();
  const fresh=(id:string|undefined,map:Map<string,string>)=>{if(!id)return undefined;if(!map.has(id))map.set(id,uid());return map.get(id)!;};
  const copies=clips.map(c=>({...c,id:uid(),start:c.start+delta,groupId:fresh(c.groupId,groups),linkId:fresh(c.linkId,links),captionJobId:undefined}));
  const project=appendClips(p,copies);return {project,ids:copies.map(c=>c.id)};
}
export function splitSelection(p:Project,ids:readonly string[],at:number) {
  const selected=new Set(editableSelection(p,ids).map(c=>c.id)),groups=new Map<string,string>(),links=new Map<string,string>(),rightIds:string[]=[];
  const fresh=(id:string|undefined,map:Map<string,string>)=>{if(!id)return undefined;if(!map.has(id))map.set(id,uid());return map.get(id)!;};
  const clips=p.clips.flatMap(c=>{if(!selected.has(c.id))return[c];const parts=splitClip(c,at,p.fps);if(parts.length===2){parts[1]={...parts[1],groupId:fresh(c.groupId,groups),linkId:fresh(c.linkId,links)};rightIds.push(parts[1].id);}return parts;});
  if(!rightIds.length)throw new Error('把播放頭移到選取的片段內，再執行分割。');
  return {project:ProjectSchema.parse({...p,clips}),ids:rightIds};
}
export function removeSelection(p:Project,ids:readonly string[],ripple=false):Project {
  const clips=editableSelection(p,ids),selected=new Set(clips.map(c=>c.id));
  const remaining=p.clips.filter(c=>!selected.has(c.id));
  if(!ripple)return {...p,clips:remaining};
  const intervals=new Map<string,{start:number;end:number}[]>();
  for(const track of p.tracks){const merged:{start:number;end:number}[]=[];for(const c of clips.filter(c=>c.trackId===track.id).sort((a,b)=>a.start-b.start)){const prev=merged.at(-1);if(prev&&prev.end>=c.start)prev.end=Math.max(prev.end,c.start+c.duration);else merged.push({start:c.start,end:c.start+c.duration});}intervals.set(track.id,merged);}
  const shifts=new Map(remaining.map(c=>[c.id,(intervals.get(c.trackId)??[]).reduce((sum,r)=>sum+(r.end<=c.start?r.end-r.start:0),0)]));
  for(const c of remaining){const amount=shifts.get(c.id)!;if(!amount)continue;if(p.tracks.find(t=>t.id===c.trackId)?.locked)throw new Error('漣漪刪除會移動鎖定軌道。');
    if(expandSelection({...p,clips:remaining},[c.id]).some(id=>shifts.get(id)!==amount))throw new Error('漣漪刪除會改變群組或音畫同步，請改用一般刪除或先解除群組／連動。');
  }
  return {...p,clips:remaining.map(c=>({...c,start:c.start-shifts.get(c.id)!}))};
}
export function setSelectionRelation(p:Project,ids:readonly string[],key:'groupId'|'linkId',enabled:boolean):Project {
  const clips=editableSelection(p,ids);if(enabled&&clips.length<2)throw new Error('請先選取至少兩個片段。');
  if(enabled&&key==='linkId'&&(!clips.some(c=>c.kind==='video')||!clips.some(c=>c.kind==='audio')||clips.some(c=>!['video','audio'].includes(c.kind))))throw new Error('音畫連動需選取影片與音訊片段。');
  const selected=new Set(clips.map(c=>c.id)),relation=enabled?uid():undefined;
  return {...p,clips:p.clips.map(c=>selected.has(c.id)?{...c,[key]:relation}:c)};
}
/** Inspector timing/speed changes keep linked audio and video in sync. Other properties stay local. */
export function patchLinkedClip(p:Project,id:string,fields:Partial<Clip>,media:Media[]):Project {
  const c=p.clips.find(c=>c.id===id);if(!c)return p;
  const linked=c.linkId?p.clips.filter(x=>x.linkId===c.linkId):[c];
  if(linked.some(x=>p.tracks.find(t=>t.id===x.trackId)?.locked))throw new Error('連動片段包含鎖定軌道，請先解鎖。');
  let result=p;
  if(fields.trackId!==undefined){const target=p.tracks.find(t=>t.id===fields.trackId);if(!target||target.locked||!compatibleTrack(c.kind,target))throw new Error('此軌道無法放置選取的片段。');const lane=occupiedRanges(p,new Set([id])).get(target.id)??[];if(firstFreeStart(lane,fields.start??c.start,c.duration)!==(fields.start??c.start))throw new Error('目標軌道的這段時間已有片段，請選擇空白位置。');result={...result,clips:result.clips.map(x=>x.id===id?{...x,trackId:target.id}:x)};}
  if(fields.start!==undefined)result=moveSelection(result,linked.map(x=>x.id),fields.start-c.start);
  if(fields.duration!==undefined&&fields.speed===undefined)result=trimSelection(result,linked.map(x=>x.id),'right',fields.duration-c.duration,media);
  const {start:_,duration:__,trackId:___,speed,...local}=fields;
  result={...result,clips:result.clips.map(x=>{
    if(speed!==undefined&&linked.some(l=>l.id===x.id)){const ratio=x.speed/speed;return {...x,speed,duration:Math.max(1,Math.round(x.duration*ratio)),keyframes:x.keyframes.map(k=>({...k,frame:Math.round(k.frame*ratio)})),...(x.id===id?local:{})};}
    return x.id===id?{...x,...local}:x;
  })};
  if(speed!==undefined){for(const x of result.clips.filter(x=>linked.some(l=>l.id===x.id))){const lane=occupiedRanges(result,new Set([x.id])).get(x.trackId)??[];if(firstFreeStart(lane,x.start,x.duration)!==x.start)throw new Error('變速後會與同軌片段重疊，請先移開後方片段或更換軌道。');}}
  return ProjectSchema.parse(result);
}

/** A dissolve needs simultaneous images, placed on separate tracks to keep lanes clear. */
export function dissolveClip(p:Project,id:string):Project{
  const current=p.clips.find(c=>c.id===id);if(!current)return p;
  const prev=p.clips.filter(c=>c.trackId===current.trackId&&c.id!==id&&c.start<current.start).sort((a,b)=>b.start-a.start)[0];
  if(!prev)throw new Error('交叉溶解需要同軌的前一個片段。');
  const selected=editableSelection(p,[id]);if(selected.some(c=>c.id===prev.id))throw new Error('交叉溶解的兩個片段屬於同一群組，請先解除群組。');
  const fade=Math.min(Math.round(p.fps*.5),Math.floor(current.duration/2),Math.floor(prev.duration/2));
  const delta=prev.start+prev.duration-fade-current.start;if(selected.some(c=>c.start+delta<0))throw new Error('交叉溶解會讓連動片段超出時間軸起點。');
  const ids=new Set(selected.map(c=>c.id));return insertTimedClips({...p,clips:p.clips.filter(c=>!ids.has(c.id)).map(c=>c.id===prev.id?{...c,fadeOut:0}:c)},selected.map(c=>({...c,start:c.start+delta,...(c.id===id?{fadeIn:fade}:{})})));
}
