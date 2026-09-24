import { useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import { applyCaptionBatch, captionOverlaps, type CaptionBatchOptions } from '../../shared/caption-batch';
import type { FontInfo, Project } from '../../shared/model';

type Props={project:Project;selected:string[];fonts:FontInfo[];defaultFontId:string;onApply:(p:Project)=>void;onClose:()=>void;onSeek:(frame:number)=>void};
export default function CaptionBatchEditor({project,selected,fonts,defaultFontId,onApply,onClose,onSeek}:Props){
  const [draft,setDraft]=useState(project),[scope,setScope]=useState('captions'),[query,setQuery]=useState(''),[page,setPage]=useState(0),[error,setError]=useState('');
  const [options,setOptions]=useState<CaptionBatchOptions>({find:'',replace:'',punctuation:'keep',lineLength:0});
  const [useStyle,setUseStyle]=useState(false),[style,setStyle]=useState({fontId:defaultFontId,fontSize:56,color:'#ffffff',textBackground:true});
  const [excluded,setExcluded]=useState<Set<string>>(new Set());
  const track=project.clips.find(c=>c.id===selected.at(-1))?.trackId;
  const rows=draft.clips.filter(c=>c.kind==='text'&&(scope==='all'||scope==='captions'&&(c.captionType||c.captionJobId)||scope==='selected'&&selected.includes(c.id)||scope==='track'&&c.trackId===track)).sort((a,b)=>a.start-b.start);
  const filtered=rows.filter(c=>c.text.includes(query)),pages=Math.max(1,Math.ceil(filtered.length/50)),currentPage=Math.min(page,pages-1);
  const locked=(trackId:string)=>!!draft.tracks.find(t=>t.id===trackId)?.locked;
  const targets=filtered.filter(c=>!excluded.has(c.id)&&!locked(c.trackId));
  const conflicts=useMemo(()=>captionOverlaps(draft.clips),[draft.clips]);
  const original=useMemo(()=>new Map(project.clips.map(c=>[c.id,JSON.stringify(c)])),[project.clips]);
  const changed=useMemo(()=>draft===project?0:draft.clips.filter(c=>JSON.stringify(c)!==original.get(c.id)).length,[draft,project,original]);
  const select=(id:string)=>setExcluded(prev=>{const next=new Set(prev);next.has(id)?next.delete(id):next.add(id);return next;});
  return <div className="modal-backdrop"><section className="batch-editor" role="dialog" aria-modal="true" aria-label="字幕批次編輯">
    <div className="modal-header"><div><span className="eyebrow">EDIT YOUR CAPTIONS</span><h2>字幕批次編輯 <small>{rows.length} 則</small></h2></div><button data-tooltip="關閉批次編輯" aria-label="關閉批次編輯" onClick={onClose}><X size={18}/></button></div>
    <div className="batch-layout"><div className="batch-settings">
      <label>處理範圍<select aria-label="批次處理範圍" value={scope} onChange={e=>{setScope(e.target.value);setPage(0);setExcluded(new Set());}}><option value="captions">字幕與歌詞</option><option value="selected">目前選取的文字</option><option value="track" disabled={!track}>目前片段所在軌道</option><option value="all">全部文字（含標題）</option></select></label>
      <label>搜尋篩選<input aria-label="篩選字幕" value={query} placeholder="只處理符合的字幕" onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label>
      <label>尋找文字<input aria-label="批次尋找" value={options.find} onChange={e=>setOptions({...options,find:e.target.value})}/></label>
      <label>取代為<input aria-label="批次取代" value={options.replace} onChange={e=>setOptions({...options,replace:e.target.value})}/></label>
      <label>標點整理<select aria-label="批次標點" value={options.punctuation} onChange={e=>setOptions({...options,punctuation:e.target.value as CaptionBatchOptions['punctuation']})}><option value="keep">保留標點</option><option value="traditional">轉為全形中文標點</option><option value="remove">移除標點</option></select></label>
      <label>每行最多字數<input aria-label="每行最多字數" type="number" min={0} max={80} value={options.lineLength} onChange={e=>setOptions({...options,lineLength:+e.target.value})}/></label><p className="field-note">0 表示不換行。按字元計算，英文會優先在空格斷行。</p>
      <label className="caption-check"><input aria-label="批次套用樣式" type="checkbox" checked={useStyle} onChange={e=>setUseStyle(e.target.checked)}/>同時套用文字樣式</label>
      {useStyle&&<><label>字型<select aria-label="批次字型" value={style.fontId} onChange={e=>setStyle({...style,fontId:e.target.value})}>{fonts.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</select></label><label>字級<input aria-label="批次字級" type="number" min={12} max={300} value={style.fontSize} onChange={e=>setStyle({...style,fontSize:+e.target.value})}/></label><label>文字顏色<input aria-label="批次文字顏色" type="color" value={style.color} onChange={e=>setStyle({...style,color:e.target.value})}/></label><label className="caption-check"><input type="checkbox" checked={style.textBackground} onChange={e=>setStyle({...style,textBackground:e.target.checked})}/>文字背景</label></>}
      <button className="primary-button" disabled={!targets.length} onClick={()=>{try{setDraft(applyCaptionBatch(draft,targets.map(c=>c.id),{...options,style:useStyle?style:undefined}));setError('');}catch(e){setError((e as Error).message);}}}>預覽套用（{targets.length} 則）</button>
      <p className="field-note">變更文字會清除該句逐字時間，需重新校時；只改樣式會保留高亮。鎖定軌道不會修改。</p>
    </div><div className="batch-content"><div className="batch-summary"><span>同軌時間重疊：{rows.filter(c=>conflicts.has(c.id)).length} 則</span><button onClick={()=>setExcluded(new Set())}>全選篩選結果</button><button onClick={()=>setExcluded(new Set(filtered.map(c=>c.id)))}>取消全選</button></div>
      <div className="batch-rows">{filtered.slice(currentPage*50,(currentPage+1)*50).map((c,i)=><div className={`batch-row ${conflicts.has(c.id)?'conflict':''}`} key={c.id}><input aria-label={`選取批次字幕 ${currentPage*50+i+1}`} type="checkbox" checked={!excluded.has(c.id)&&!locked(c.trackId)} disabled={locked(c.trackId)} onChange={()=>select(c.id)}/><div><small>{(c.start/draft.fps).toFixed(2)}–{((c.start+c.duration)/draft.fps).toFixed(2)} 秒 · {draft.tracks.find(t=>t.id===c.trackId)?.name}{locked(c.trackId)?' · 已鎖定':''}{conflicts.has(c.id)?' · 時間重疊':''}</small><p>{c.text}</p></div><button data-tooltip="定位這則字幕" aria-label="定位這則字幕" onClick={()=>onSeek(c.start)}>定位</button></div>)}{!filtered.length&&<p className="field-note">此範圍沒有符合的字幕。舊專案的文字可選「全部文字」或指定軌道。</p>}</div>
      <div className="batch-pagination"><button disabled={!currentPage} onClick={()=>setPage(currentPage-1)}>上一頁</button><span>{currentPage+1} / {pages}</span><button disabled={currentPage+1>=pages} onClick={()=>setPage(currentPage+1)}>下一頁</button></div>
    </div></div>
    {error&&<p role="alert" className="batch-error">{error}</p>}<footer className="batch-footer"><span>已變更 {changed} 則，儲存後可一次復原。</span><button className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" disabled={!changed} onClick={()=>{onApply(draft);onClose();}}><Check size={15}/>儲存批次變更</button></footer>
  </section></div>;
}
