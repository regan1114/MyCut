import {useEffect,useState} from 'react';
import {FolderOpen,LoaderCircle,Trash2,X} from 'lucide-react';
import {api} from '../api';
type Info={folders:{name:string;path:string;bytes:number}[];cleaning:boolean};
const size=(n:number)=>n<1024*1024?`${(n/1024).toFixed(1)} KB`:`${(n/1024**(n>=1024**3?3:2)).toFixed(1)} ${n>=1024**3?'GB':'MB'}`;
export default function StorageDialog({onClose,onError}:{onClose:()=>void;onError:(error:unknown)=>void}){
 const [info,setInfo]=useState<Info>(),[busy,setBusy]=useState(false),[confirm,setConfirm]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{let alive=true;void api<Info>('/api/storage').then(info=>{if(alive)setInfo(info);}).catch(onError);return()=>{alive=false;};},[]);
 const clear=async()=>{setBusy(true);try{const result=await api<Info&{freedBytes:number}>('/api/storage/clear',{method:'POST'});setInfo({...result,cleaning:false});setMessage(`已清除 ${size(result.freedBytes)} 暫存。`);setConfirm(false);}catch(error){onError(error);}finally{setBusy(false);}};
 return <div className="modal-backdrop"><section className="home-create-modal storage-dialog" role="dialog" aria-modal="true" aria-label="暫存管理" onKeyDown={e=>{if(e.key==='Escape'&&!busy){e.stopPropagation();if(confirm)setConfirm(false);else onClose();}}}>
 <div className="modal-header"><h2>暫存管理</h2><button aria-label="關閉暫存管理" disabled={busy} onClick={onClose}><X size={18}/></button></div>
 <p>可清除預覽代理檔與已關閉匯出工作的內部檔案。代理檔清除後可重新建立。</p>
 {!info?<p><LoaderCircle className="spin" size={16}/>正在計算容量…</p>:<>{info.folders.map((folder,i)=><div className="storage-folder" key={folder.path}><div><b>{folder.name}</b><span>{size(folder.bytes)}</span></div><code>{folder.path}</code>{window.reelume&&<button className="secondary-button" disabled={busy} onClick={()=>void window.reelume!.revealCache(i===0?'cache':'exports').catch(onError)}><FolderOpen size={15}/>開啟資料夾</button>}</div>)}<p>專案、Logo、原始素材、縮圖，以及目前匯出工作（含暫停或失敗）會保留。已儲存到外部位置的影片不會刪除。</p>
 {message&&<p role="status">{message}</p>}
 {confirm?<div role="alertdialog" aria-label="確認清除暫存"><p>確定清除？已關閉工作留在內部的 MP4 也會刪除；請先確認需要的成品已另行儲存。</p><div className="export-cancel-actions"><button className="secondary-button" disabled={busy} onClick={()=>setConfirm(false)}>取消</button><button className="primary-button" disabled={busy} onClick={()=>void clear()}>{busy?'正在清除…':'確定清除'}</button></div></div>:<button className="primary-button" disabled={busy||info.cleaning||!info.folders.some(f=>f.bytes>0)} onClick={()=>setConfirm(true)}><Trash2 size={16}/>清除暫存</button>}</>}
 </section></div>;
}
