import { api } from '../api';
import { useState, useEffect, useRef } from 'react';
import { X, ArrowUpRight, Download, Check, Pause, RotateCcw, LoaderCircle, HardDrive, ShieldCheck, Film } from 'lucide-react';
import { endFrame, shortTime, type Project, type ExportJob, type ExportSettings } from '../../shared/model';

type Props={project:Project;closeRequest:number;onClose:()=>void;onExport:(settings:ExportSettings)=>Promise<ExportJob>;onSave:(job:ExportJob)=>void;onError:(error:unknown)=>void};
export default function ExportDialog({project:p,closeRequest,onClose,onExport,onSave,onError}:Props){
 const [encoders,setEncoders]=useState<ExportSettings['encoder'][]>(['libx264']);
 useEffect(()=>{let active=true;void api<{encoders:ExportSettings['encoder'][]}>('/api/health').then(r=>{if(active)setEncoders(r.encoders);}).catch(()=>{});return()=>{active=false;};},[]);
 const [resolution,setResolution]=useState<ExportSettings['resolution']>(1080),[quality,setQuality]=useState<ExportSettings['quality']>('high'),[encoder,setEncoder]=useState<ExportSettings['encoder']>('libx264');
 const [job,setJob]=useState<ExportJob>(),[starting,setStarting]=useState(false),[acting,setActing]=useState(false),[confirm,setConfirm]=useState(false),[canceling,setCanceling]=useState(false);
 const startTask=useRef<Promise<ExportJob>|undefined>(undefined),cancelRequested=useRef(false),previousFocus=useRef<HTMLElement|undefined>(undefined);
 const duration=endFrame(p)/p.fps,ratio=resolution/Math.min(p.width,p.height),width=Math.round(p.width*ratio/2)*2,height=Math.round(p.height*ratio/2)*2;
 const unfinished=!!job&&job.status!=='completed',busy=starting||acting||canceling;
 useEffect(()=>{
   if(!job||canceling||job.status==='completed'||job.status==='failed')return;
   let alive=true;const timer=setInterval(()=>void api<ExportJob>(`/api/exports/${job.id}`).then(next=>{if(alive&&!cancelRequested.current)setJob(next);}).catch(error=>{if(alive&&!cancelRequested.current)onError(error);}),1000);
   return()=>{alive=false;clearInterval(timer);};
 },[job?.id,job?.status,canceling,onError]);
 const close=async()=>{
   cancelRequested.current=true;setCanceling(true);
   try{const current=startTask.current?await startTask.current.catch(()=>undefined):job;if(current){setJob(current);await api(`/api/exports/${current.id}`,{method:'DELETE'});}onClose();}
   catch(error){cancelRequested.current=false;setCanceling(false);setConfirm(false);onError(error);}
 };
 const requestClose=()=>{if(canceling)return;if(starting||unfinished){previousFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:undefined;setConfirm(true);}else void close();};
 useEffect(()=>{if(closeRequest)requestClose();},[closeRequest]);
 useEffect(()=>{if(!confirm){previousFocus.current?.focus();previousFocus.current=undefined;}},[confirm]);
 const start=async()=>{
   if(busy||unfinished)return;setStarting(true);
   const task=(async()=>{if(job)await api(`/api/exports/${job.id}`,{method:'DELETE'});setJob(undefined);return onExport({resolution,quality,encoder});})();startTask.current=task;
   try{const next=await task;if(!cancelRequested.current)setJob(next);}catch(error){if(!cancelRequested.current)onError(error);}finally{startTask.current=undefined;setStarting(false);}
 };
 const action=async(kind:'pause'|'resume')=>{
   if(!job||busy)return;setActing(true);
   try{await api(`/api/exports/${job.id}/${kind}`,{method:'POST'});const next=await api<ExportJob>(`/api/exports/${job.id}`);if(!cancelRequested.current)setJob(next);}catch(error){if(!cancelRequested.current)onError(error);}finally{setActing(false);}
 };
 return <><div className="modal-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget)requestClose();}}><section className="export-modal" role="dialog" aria-modal="true" aria-label="匯出影片" inert={confirm||undefined} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();requestClose();}}}>
  <div className="modal-header"><div><h2>匯出影片</h2></div><button autoFocus className="icon-button" data-tooltip="關閉" aria-label="關閉" disabled={canceling} onClick={requestClose}><X size={19}/></button></div>
  <div className="export-columns"><div className="export-settings"><div className="export-project"><div><Film size={24}/></div><span><b>{p.name}</b><small>{shortTime(duration)} · {p.fps} fps · MP4 / H.264</small></span></div>
   <label className="select-field"><span>解析度</span><select aria-label="匯出解析度" disabled={busy||unfinished} value={resolution} onChange={e=>setResolution(+e.target.value as ExportSettings['resolution'])}><option value={720}>720p</option><option value={1080}>1080p · Full HD</option><option value={2160}>4K · Ultra HD</option></select></label>
   <label className="select-field"><span>畫質</span><select aria-label="匯出畫質" disabled={busy||unfinished} value={quality} onChange={e=>setQuality(e.target.value as ExportSettings['quality'])}><option value="high">高畫質</option><option value="standard">標準 · 較小檔案</option></select></label>
   <label className="select-field"><span>編碼器</span><select aria-label="編碼器" disabled={busy||unfinished} value={encoder} onChange={e=>setEncoder(e.target.value as ExportSettings['encoder'])}><option value="libx264">軟體編碼 · 相容優先</option>{encoders.includes('h264_videotoolbox')&&<option value="h264_videotoolbox">Apple 硬體加速</option>}</select></label>
   <div className="export-spec"><span>輸出尺寸</span><b>{width} × {height}</b><span>音訊</span><b>AAC · 48 kHz · 192 kbps</b><span>浮水印</span><b>無</b></div>
   <button className="primary-button export-start" disabled={busy||unfinished||!p.clips.length} onClick={()=>void start()}>{starting?<LoaderCircle size={17} className="spin"/>:<ArrowUpRight size={17}/>}開始匯出</button><p className="export-footnote"><ShieldCheck size={13}/>影片在你的電腦處理，只顯示本次匯出工作。</p>
  </div><div className="export-jobs"><h4>本次匯出工作</h4>{!job?<div className="jobs-empty"><HardDrive size={30}/><p>{starting?'正在準備匯出…':'尚未開始匯出'}</p></div>:<div className={`export-job ${job.status}`}>
   <div className="job-heading"><b>{job.name}</b>{job.status==='completed'?<Check size={17}/>:<span>{Math.round(job.progress*100)}%</span>}</div><span className="job-meta">{job.settings.resolution===2160?'4K':`${job.settings.resolution}p`} · {shortTime(job.duration)}</span>
   <div className="progress-bar"><div style={{width:`${job.progress*100}%`}}/></div><div className="job-status"><span>{({queued:'等待匯出',running:'正在匯出',paused:'已暫停',failed:'匯出失敗',completed:'匯出完成'})[job.status]}{job.status==='running'&&` · ${job.completedSegments}/${job.totalSegments}`}</span><div className="job-actions">
    {job.status==='running'||job.status==='queued'?<button disabled={busy} onClick={()=>void action('pause')}><Pause size={12}/>暫停</button>:job.status==='paused'||job.status==='failed'?<button disabled={busy} onClick={()=>void action('resume')}><RotateCcw size={12}/>繼續</button>:<button disabled={busy} onClick={()=>onSave(job)}><Download size={12}/>儲存影片</button>}
    {unfinished&&<button disabled={canceling} onClick={requestClose}><X size={12}/>取消匯出</button>}
   </div></div>{job.error&&<details className="job-error"><summary>檢視訊息</summary><p>{job.error}</p></details>}
  </div>}</div></div>
 </section></div>{confirm&&<div className="modal-backdrop export-confirm-backdrop"><section className="export-cancel-dialog" role="alertdialog" aria-modal="true" aria-labelledby="export-cancel-title" aria-describedby="export-cancel-description" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(!canceling)setConfirm(false);}if(e.key==='Tab'){const buttons=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));if(buttons.length){e.preventDefault();const index=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[(index+(e.shiftKey?-1:1)+buttons.length)%buttons.length].focus();}}}}>
  <h2 id="export-cancel-title">取消匯出？</h2><p id="export-cancel-description">確定取消本次匯出並關閉視窗嗎？按「否」會繼續匯出。</p><div className="export-cancel-actions"><button autoFocus className="secondary-button" disabled={canceling} onClick={()=>setConfirm(false)}>否</button><button className="primary-button" disabled={canceling} onClick={()=>void close()}>{canceling?<><LoaderCircle size={14} className="spin"/>正在取消…</>:'確定'}</button></div>
 </section></div>}</>;
}
