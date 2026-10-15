import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { ClipPreset, ClipPresetInput } from '../../shared/clip-presets';

export function useClipPresets(onError:(e:unknown)=>void){
  const [presets,setPresets]=useState<ClipPreset[]>([]),[saving,setSaving]=useState(false);
  const pending=useRef(new Map<string,ClipPresetInput>()),chain=useRef<Promise<void>>(Promise.resolve()),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEffect(()=>{void api<ClipPreset[]>('/api/clip-presets').then(setPresets).catch(onError);},[onError]);
  const flush=useCallback(()=>{
    clearTimeout(timer.current);
    const inputs=[...pending.current.values()];pending.current.clear();
    if(inputs.length){setSaving(true);chain.current=chain.current.catch(()=>{}).then(async()=>{for(const [index,input] of inputs.entries()){try{setPresets(await api<ClipPreset[]>('/api/clip-presets',{method:'POST',body:JSON.stringify(input)}));}catch(e){for(const retry of inputs.slice(index)){const key=`${retry.projectId}/${retry.clip.id}`;if(!pending.current.has(key))pending.current.set(key,retry);}onError(new Error(`片段設定記錄失敗：${e instanceof Error?e.message:String(e)}`));throw e;}}});}
    const task=chain.current;void task.finally(()=>{if(chain.current===task)setSaving(pending.current.size>0);}).catch(()=>{});return task;
  },[onError]);
  const record=useCallback((input:ClipPresetInput)=>{pending.current.set(`${input.projectId}/${input.clip.id}`,input);setSaving(true);clearTimeout(timer.current);timer.current=setTimeout(()=>void flush().catch(()=>{}),500);},[flush]);
  return {presets,saving,record,flush};
}
