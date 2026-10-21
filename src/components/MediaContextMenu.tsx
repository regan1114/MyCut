import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

type Props={x:number;y:number;kind:'video'|'audio'|'image';onExport?:()=>void;exportDisabled?:boolean;onAi?:()=>void;aiDisabled?:boolean;detachDisabled?:boolean;vocalsDisabled?:boolean;onVocals:()=>void;onDetach:()=>void;onClose:()=>void};
export default function MediaContextMenu({x,y,kind,onExport,exportDisabled,onAi,aiDisabled,detachDisabled,vocalsDisabled,onVocals,onDetach,onClose}:Props){
 const menu=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  (menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')??menu.current)?.focus();
  const close=(e:Event)=>{if(!menu.current?.contains(e.target as Node))onClose();};
  window.addEventListener('pointerdown',close);window.addEventListener('scroll',close,true);window.addEventListener('resize',onClose);
  return()=>{window.removeEventListener('pointerdown',close);window.removeEventListener('scroll',close,true);window.removeEventListener('resize',onClose);};
 },[onClose]);
 return createPortal(<div ref={menu} className="media-context-menu" role="menu" aria-label="媒體操作" tabIndex={-1} style={{left:Math.max(8,Math.min(x,window.innerWidth-220)),top:Math.max(8,Math.min(y,window.innerHeight-190))}} onContextMenu={e=>e.preventDefault()} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){onClose();}if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const items=Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[]);const index=items.indexOf(document.activeElement as HTMLButtonElement);items[(index+(e.key==='ArrowDown'?1:items.length-1))%items.length]?.focus();}}}>
 {onExport&&<button role="menuitem" disabled={exportDisabled} onClick={()=>{onClose();onExport();}}>匯出選取區塊</button>}
 {kind==='video'&&onAi&&<button role="menuitem" disabled={aiDisabled} onClick={()=>{onClose();onAi();}}>AI 剪輯</button>}
 {kind==='video'&&<button role="menuitem" disabled={detachDisabled} onClick={()=>{onClose();onDetach();}}>分離音訊</button>}
 {kind!=='image'&&<button role="menuitem" disabled={vocalsDisabled} onClick={()=>{onClose();onVocals();}}>分離人聲</button>}
 </div>,document.body);
}
