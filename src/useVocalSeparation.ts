import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { VocalJob } from '../shared/vocals';

export function useVocalSeparation(onComplete:(job:VocalJob)=>Promise<void>,onError:(error:unknown)=>void){
 const [jobs,setJobs]=useState<VocalJob[]>([]);
 const callbacks=useRef({onComplete,onError});callbacks.current={onComplete,onError};
 const handled=useRef(new Set<string>());
 useEffect(()=>{
  let stopped=false,timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{
   try{
    const list=await api<VocalJob[]>('/api/vocals');if(stopped)return;
    setJobs(list);
    for(const job of list){if(job.status==='completed'&&job.outputId&&!handled.current.has(job.id)){await callbacks.current.onComplete(job);handled.current.add(job.id);await api(`/api/vocals/${job.id}/dismiss`,{method:'POST'});}}
   }catch(error){if(!stopped)callbacks.current.onError(error);}
   finally{if(!stopped)timer=setTimeout(poll,1500);}
  };
  void poll();return()=>{stopped=true;clearTimeout(timer);};
 },[]);
 const start=async(projectId:string,mediaId:string)=>{try{const job=await api<VocalJob>('/api/vocals',{method:'POST',body:JSON.stringify({projectId,mediaId})});setJobs(list=>[...list.filter(j=>j.id!==job.id),job]);}catch(error){callbacks.current.onError(error);}};
 const cancel=(id:string)=>{void api(`/api/vocals/${id}/cancel`,{method:'POST'}).catch(callbacks.current.onError);};
 const dismiss=(id:string)=>{void api(`/api/vocals/${id}/dismiss`,{method:'POST'}).then(()=>setJobs(list=>list.filter(j=>j.id!==id))).catch(callbacks.current.onError);};
 return {jobs,start,cancel,dismiss};
}
