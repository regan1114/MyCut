import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { version } from '../../package.json';
import type { AppInfo } from '../api';

let promptedVersion='';
export default function AppVersion(){
 const [info,setInfo]=useState<AppInfo>(),[open,setOpen]=useState(false);
 const trigger=useRef<HTMLButtonElement>(null),close=useRef<HTMLButtonElement>(null);
 useEffect(()=>{let active=true;const refresh=()=>{void window.mycut?.appInfo?.().then(value=>{if(!active)return;setInfo(value);if(value.newerVersion&&promptedVersion!==value.newerVersion){promptedVersion=value.newerVersion;setOpen(true);}}).catch(()=>{});};refresh();window.addEventListener('focus',refresh);return()=>{active=false;window.removeEventListener('focus',refresh);};},[]);
 useEffect(()=>{if(open)close.current?.focus();},[open]);
 const dismiss=()=>{setOpen(false);trigger.current?.focus();};
 return <><button ref={trigger} className={`app-version ${info?.newerVersion?'has-update':''}`} aria-label="關於 MyCut" data-tooltip="查看版本資訊" onClick={()=>setOpen(true)}>v{info?.version??version}{info?.newerVersion&&' · 有新版'}</button>{open&&<div className="modal-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget)dismiss();}}><section className="version-dialog" role="dialog" aria-modal="true" aria-label="關於 MyCut" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();dismiss();}if(e.key==='Tab'){e.preventDefault();close.current?.focus();}}}><div className="modal-header"><h2>MyCut {info?.version??version}</h2><button ref={close} aria-label="關閉版本資訊" onClick={dismiss}><X size={18}/></button></div><p>{info?`${info.platform==='darwin'?'macOS':info.platform==='win32'?'Windows':info.platform} · ${info.arch} · ${info.packaged?'桌面版':'開發版'}`:'瀏覽器版本'}</p>{info?.newerVersion&&<p className="version-notice">本機已有較新的 {info.newerVersion}。請先儲存專案，完全結束目前的 MyCut，再開啟新版。</p>}<p className="field-note">完全結束程式：macOS 按 Command＋Q；Windows 返回專案首頁後關閉視窗。</p>{info?.appPath&&<><p className="field-note">目前程式位置</p><code>{info.appPath}</code></>}</section></div>}</>;
}
