import { useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { defaultEffects, effectCatalog, effectSettings, type Effects, type EffectId } from '../../shared/effects';

type EffectPatch = Partial<Pick<Effects,'intensity'|'speed'|'density'|'color'|'quality'|'spectrum'|'mirrorAxis'|'kaleidoscopeSegments'|'seed'>>;
function patchEffect(value:Effects,id:EffectId,patch:EffectPatch):Effects {
  const previous=value.perEffect[id]??{};
  return {...value,perEffect:{...value.perEffect,[id]:{
    ...previous,...patch,
    ...(patch.spectrum?{spectrum:{...value.spectrum,...previous.spectrum,...patch.spectrum}}:{}),
  }}};
}

export function EffectControls({value,onChange,onCheckpoint,selectedEffectId,onSelectEffect,fixedEffectId}:{value:Effects;onChange:(effects:Effects,history?:boolean)=>void;onCheckpoint:()=>void;selectedEffectId?:EffectId;onSelectEffect?:(id:EffectId)=>void;fixedEffectId?:EffectId}){
  const id=fixedEffectId??selectedEffectId??value.enabled.at(-1)??'nostalgic';
  const settings=effectSettings(value,id),effectName=effectCatalog.find(item=>item.id===id)?.name??id;
  const update=(patch:EffectPatch,history=true)=>onChange(patchEffect(value,id,patch),history);
  const reset=()=>{const defaults=defaultEffects();update({intensity:defaults.intensity,speed:defaults.speed,density:defaults.density,color:defaults.color,quality:defaults.quality,spectrum:defaults.spectrum,mirrorAxis:defaults.mirrorAxis,kaleidoscopeSegments:defaults.kaleidoscopeSegments,seed:defaults.seed});};
  return <div className="atmosphere-panel">
    {!fixedEffectId&&<label>調整特效<select aria-label="調整特效" value={id} onChange={e=>onSelectEffect?.(e.target.value as EffectId)}>{effectCatalog.map(item=><option key={item.id} value={item.id}>{item.name}{value.enabled.includes(item.id)?'（已套用）':''}</option>)}</select></label>}
    <div className="fx-special-settings">
      <label>特效品質<select aria-label="特效品質" value={settings.quality} onChange={e=>update({quality:e.target.value as Effects['quality']})}><option value="draft">輕量</option><option value="standard">標準</option><option value="high">精細</option></select></label>
      <p>「{effectName}」的品質設定；預覽與匯出共用。</p>
      {id==='spectrum'&&<><label>頻譜樣式<select aria-label="頻譜樣式" value={settings.spectrum.mode} onChange={e=>update({spectrum:{...settings.spectrum,mode:e.target.value as Effects['spectrum']['mode']}})}><option value="bars">直條</option><option value="circle">環形</option><option value="waveform">波形</option></select></label>{([{key:'x',label:'頻譜水平位置',min:0,max:1},{key:'y',label:'頻譜垂直位置',min:0,max:1},{key:'scale',label:'頻譜大小',min:.2,max:1.5}] as const).map(f=><label className="fx-slider" key={f.key}><span>{f.label}<output>{Math.round(settings.spectrum[f.key]*100)}%</output></span><input aria-label={f.label} type="range" min={f.min} max={f.max} step={.01} value={settings.spectrum[f.key]} onChange={e=>update({spectrum:{...settings.spectrum,[f.key]:+e.target.value}})}/></label>)}</>}
      {id==='mirror'&&<label>鏡像方向<select aria-label="鏡像方向" value={settings.mirrorAxis} onChange={e=>update({mirrorAxis:e.target.value as Effects['mirrorAxis']})}><option value="horizontal">左右</option><option value="vertical">上下</option><option value="both">四向</option></select></label>}
      {id==='kaleidoscope'&&<label>萬花筒分瓣<select aria-label="萬花筒分瓣" value={settings.kaleidoscopeSegments} onChange={e=>update({kaleidoscopeSegments:+e.target.value as Effects['kaleidoscopeSegments']})}>{[4,6,8,12].map(n=><option key={n} value={n}>{n} 瓣</option>)}</select></label>}
    </div>
    <div className="fx-settings"><div className="section-label">{effectName}參數<button data-tooltip="重設此特效參數" aria-label="重設此特效參數" onClick={reset}><RotateCcw size={12}/>重設</button></div>
      {([{key:'intensity',label:'特效強度',min:0,max:1,step:.05},{key:'speed',label:'動畫速度',min:.25,max:2,step:.05},{key:'density',label:'粒子密度',min:.25,max:2,step:.05}] as const).map(field=><label className="fx-slider" key={field.key}><span>{field.label}<output>{field.key==='intensity'?`${Math.round(settings.intensity*100)}%`:`${settings[field.key].toFixed(2)}×`}</output></span><input aria-label={field.label} type="range" min={field.min} max={field.max} step={field.step} value={settings[field.key]} onPointerDown={onCheckpoint} onKeyDown={e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(e.key))onCheckpoint();}} onChange={e=>update({[field.key]:Number(e.target.value)},false)}/></label>)}
      <label className="fx-color"><span>光暈與粒子色彩</span><input aria-label="特效色彩" type="color" value={settings.color} onChange={e=>update({color:e.target.value})}/><code>{settings.color.toUpperCase()}</code></label>
    </div>
    <p className="fx-note">節奏效果跟隨未靜音音軌的強弱；沒有音訊時不觸發。播放時可查看動畫，暫停時可逐格調整。</p></div>;
}

