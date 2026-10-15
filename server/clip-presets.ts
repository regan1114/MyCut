import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { atomicJson } from './library';
import { ClipPresetInputSchema, ClipPresetSchema, clipSettings, type ClipPreset } from '../shared/clip-presets';
import { uid } from '../shared/model';

export class ClipPresets {
  private value:ClipPreset[]=[];
  private chain:Promise<unknown>=Promise.resolve();
  private file:string;
  constructor(root:string){this.file=path.join(root,'clip-presets.json');}
  async init(){try{this.value=z.array(ClipPresetSchema).max(50).parse(JSON.parse(await fs.readFile(this.file,'utf8')));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
  get(){return structuredClone(this.value);}
  save(value:unknown){
    const {projectId,clip,fps}=ClipPresetInputSchema.parse(value),settings=clipSettings(clip);
    const task=this.chain.catch(()=>{}).then(async()=>{
      const previous=this.value.find(p=>p.projectId===projectId&&p.clipId===clip.id);
      const preset:ClipPreset={id:previous?.id??uid(),projectId,clipId:clip.id,kind:clip.kind,name:clip.name,fps,settings,updatedAt:new Date().toISOString()};
      const next=[preset,...this.value.filter(p=>p.id!==preset.id)].slice(0,50);
      await atomicJson(this.file,next);this.value=next;return this.get();
    });this.chain=task;return task;
  }
}
