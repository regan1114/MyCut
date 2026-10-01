import { ProjectSchema, uid, type Clip, type Project } from './model';

export const overlaps=(a:Pick<Clip,'start'|'duration'>,b:Pick<Clip,'start'|'duration'>)=>a.start<b.start+b.duration&&b.start<a.start+a.duration;
export const trackEnd=(p:Project,id:string)=>p.clips.reduce((end,c)=>c.trackId===id?Math.max(end,c.start+c.duration):end,0);
export function occupiedRanges(p:Project,exclude:ReadonlySet<string>=new Set()){
  const tracks=new Map<string,{start:number;end:number}[]>();
  for(const c of p.clips)if(!exclude.has(c.id)){const ranges=tracks.get(c.trackId)??[];ranges.push({start:c.start,end:c.start+c.duration});tracks.set(c.trackId,ranges);}
  for(const [id,ranges] of tracks){ranges.sort((a,b)=>a.start-b.start);const merged:typeof ranges=[];for(const r of ranges){const last=merged.at(-1);if(last&&r.start<=last.end)last.end=Math.max(last.end,r.end);else merged.push({...r});}tracks.set(id,merged);}
  return tracks;
}
export function firstRangeAfter(ranges:{start:number;end:number}[],start:number){let lo=0,hi=ranges.length;while(lo<hi){const mid=(lo+hi)>>>1;if(ranges[mid].end<=start)lo=mid+1;else hi=mid;}return lo;}
export function firstFreeStart(ranges:{start:number;end:number}[],start:number,duration:number){let at=Math.max(0,Math.round(start));for(let i=firstRangeAfter(ranges,at);i<ranges.length;i++){const r=ranges[i];if(at+duration<=r.start)break;at=r.end;}return at;}

const sharedTextLane=(t:Project['tracks'][number])=>t.kind==='text'&&t.name==='文字與字幕'&&!t.locked&&!t.hidden&&!t.muted&&!t.manualTextLane;
export const primaryTextTrack=(p:Project)=>p.tracks.find(t=>t.id==='text'&&sharedTextLane(t))??p.tracks.find(sharedTextLane)??p.tracks.find(t=>t.kind==='text'&&!t.locked&&!t.hidden&&!t.muted);
/** Keep one empty text lane, but remove surplus empty lanes after an edit. */
export function pruneTextTracks(p:Project):Project{
  const used=new Set(p.clips.map(c=>c.trackId)),primary=primaryTextTrack(p);const keep=primary&&used.has(primary.id)?primary.id:p.tracks.find(t=>t.kind==='text'&&used.has(t.id))?.id??primary?.id;
  return {...p,tracks:p.tracks.filter(t=>t.kind!=='text'||t.name!=='文字與字幕'||t.locked||t.hidden||t.muted||t.id===keep||used.has(t.id))};
}
/** Consolidate older automatic caption lanes without changing any cue times. */
export function consolidateTextTracks(p:Project):Project{
  const primary=primaryTextTrack(p);if(!primary||!sharedTextLane(primary))return pruneTextTracks(p);
  const lanes=[primary,...p.tracks.filter(t=>t.id!==primary.id&&sharedTextLane(t))],ranges=occupiedRanges(p),placements=new Map<string,string>();
  for(let i=1;i<lanes.length;i++){for(const c of p.clips.filter(c=>c.kind==='text'&&c.trackId===lanes[i].id)){
    const target=lanes.slice(0,i).find(t=>firstFreeStart(ranges.get(t.id)??[],c.start,c.duration)===c.start);if(!target)continue;
    placements.set(c.id,target.id);const lane=ranges.get(target.id)??[];lane.splice(firstRangeAfter(lane,c.start),0,{start:c.start,end:c.start+c.duration});ranges.set(target.id,lane);
  }ranges.set(lanes[i].id,(occupiedRanges({...p,clips:p.clips.filter(c=>c.trackId===lanes[i].id&&!placements.has(c.id))}).get(lanes[i].id)??[]));}
  return pruneTextTracks({...p,clips:p.clips.map(c=>placements.has(c.id)?{...c,trackId:placements.get(c.id)!}:c)});
}

/** New clips append after every destination track's tail; groups keep their offsets. */
export function appendClips(p:Project,clips:Clip[]):Project{
  const ends=new Map(p.tracks.map(t=>[t.id,trackEnd(p,t.id)]));let delta=0;
  for(const c of clips){const t=p.tracks.find(t=>t.id===c.trackId);if(!t||t.locked)throw new Error('請先選擇未鎖定的軌道。');delta=Math.max(delta,(ends.get(c.trackId)??0)-c.start);}
  return insertTimedClips(p,clips.map(c=>({...c,start:c.start+delta})));
}

/** Timed subtitles and detached audio keep sync by using another lane when occupied. */
export function insertTimedClips(p:Project,clips:Clip[]):Project{
  const tracks=[...p.tracks],result=[...p.clips],lanes=new Map<string,string[]>();
  const ranges=occupiedRanges(p);
  for(const c of clips){const source=tracks.find(t=>t.id===c.trackId);if(!source||source.locked)throw new Error('請先解鎖目標軌道。');const candidates=lanes.get(source.id)??[source.id,...(c.kind==='text'&&sharedTextLane(source)?tracks.filter(t=>t.id!==source.id&&sharedTextLane(t)).map(t=>t.id):[])];let trackId=candidates.find(id=>firstFreeStart(ranges.get(id)??[],c.start,c.duration)===c.start);
    if(!trackId){if(tracks.length>=32)throw new Error('同軌時間已被占用，且已達 32 條軌道上限。請先整理軌道。');trackId=uid();tracks.splice(tracks.findIndex(t=>t.id===source.id),0,{...source,id:trackId,name:source.kind==='text'?'文字與字幕':`${source.name} ${candidates.length+1}`.slice(0,100)});candidates.push(trackId);}
    lanes.set(source.id,candidates);result.push({...c,trackId});const lane=ranges.get(trackId)??[];lane.splice(firstRangeAfter(lane,c.start),0,{start:c.start,end:c.start+c.duration});ranges.set(trackId,lane);
  }
  return ProjectSchema.parse(pruneTextTracks({...p,tracks,clips:result}));
}
