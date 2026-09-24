import { useState } from 'react';
import { ArrowUpRight, Check, ChevronDown, Search, Star } from 'lucide-react';
import type { FontInfo } from '../../shared/model';

type Props={fonts:FontInfo[];favorites:string[];defaultId:string;saving:boolean;onFavorite:(id:string,checked:boolean)=>void;selectedId:string;onSelect:(id:string)=>void};
export default function FontLibrary({fonts,favorites,defaultId,saving,onFavorite,selectedId,onSelect}:Props){
  const [onlyFavorites,setOnlyFavorites]=useState(false),[query,setQuery]=useState('');
  const selected=fonts.find(f=>f.id===selectedId);
  const visible=fonts.filter(f=>(!onlyFavorites||favorites.includes(f.id))&&`${f.label} ${f.family} ${f.category}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <details className="font-picker" data-font-id={selectedId}>
    <summary aria-label="選擇字型"><span>字型</span><strong style={{fontFamily:`'${selected?.family}', 'Noto Sans TC'`}}>{selected?.label??selectedId}</strong><ChevronDown size={13}/></summary>
    <div className="font-picker-content">
      <label className="search-box"><Search size={13}/><input aria-label="搜尋字型" placeholder="搜尋字型" value={query} onChange={e=>setQuery(e.target.value)}/></label>
      <div className="filter-chips font-filters"><button aria-pressed={!onlyFavorites} className={!onlyFavorites?'active':''} onClick={()=>setOnlyFavorites(false)}>全部字型</button><button aria-pressed={onlyFavorites} className={onlyFavorites?'active':''} onClick={()=>setOnlyFavorites(true)}>我的最愛（{favorites.length}）</button></div>
      <div className="font-list">{visible.map(f=><div className={`font-card ${f.id===selectedId?'is-selected':''}`} key={f.id} data-font-id={f.id}>
        <button className="font-choice" aria-label={`套用字型：${f.label}`} aria-pressed={f.id===selectedId} onClick={()=>onSelect(f.id)}><span style={{fontFamily:`'${f.family}', 'Noto Sans TC'`}}>{f.label}</span>{f.id===selectedId&&<Check size={12}/>}</button>
        <label className="font-favorite" data-tooltip={favorites.includes(f.id)?'取消最愛':'加入最愛'}><input type="checkbox" aria-label={`我的最愛：${f.label}`} checked={favorites.includes(f.id)} disabled={saving} onChange={e=>onFavorite(f.id,e.target.checked)}/><Star size={13} fill={favorites.includes(f.id)?'currentColor':'none'}/></label>
        <a className="font-license" aria-label={`${f.label} 字型授權`} data-tooltip="下載字型授權" href={`/fonts/${f.license}`} target="_blank" rel="noreferrer" download={`${f.id}-OFL.txt`}><ArrowUpRight size={12}/></a>
      </div>)}</div>
      {!visible.length&&<p className="font-empty">{query?'找不到符合的字型。':'尚未加入最愛'}</p>}
      <div className="font-default" aria-live="polite" tabIndex={0} data-tooltip="新增文字使用列表中第一個最愛；未勾選時使用第一款字型。">預設：{fonts.find(f=>f.id===defaultId)?.label}{saving?' · 儲存中':''}</div>
    </div>
  </details>;
}
