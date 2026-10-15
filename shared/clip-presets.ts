import { z } from 'zod';
import { KaraokeSchema } from './karaoke';
import { ClipSchema, FpsSchema, clamp, type Clip } from './model';

export const ClipSettingsSchema=ClipSchema.pick({speed:true,x:true,y:true,scale:true,rotation:true,opacity:true,flipX:true,flipY:true,fit:true,crop:true,volume:true,fadeIn:true,fadeOut:true,audioFadeIn:true,audioFadeOut:true,brightness:true,contrast:true,saturation:true,blur:true,chroma:true,chromaColor:true,chromaSimilarity:true,denoise:true,fontId:true,fontSize:true,color:true,textOutline:true,shape:true,keyframes:true,effects:true}).partial().extend({karaoke:KaraokeSchema.pick({enabled:true,color:true}).optional()});
export const ClipPresetSchema=z.object({id:z.string().uuid(),projectId:z.string().uuid(),clipId:z.string().uuid(),kind:ClipSchema.shape.kind,name:z.string().max(300),fps:FpsSchema,settings:ClipSettingsSchema,updatedAt:z.string()});
export type ClipPreset=z.infer<typeof ClipPresetSchema>;
export const ClipPresetInputSchema=z.object({projectId:z.string().uuid(),clip:ClipSchema,fps:FpsSchema});
export type ClipPresetInput=z.infer<typeof ClipPresetInputSchema>;
const visual=['x','y','scale','rotation','opacity','flipX','flipY','fit','crop','fadeIn','fadeOut','brightness','contrast','saturation','blur','chroma','chromaColor','chromaSimilarity','keyframes'] as const;
const audio=['volume','audioFadeIn','audioFadeOut','denoise'] as const;
export function clipSettings(c:Clip):ClipPreset['settings']{
  const keys:readonly (keyof Clip)[]=c.kind==='audio'?['speed',...audio]:c.kind==='effect'?['opacity','fadeIn','fadeOut','keyframes','effects']:[...visual,...(c.kind==='video'?['speed',...audio] as const:[]),...(c.kind==='text'?['fontId','fontSize','color','textOutline'] as const:c.kind==='shape'?['color','shape'] as const:[])];
  const settings:Record<string,unknown>=Object.fromEntries(keys.map(key=>[key,c[key]]));
  if(c.kind==='text')settings.karaoke={enabled:c.karaoke.enabled,color:c.karaoke.color};
  return ClipSettingsSchema.parse(settings);
}
export function presetPatch(preset:ClipPreset,c:Clip,fps:number):Partial<Clip>{
  if(preset.kind!==c.kind)throw new Error('請選取相同類型的片段套用設定。');
  const {karaoke,...settings}=preset.settings;
  const fields:Partial<Clip>={...settings};
  const duration=fields.speed===undefined?c.duration:Math.max(1,Math.round(c.duration*c.speed/fields.speed));
  for(const key of ['fadeIn','fadeOut','audioFadeIn','audioFadeOut'] as const){const value=fields[key];if(value!==undefined)fields[key]=clamp(Math.round(value*fps/preset.fps),0,duration);}
  if(fields.keyframes){const keys=new Map<number,Clip['keyframes'][number]>();for(const k of fields.keyframes){const frame=clamp(Math.round(k.frame*fps/preset.fps),0,duration-1);keys.set(frame,{...k,frame});}fields.keyframes=[...keys.values()].sort((a,b)=>a.frame-b.frame);}
  if(preset.settings.karaoke)fields.karaoke={...c.karaoke,...preset.settings.karaoke};
  return fields;
}