export default function EffectsPanel({value,onChange,onAdd,mode,onMode,selectedEffectId,onSelectEffect}:{value:Effects;onChange:(effects:Effects)=>void;onAdd:(id:EffectId)=>void;mode:'global'|'timed';onMode:(mode:'global'|'timed')=>void;selectedEffectId:EffectId;onSelectEffect:(id:EffectId)=>void}){
  const [group,setGroup]=useState('全部');const timed=mode==='timed';
  const toggle=(id:EffectId)=>timed?onAdd(id):onChange({...value,enabled:value.enabled.includes(id)?value.enabled.filter(v=>v!==id):[...value.enabled,id]});
  return <div className="atmosphere-panel">
    <div className="caption-mode"><button className={mode==='global'?'active':''} onClick={()=>onMode('global')}>全片效果</button><button className={mode==='timed'?'active':''} onClick={()=>onMode('timed')}>時段特效</button></div>
    <p className="fx-description">{timed?'點選加入特效片段，右側調整屬性。':'點選套用到全片，右側調整屬性。'}</p>
    {!timed&&<div className="fx-enabled"><span><i/>{value.enabled.length?`已開啟 ${value.enabled.length} 種`:'尚未套用特效'}</span><button disabled={!value.enabled.length} onClick={()=>onChange({...value,enabled:[]})}>全部關閉</button></div>}
    <div className="filter-chips fx-groups">{['全部','氛圍','光影','節奏','畫面'].map(label=><button key={label} className={group===label?'active':''} onClick={()=>setGroup(label)}>{label}</button>)}</div>
    <div className="fx-grid">{effectCatalog.filter(item=>group==='全部'||item.group===group).map(item=><button key={item.id} className={`fx-card ${!timed&&value.enabled.includes(item.id)?'enabled':''} ${!timed&&selectedEffectId===item.id?'selected':''}`} aria-label={item.name} aria-pressed={!timed&&value.enabled.includes(item.id)} data-tooltip={`${item.name}：${item.detail}`} onClick={()=>{onSelectEffect(item.id);toggle(item.id);}}><div className="fx-art"><img src={`/artwork/effects/${item.id}.svg`} alt="" loading="lazy" decoding="async" draggable={false}/><span className="fx-check">{!timed&&value.enabled.includes(item.id)?<Check size={12}/>:<span>＋</span>}</span>{item.group==='節奏'&&<small>音樂連動</small>}</div><span className="fx-name">{item.name}</span></button>)}</div>
  </div>;
}
