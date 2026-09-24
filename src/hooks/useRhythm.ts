import { useEffect, useMemo, useState } from 'react';
import type { Project, Media } from '../../shared/model';
import { projectNeedsRhythm, projectNeedsSpectrum } from '../../shared/effect-timeline';
import type { AudioFeatures, AudioFeaturesJson } from '../../shared/rhythm';
import { api } from '../api';

export function useRhythm(p:Project,media:Media[]){
  const [features,setFeatures]=useState<ReadonlyMap<string,AudioFeatures>>(new Map());
  const [status,setStatus]=useState('');const [error,setError]=useState(false);const [retry,setRetry]=useState(0);
  const {spectral,ids}=useMemo(()=>{
  const spectral=projectNeedsSpectrum(p);
  const needed=projectNeedsRhythm(p);
  const ids=JSON.stringify(needed?[...new Set(p.clips.filter(c=>['audio','video'].includes(c.kind)&&c.volume>0&&p.tracks.some(t=>t.id===c.trackId&&!t.muted&&!t.hidden)).flatMap(c=>c.mediaId&&media.find(m=>m.id===c.mediaId)?.hasAudio?[c.mediaId]:[]))].sort().map(id=>[id,media.find(m=>m.id===id)?.revision??0]):[]);
  return {spectral,ids};
  },[p,media]);
  useEffect(()=>{
    const controller=new AbortController();const result=new Map<string,AudioFeatures>();setFeatures(result);setError(false);
    const list=JSON.parse(ids) as [string,number][];
    if(!list.length){setStatus('');return;}
    setStatus('正在分析音訊節奏…');
    void (async()=>{try{
      for(const [id] of list){const data=await api<AudioFeaturesJson>(`/api/media/${id}/rhythm${spectral?'?spectrum=1':''}`,{signal:controller.signal});
        if(controller.signal.aborted)return;const decode=(v:string)=>Uint8Array.from(atob(v),c=>c.charCodeAt(0));result.set(id,{energy:decode(data.energy),beats:data.beats,bands:data.bands?decode(data.bands):undefined,waveform:data.waveform?decode(data.waveform):undefined});setFeatures(new Map(result));
      }
      setStatus('');
    }catch(e){if(!controller.signal.aborted){setError(true);setStatus(`節奏分析失敗：${e instanceof Error?e.message:'請重試'}`);}}})();
    return()=>controller.abort();
  },[ids,retry,spectral]);
  return {features,status,error,retry:()=>setRetry(v=>v+1)};
}
