import fs from 'node:fs/promises';
import path from 'node:path';
import { atomicJson } from './library';
import { FontPreferencesSchema, type FontPreferences } from '../shared/fonts';
import type { FontInfo } from '../shared/model';

export class Preferences {
  private value:FontPreferences={favoriteFontIds:[]};
  private chain:Promise<unknown>=Promise.resolve();
  private file:string;
  constructor(root:string,private fonts:FontInfo[]){this.file=path.join(root,'preferences.json');}
  private normalize(value:unknown){
    const parsed=FontPreferencesSchema.parse(value);
    return {favoriteFontIds:this.fonts.filter(f=>parsed.favoriteFontIds.includes(f.id)).map(f=>f.id)};
  }
  async init(){
    try{this.value=this.normalize(JSON.parse(await fs.readFile(this.file,'utf8')));}
    catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  }
  get(){return {...this.value,favoriteFontIds:[...this.value.favoriteFontIds]};}
  save(value:unknown){
    const next=this.normalize(value);
    const task=this.chain.catch(()=>{}).then(async()=>{await atomicJson(this.file,next);this.value=next;return this.get();});
    this.chain=task;return task;
  }
}
