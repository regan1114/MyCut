import { useState } from 'react';
import type { Clip } from '../../shared/model';
import { presetPatch, type ClipPreset } from '../../shared/clip-presets';

type Props={clip:Clip;fps:number;presets:ClipPreset[];saving:boolean;onApply:(fields:Partial<Clip>)=>void};
export default function ClipPresetPicker({clip,fps,presets,saving,onApply}:Props){
  const [selected,setSelected]=useState('');const available=presets.filter(p=>p.kind===clip.kind),preset=available.find(p=>p.id===selected);
  return <details className="compact-details clip-presets"><summary>最近設定{saving?' · 記錄中':''}</summary><p className="field-note">調整後自動記錄，每個片段保留最新設定，最多 50 組。可跨專案套用到同類片段。</p>{available.length?<><label className="select-field"><span>已記錄設定</span><select aria-label="已記錄片段設定" value={preset?selected:''} onChange={e=>setSelected(e.target.value)}><option value="">選擇設定</option>{available.map(p=><option key={p.id} value={p.id}>{p.name} · {new Date(p.updatedAt).toLocaleString('zh-TW')}</option>)}</select></label><button className="wide-button" disabled={!preset} onClick={()=>{if(preset)onApply(presetPatch(preset,clip,fps));}}>套用片段設定</button><p className="field-note">保留素材、文字內容與時間軸位置。文字外觀會同步至同軌字幕；套用後可復原。</p></>:<p className="field-note">尚無此類片段的設定，調整參數後會自動加入。</p>}</details>;
}
