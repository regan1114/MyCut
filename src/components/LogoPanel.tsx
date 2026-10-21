import { useEffect, useRef, useState } from 'react';
import { Upload, Plus } from 'lucide-react';
import { logoPlacement, logoPosition, type LogoPosition } from '../../shared/logos';
import type { Clip, Media, Project } from '../../shared/model';

type Transform=Pick<Clip,'x'|'y'|'scale'>;
type Props={project:Project;media:Media[];selected?:Clip;onImport:(file:File)=>Promise<string>;onAdd:(id:string,transform:Transform)=>void;onChange:(id:string,transform:Transform)=>void;onError:(error:unknown)=>void};
export default function LogoPanel({project,media,selected,onImport,onAdd,onChange,onError}:Props){
 const [customId,setCustomId]=useState<string>();
 useEffect(()=>{if(selected?.logo){setChoice(selected.mediaId);setCustomId(undefined);}},[selected?.id]);
 const input=useRef<HTMLInputElement>(null),[busy,setBusy]=useState(false),[choice,setChoice]=useState<string>(),[position,setPosition]=useState<LogoPosition>('top-right'),[value,setValue]=useState<Transform>({x:0,y:0,scale:.15});
 const logos=media.filter(m=>project.logoMediaIds.includes(m.id));
 const clip=selected?.logo&&(!choice||choice===selected.mediaId)?selected:undefined;
 const logo=logos.find(m=>m.id===(clip?.mediaId??choice))??logos[0];
 const transform=clip??value,currentPosition=clip&&logo?(customId===clip.id?'custom':logoPosition(project,logo,clip)):position;
 const disabled=!!clip&&!!project.tracks.find(t=>t.id===clip.trackId)?.locked;
 const current=logo&&currentPosition!=='custom'?logoPlacement(project,logo,currentPosition,transform.scale):transform;
 const change=(next:Transform)=>{if(clip)onChange(clip.id,next);else setValue(next);};
 const place=(next:LogoPosition)=>{setPosition(next);setCustomId(next==='custom'?clip?.id:undefined);if(!logo)return;change(next==='custom'?current:logoPlacement(project,logo,next,transform.scale));};
 return <div className="logo-panel"><input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;setBusy(true);try{setChoice(await onImport(file));}catch(error){onError(error);}finally{setBusy(false);}}}/>
 <button className="wide-button primary-soft" disabled={busy} onClick={()=>input.current?.click()}><Upload size={16}/>{busy?'正在匯入 Logo…':'匯入 Logo'}</button>
 <p className="field-note">PNG、JPG、WebP；建議使用透明背景 PNG。匯入後會保存專案副本，重新開啟可直接使用。</p>
 <div className="logo-list">{logos.map(m=><button key={m.id} aria-label={`選擇 Logo ${m.name}`} aria-pressed={logo?.id===m.id} className={logo?.id===m.id?'chosen':''} onClick={()=>setChoice(m.id)}><img src={`/media/${m.id}/original`} alt=""/><span>{m.name}</span></button>)}</div>
 {!logo?<p className="selection-note">匯入你的 Logo，放到影片上。</p>:<>
 <div className="section-label">Logo 位置{clip?' · 編輯所選片段':''}</div>
 <div className="logo-positions">{([['top-left','左上'],['top-right','右上'],['bottom-left','左下'],['bottom-right','右下'],['custom','自訂']] as const).map(([id,label])=><button key={id} disabled={disabled||logo.missing} aria-pressed={currentPosition===id} className={currentPosition===id?'chosen':''} onClick={()=>place(id)}>{label}</button>)}</div>
 <label className="select-field"><span>Logo 大小</span><input aria-label="Logo 大小" type="range" min={5} max={50} step={1} disabled={disabled} value={Math.round(transform.scale*100)} onChange={e=>{const scale=+e.target.value/100;change(currentPosition==='custom'?{...current,scale}:logoPlacement(project,logo,currentPosition,scale));}}/><span>{Math.round(transform.scale*100)}%</span></label>
 {currentPosition==='custom'&&<><div className="number-pair"><label>位置 X<input aria-label="Logo 位置 X" type="number" min={-project.width*2} max={project.width*2} disabled={disabled} value={Math.round(current.x*project.width)} onChange={e=>change({...current,x:Math.max(-2,Math.min(2,+e.target.value/project.width))})}/></label><label>位置 Y<input aria-label="Logo 位置 Y" type="number" min={-project.height*2} max={project.height*2} disabled={disabled} value={Math.round(current.y*project.height)} onChange={e=>change({...current,y:Math.max(-2,Math.min(2,+e.target.value/project.height))})}/></label></div><p className="field-note">中心為 0，向右／向下為正值。加入後也可在預覽畫面拖曳。</p></>}
 {disabled&&<p className="field-note">請先解鎖 Logo 所在軌道。</p>}
 <button className="wide-button primary-soft" disabled={busy||logo.missing} onClick={()=>onAdd(logo.id,current)}><Plus size={16}/>{clip?'再加入一個 Logo':'加入影片'}</button>
 <p className="field-note">預設顯示至目前片尾；可在時間軸調整顯示時間。</p>
 </>}
 </div>;
}
