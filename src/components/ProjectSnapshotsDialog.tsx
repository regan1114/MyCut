import { useEffect, useRef, useState } from 'react';
import { Camera, History, LoaderCircle, RotateCcw, X } from 'lucide-react';
import { api } from '../api';
import { shortTime, type Project } from '../../shared/model';
import type { ProjectSnapshotSummary } from '../../shared/projects';

type Props={project:Pick<Project,'id'|'name'>;onClose:()=>void;onRestored:(project:Project)=>void};
export default function ProjectSnapshotsDialog({project,onClose,onRestored}:Props){
 const [rows,setRows]=useState<ProjectSnapshotSummary[]>([]),[selected,setSelected]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const close=useRef<HTMLButtonElement>(null);
 useEffect(()=>{let active=true;void api<ProjectSnapshotSummary[]>(`/api/projects/${project.id}/snapshots`).then(data=>{if(active){setRows(data);setSelected(data[0]?.id??'');}}).catch(e=>{if(active)setError(String(e.message));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[project.id]);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;close.current?.focus();return()=>previous?.focus();},[]);
 useEffect(()=>{if(!busy)close.current?.focus();},[busy]);
 const create=async()=>{setBusy(true);setError('');try{const data=await api<ProjectSnapshotSummary[]>(`/api/projects/${project.id}/snapshots`,{method:'POST'});setRows(data);setSelected(data[0]?.id??'');}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const restore=async()=>{setBusy(true);setError('');try{onRestored(await api<Project>(`/api/projects/${project.id}/snapshots/${selected}/restore`,{method:'POST'}));}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <div className="modal-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}><section className="snapshot-dialog" role="dialog" aria-modal="true" aria-label="專案快照" onKeyDown={e=>{
   if(e.key==='Escape'&&!busy){e.stopPropagation();onClose();}
   if(e.key==='Tab'){const buttons=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled)')),first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
 }}>
  <div className="modal-header"><div><h2><History size={19}/>專案快照</h2><p>{project.name}</p></div><button ref={close} aria-label="關閉快照" disabled={busy} onClick={onClose}><X size={18}/></button></div>
  <p className="field-note">編輯並儲存時，每隔 5 分鐘保留一份快照，最多 10 份。還原會建立新專案，保留目前內容。快照只含剪輯設定與素材參照；完整素材備份請使用專案包。</p>
  {error&&<p className="snapshot-error" role="alert">{error}</p>}
  <div className="snapshot-list">{loading?<p><LoaderCircle size={16} className="spin"/>正在讀取快照…</p>:rows.length?rows.map(row=><button key={row.id} className={selected===row.id?'selected':''} aria-pressed={selected===row.id} disabled={busy} onClick={()=>setSelected(row.id)}><span><b>{new Date(row.createdAt).toLocaleString('zh-TW',{hour12:false})}</b><small>{row.name} · {row.clips} 個片段 · {shortTime(row.duration)}</small><small>內容儲存時間：{new Date(row.projectUpdatedAt).toLocaleString('zh-TW',{hour12:false})}</small></span><span className="snapshot-kind">{row.reason==='manual'?'手動':'自動'}</span></button>):<p>尚無快照，可以先建立一份。</p>}</div>
  <div className="snapshot-actions"><button className="secondary-button" disabled={busy||loading} onClick={()=>void create()}><Camera size={16}/>建立快照</button><button className="primary-button" disabled={busy||loading||!selected} onClick={()=>void restore()}>{busy?<LoaderCircle size={16} className="spin"/>:<RotateCcw size={16}/>}還原為新專案</button></div>
 </section></div>;
}
