import { useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { defaultEffects, effectCatalog, type Effects, type EffectId } from '../../shared/effects';

export function EffectControls({value,onChange,onCheckpoint}:{value:Effects;onChange:(effects:Effects,history?:boolean)=>void;onCheckpoint:()=>void}){
  return <div className="atmosphere-panel"><div className="fx-special-settings">
      <label>特效品質<select aria-label="特效品質" value={value.quality} onChange={e=>onChange({...value,quality:e.target.value as Effects['quality']})}><option value="draft">輕量</option><option value="standard">標準</option><option value="high">精細</option></select></label>
      <p>預覽與匯出共用；影響粒子數量及柔光精細度。</p>
      {value.enabled.includes('spectrum')&&<><label>頻譜樣式<select aria-label="頻譜樣式" value={value.spectrum.mode} onChange={e=>onChange({...value,spectrum:{...value.spectrum,mode:e.target.value as Effects['spectrum']['mode']}})}><option value="bars">直條</option><option value="circle">環形</option><option value="waveform">波形</option></select></label>{([{key:'x',label:'頻譜水平位置',min:0,max:1},{key:'y',label:'頻譜垂直位置',min:0,max:1},{key:'scale',label:'頻譜大小',min:.2,max:1.5}] as const).map(f=><label className="fx-slider" key={f.key}><span>{f.label}<output>{Math.round(value.spectrum[f.key]*100)}%</output></span><input aria-label={f.label} type="range" min={f.min} max={f.max} step={.01} value={value.spectrum[f.key]} onChange={e=>onChange({...value,spectrum:{...value.spectrum,[f.key]:+e.target.value}})}/></label>)}</>}
      {value.enabled.includes('mirror')&&<label>鏡像方向<select aria-label="鏡像方向" value={value.mirrorAxis} onChange={e=>onChange({...value,mirrorAxis:e.target.value as Effects['mirrorAxis']})}><option value="horizontal">左右</option><option value="vertical">上下</option><option value="both">四向</option></select></label>}
      {value.enabled.includes('kaleidoscope')&&<label>萬花筒分瓣<select aria-label="萬花筒分瓣" value={value.kaleidoscopeSegments} onChange={e=>onChange({...value,kaleidoscopeSegments:+e.target.value as Effects['kaleidoscopeSegments']})}>{[4,6,8,12].map(n=><option key={n} value={n}>{n} 瓣</option>)}</select></label>}
    </div>
<div className="fx-settings"><div className="section-label">整體調整<button data-tooltip="重設特效參數" aria-label="重設特效參數" onClick={()=>onChange({...defaultEffects(),enabled:value.enabled})}><RotateCcw size={12}/>重設</button></div>
      {([{key:'intensity',label:'特效強度',min:0,max:1,step:.05},{key:'speed',label:'動畫速度',min:.25,max:2,step:.05},{key:'density',label:'粒子密度',min:.25,max:2,step:.05}] as const).map(field=><label className="fx-slider" key={field.key}><span>{field.label}<output>{field.key==='intensity'?`${Math.round(value.intensity*100)}%`:`${value[field.key].toFixed(2)}×`}</output></span><input aria-label={field.label} type="range" min={field.min} max={field.max} step={field.step} value={value[field.key]} onPointerDown={onCheckpoint} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(e.key))onCheckpoint();}} onChange={e=>onChange({...value,[field.key]:Number(e.target.value)},false)}/></label>)}
      <label className="fx-color"><span>光暈與粒子色彩</span><input aria-label="特效色彩" type="color" value={value.color} onChange={e=>onChange({...value,color:e.target.value})}/><code>{value.color.toUpperCase()}</code></label>
    </div>
    <p className="fx-note">節奏效果跟隨未靜音音軌的強弱；沒有音訊時不觸發。播放時可查看動畫，暫停時可逐格調整。</p></div>;
}

export default function EffectsPanel({value,onChange,onAdd,mode,onMode}:{value:Effects;onChange:(effects:Effects)=>void;onAdd:(id:EffectId)=>void;mode:'global'|'timed';onMode:(mode:'global'|'timed')=>void}){
  const [group,setGroup]=useState('全部');const timed=mode==='timed';
  const toggle=(id:EffectId)=>timed?onAdd(id):onChange({...value,enabled:value.enabled.includes(id)?value.enabled.filter(v=>v!==id):[...value.enabled,id]});
  return <div className="atmosphere-panel">
    <div className="caption-mode"><button className={mode==='global'?'active':''} onClick={()=>onMode('global')}>全片效果</button><button className={mode==='timed'?'active':''} onClick={()=>onMode('timed')}>時段特效</button></div>
    <p className="fx-description">{timed?'點選加入特效片段，右側調整屬性。':'點選套用到全片，右側調整屬性。'}</p>
    {!timed&&<div className="fx-enabled"><span><i/>{value.enabled.length?`已開啟 ${value.enabled.length} 種`:'尚未套用特效'}</span><button disabled={!value.enabled.length} onClick={()=>onChange({...value,enabled:[]})}>全部關閉</button></div>}
    <div className="filter-chips fx-groups">{['全部','氛圍','光影','節奏','畫面'].map(label=><button key={label} className={group===label?'active':''} onClick={()=>setGroup(label)}>{label}</button>)}</div>
    <div className="fx-grid">{effectCatalog.filter(item=>group==='全部'||item.group===group).map(item=><button key={item.id} className={`fx-card ${!timed&&value.enabled.includes(item.id)?'enabled':''}`} aria-label={item.name} aria-pressed={!timed&&value.enabled.includes(item.id)} data-tooltip={`${item.name}：${item.detail}`} onClick={()=>toggle(item.id)}><div className="fx-art"><img src={`/artwork/effects/${item.id}.svg`} alt="" loading="lazy" decoding="async" draggable={false}/><span className="fx-check">{!timed&&value.enabled.includes(item.id)?<Check size={12}/>:<span>＋</span>}</span>{item.group==='節奏'&&<small>音樂連動</small>}</div><span className="fx-name">{item.name}</span></button>)}</div>
  </div>;
}
