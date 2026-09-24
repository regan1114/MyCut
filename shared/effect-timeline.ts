import { hasEffects, needsRhythm, type Effects } from './effects';
import { clipOpacity, type Project } from './model';

export function projectEffectSettings(p:Project):Effects[] {
  return [p.effects,...p.clips.filter(c=>c.kind==='effect'&&p.tracks.some(t=>t.id===c.trackId&&!t.hidden)).flatMap(c=>c.effects?[c.effects]:[])].filter((e):e is Effects=>!!e);
}
export const projectNeedsRhythm=(p:Project)=>projectEffectSettings(p).some(e=>hasEffects(e)&&needsRhythm(e));
export const projectNeedsSpectrum=(p:Project)=>projectEffectSettings(p).some(e=>hasEffects(e)&&e.enabled.includes('spectrum'));
export function effectLayersAt(p:Project,frame:number):Effects[] {
  const layers:Effects[]=[];if(hasEffects(p.effects))layers.push(p.effects);
  for(const track of p.tracks.slice().reverse()){
    if(track.hidden)continue;
    for(const c of p.clips){if(c.trackId!==track.id||c.kind!=='effect'||!c.effects||c.start>frame||c.start+c.duration<=frame)continue;
      const value={...c.effects,intensity:c.effects.intensity*clipOpacity(c,frame-c.start)};if(hasEffects(value))layers.push(value);
    }
  }
  return layers;
}
export function segmentHasEffects(p:Project,from:number,to:number) {
  return hasEffects(p.effects)||p.clips.some(c=>c.kind==='effect'&&hasEffects(c.effects)&&c.start<to&&c.start+c.duration>from&&p.tracks.some(t=>t.id===c.trackId&&!t.hidden));
}
