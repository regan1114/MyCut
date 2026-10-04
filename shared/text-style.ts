import type { Clip, Project, TextStyle } from './model';

export const textStyleKeys = ['fontId','fontSize','color','x','y','scale','rotation','opacity','flipX','flipY','fit','crop'] as const;

/** Cue text and word timing belong to the clip; appearance belongs to its track. */
export function textStylePatch(clip:Clip,fields:Partial<Clip>):TextStyle {
  const style:TextStyle=Object.fromEntries(textStyleKeys.filter(key=>fields[key]!==undefined).map(key=>[key,fields[key]]));
  if(fields.karaoke&&fields.text===undefined){
    const karaoke=Object.fromEntries((['enabled','color'] as const).filter(key=>fields.karaoke![key]!==clip.karaoke[key]).map(key=>[key,fields.karaoke![key]]));
    if(Object.keys(karaoke).length)style.karaoke=karaoke;
  }
  return style;
}

export function applyTextStyle(clip:Clip,style:TextStyle|undefined,resetKeyframes=false):Clip {
  if(clip.kind!=='text'||!style)return clip;
  const {karaoke,...appearance}=style;
  const pose=Object.fromEntries((['x','y','scale','opacity'] as const).filter(key=>style[key]!==undefined).map(key=>[key,style[key]]));
  return {...clip,...appearance,karaoke:{...clip.karaoke,...karaoke},keyframes:resetKeyframes?[]:Object.keys(pose).length?clip.keyframes.map(key=>({...key,...pose})):clip.keyframes};
}

export function setTrackTextStyle(p:Project,trackIds:readonly string[],style:TextStyle,resetKeyframes=false):Project {
  const ids=new Set(trackIds.filter(id=>!p.tracks.find(t=>t.id===id)?.locked));
  return {...p,
    tracks:p.tracks.map(t=>ids.has(t.id)?{...t,textStyle:{...t.textStyle,...style,...(style.karaoke?{karaoke:{...t.textStyle?.karaoke,...style.karaoke}}:{})}}:t),
    clips:p.clips.map(c=>ids.has(c.trackId)?applyTextStyle(c,style,resetKeyframes):c),
  };
}
