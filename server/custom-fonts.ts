import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { GlobalFonts } from '@napi-rs/canvas';
import { z } from 'zod';
import { atomicJson } from './library';
import type { FontInfo } from '../shared/model';

const EntrySchema=z.object({id:z.string().regex(/^custom-[a-f0-9]{64}$/),label:z.string().min(1).max(100),extension:z.enum(['.ttf','.otf'])});
type Entry=z.infer<typeof EntrySchema>;
export class CustomFonts {
  readonly root:string;
  private entries:Entry[]=[];
  private chain:Promise<unknown>=Promise.resolve();
  constructor(root:string,private fonts:FontInfo[]){this.root=path.join(root,'custom-fonts');}
  private info(entry:Entry,missing=false):FontInfo{return {id:entry.id,family:missing?'Noto Sans TC':`MyCut-${entry.id}`,label:entry.label,language:'自訂',category:'自訂字型',file:entry.id+entry.extension,license:'',source:'',custom:true,...(missing?{missing:true}:{})};}
  private register(entry:Entry){const info=this.info(entry);if(!GlobalFonts.registerFromPath(path.join(this.root,info.file),info.family))throw new Error(`無法載入自訂字型：${entry.label}`);return info;}
  async init(){
    await fs.mkdir(this.root,{recursive:true});
    try{this.entries=z.array(EntrySchema).max(200).parse(JSON.parse(await fs.readFile(path.join(this.root,'manifest.json'),'utf8')));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')await fs.copyFile(path.join(this.root,'manifest.json'),path.join(this.root,'manifest.json.corrupt'),constants.COPYFILE_EXCL).catch(()=>{});}
    for(const entry of this.entries){try{const file=path.join(this.root,entry.id+entry.extension),st=await fs.stat(file);if(st.size>32*1024**2||`custom-${createHash('sha256').update(await fs.readFile(file)).digest('hex')}`!==entry.id)throw new Error('字型損壞');this.fonts.push(this.register(entry));}catch{this.fonts.push(this.info(entry,true));}}
  }
  import(bytes:Buffer,filename:string,label?:string){
    const extension=path.extname(filename).toLowerCase();if(extension!=='.ttf'&&extension!=='.otf')throw new Error('請選擇 TTF 或 OTF 字型檔。');
    if(!bytes.length||bytes.length>32*1024**2)throw new Error('字型檔必須小於 32 MB 且不可為空。');
    const signature=bytes.subarray(0,4).toString('hex');if(!['00010000','4f54544f','74727565'].includes(signature))throw new Error('這個檔案不是有效的 TTF／OTF 字型。');
    const id=`custom-${createHash('sha256').update(bytes).digest('hex')}`;
    const entry=EntrySchema.parse({id,extension,label:(label?.trim()||path.basename(filename,path.extname(filename))).slice(0,100)});
    const task=this.chain.catch(()=>{}).then(async()=>{
      const previous=this.entries.find(e=>e.id===id);if(previous&&!this.fonts.find(f=>f.id===id)?.missing){const file=this.file(id),st=await fs.stat(file).catch(()=>null);if(st?.isFile()&&st.size<=32*1024**2&&`custom-${createHash('sha256').update(await fs.readFile(file)).digest('hex')}`===id)return this.info(previous);}
      const savedEntry=previous??entry;
      if(!previous&&this.entries.length>=200)throw new Error('最多可匯入 200 款自訂字型。');
      const info=this.info(savedEntry),key=GlobalFonts.register(bytes,info.family);if(!key)throw new Error('無法讀取這個字型檔，請確認檔案完整。');
      try{await fs.writeFile(path.join(this.root,info.file),bytes);await atomicJson(path.join(this.root,'manifest.json'),previous?this.entries:[...this.entries,savedEntry]);}
      catch(e){GlobalFonts.remove(key);await fs.rm(path.join(this.root,info.file),{force:true});throw e;}
      if(!previous)this.entries.push(savedEntry);const index=this.fonts.findIndex(f=>f.id===id);if(index>=0)this.fonts[index]=info;else this.fonts.push(info);return info;
    });this.chain=task;return task;
  }
  packageEntry(id:string){const entry=this.entries.find(e=>e.id===id);if(!entry||this.fonts.find(f=>f.id===id)?.missing)throw new Error(`請先重新匯入自訂字型：${entry?.label??id}`);return {...entry,file:this.file(id)};}
  file(id:string){const entry=this.entries.find(e=>e.id===id);if(!entry)throw new Error('找不到自訂字型。');return path.join(this.root,entry.id+entry.extension);}
}
