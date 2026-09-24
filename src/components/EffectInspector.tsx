import { Diamond, Sparkles } from 'lucide-react';
import { clamp, evaluateClip, type Clip, type Media, type Project } from '../../shared/model';
import { patchLinkedClip } from '../../shared/editing';
import { effectCatalog } from '../../shared/effects';
import { EffectControls } from './EffectsPanel';

type Props={project:Project;media:Media[];clip:Clip;frame:number;update:(fn:(p:Project)=>Project,history?:boolean)=>void;checkpoint:()=>void;onError:(e:unknown)=>void;onSeek:(frame:number)=>void};
export default function EffectInspector({project,media,clip:c,frame,update,checkpoint,onError,onSeek}:Props){
  const relative=clamp(frame-c.start,0,c.duration-1),state=evaluateClip(c,relative);
  const patch=(fields:Partial<Clip>,history=true)=>{try{update(p=>patchLinkedClip(p,c.id,fields,media),history);}catch(e){onError(e);}};
  const key={frame:relative,...state};
  return <aside className="inspector"><div className="panel-header"><span>特效片段</span><Sparkles size={15}/></div><div className="inspector-scroll">
    <div className="clip-heading"><input aria-label="特效片段名稱" value={c.name} onChange={e=>patch({name:e.target.value})}/></div>
    <p className="field-note">{c.effects!.enabled.map(id=>effectCatalog.find(e=>e.id===id)?.name).join('、')} · 僅在片段時間內作用於合成畫面，包含字幕。</p>
    <section className="property-section"><h4>特效時間</h4><div className="number-pair"><label>開始（秒）<input aria-label="特效開始秒數" type="number" min={0} step={1/project.fps} value={Number((c.start/project.fps).toFixed(3))} onChange={e=>patch({start:Math.max(0,Math.round(+e.target.value*project.fps))})}/></label><label>長度（秒）<input aria-label="特效長度秒數" type="number" min={1/project.fps} step={1/project.fps} value={Number((c.duration/project.fps).toFixed(3))} onChange={e=>patch({duration:Math.max(1,Math.round(+e.target.value*project.fps))})}/></label></div>
      {(['fadeIn','fadeOut'] as const).map((name,i)=><label className="slider-field" key={name}><span>{i?'特效淡出':'特效淡入'}<output>{(c[name]/project.fps).toFixed(1)} s</output></span><input aria-label={i?'特效淡出':'特效淡入'} type="range" min={0} max={c.duration/project.fps} step={.1} value={c[name]/project.fps} onChange={e=>patch({[name]:Math.round(+e.target.value*project.fps)})}/></label>)}
    </section>
    <section className="property-section"><h4>強度動畫</h4><label className="slider-field"><span>片段強度<output>{Math.round(state.opacity*100)}%</output></span><input aria-label="片段特效強度" type="range" min={0} max={1} step={.01} value={state.opacity} onChange={e=>{const opacity=+e.target.value;patch(c.keyframes.length?{keyframes:[...c.keyframes.filter(k=>k.frame!==relative),{...key,opacity}].sort((a,b)=>a.frame-b.frame)}:{opacity});}}/></label>
      <button className="wide-button" onClick={()=>patch({keyframes:c.keyframes.some(k=>k.frame===relative)?c.keyframes.filter(k=>k.frame!==relative):[...c.keyframes,key].sort((a,b)=>a.frame-b.frame)})}><Diamond size={14}/>{c.keyframes.some(k=>k.frame===relative)?'移除強度關鍵影格':'加入強度關鍵影格'}</button>
      <div className="keyframe-list">{c.keyframes.map(k=><div key={k.frame}><button onClick={()=>onSeek(c.start+k.frame)}>{(k.frame/project.fps).toFixed(2)} s</button><span>{Math.round(k.opacity*100)}%</span><button aria-label={`移除 ${k.frame} 影格的特效強度`} data-tooltip={`移除 ${k.frame} 影格的特效強度`} onClick={()=>patch({keyframes:c.keyframes.filter(x=>x.frame!==k.frame)})}>×</button></div>)}</div>
    </section>
    <EffectControls value={c.effects!} onChange={(effects,history)=>patch({effects},history)} onCheckpoint={checkpoint}/>
  </div></aside>;
}
