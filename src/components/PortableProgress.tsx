import { useEffect, useState } from 'react';
import { api } from '../api';
import type { PortableStatus } from '../../server/portable';

export default function PortableProgress(){
  const [status,setStatus]=useState<PortableStatus>();const [canceling,setCanceling]=useState(false);
  useEffect(()=>{let alive=true;const refresh=()=>void api<PortableStatus>('/api/portable').then(s=>{if(alive){setStatus(s);if(!s.running)setCanceling(false);}}).catch(()=>{});refresh();const timer=setInterval(refresh,500);return()=>{alive=false;clearInterval(timer);};},[]);
  if(!status?.running)return null;
  return <div className="portable-progress" role="status"><div><strong>{status.kind==='export'?'打包完整專案':'匯入完整專案'}</strong><span>{Math.round(status.progress*100)}%</span></div><p>{status.message}</p><progress value={status.progress} max={1}/><button disabled={canceling} onClick={()=>{setCanceling(true);void api('/api/portable/cancel',{method:'POST'}).catch(()=>setCanceling(false));}}>{canceling?'正在取消…':'取消工作'}</button></div>;
}
