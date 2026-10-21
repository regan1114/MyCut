import type { VocalJob } from '../../shared/vocals';
export default function VocalProgress({jobs,onCancel,onDismiss}:{jobs:VocalJob[];onCancel:(id:string)=>void;onDismiss:(id:string)=>void}){
 if(!jobs.length)return null;
 return <aside className="vocal-progress" aria-label="人聲分離進度">{jobs.map(job=><div key={job.id}>
 <strong>分離人聲 · {job.name}</strong><span role="status">{job.stage}{job.status==='processing'?` ${Math.round(job.progress*100)}%`:''}</span>
 {['processing','queued'].includes(job.status)?<><progress aria-label="人聲分離" max={1} value={job.progress}/><button onClick={()=>onCancel(job.id)}>取消分離</button></>:<><p>{job.error??(job.status==='completed'?'人聲 WAV 已加入原專案素材庫。':'已取消分離。')}</p><button onClick={()=>onDismiss(job.id)}>關閉</button></>}
 </div>)}</aside>;
}
