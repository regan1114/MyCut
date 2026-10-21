import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {selectedExportClips} from '../shared/selection-export';
import {safeFileName} from '../shared/platform';
import type {Library} from './library';
import {ffmpeg,probe} from './native';
export class SelectionExporter{
 private controllers=new Map<string,AbortController>();
 constructor(private library:Library){}
 get isRunning(){return this.controllers.size>0;}
 cancel(id:string){this.controllers.get(id)?.abort();}
 close(){for(const controller of this.controllers.values())controller.abort();}
 describe(value:unknown){const request=selectedExportClips(value);return {...request,items:request.clips.map(c=>{
  const media=this.library.get(c.mediaId!);if(media.missing||c.kind==='image'&&media.kind!=='image'||c.kind==='video'&&media.kind!=='video'||c.kind==='audio'&&!media.hasAudio)throw new Error(`素材「${c.name}」無法匯出，請確認來源與類型`);
  const duration=c.duration/request.project.fps*c.speed;if(c.kind!=='image'&&(c.sourceIn>=media.duration||c.sourceIn+duration>media.duration+1/request.project.fps+.001))throw new Error(`區塊「${c.name}」超出來源長度，請先修剪`);
  const extension=c.kind==='image'?'png':c.kind==='audio'?'wav':'mp4';return {clip:c,media,duration:Math.min(duration,media.duration-c.sourceIn),extension,name:`${safeFileName(c.name)}.${extension}`};
 })};}
 async export(value:unknown,destination:string){
  const request=this.describe(value);if(this.isRunning)throw new Error('已有區塊正在匯出，請稍候');
  const controller=new AbortController();this.controllers.set(request.id,controller);const saved:string[]=[];
  try{for(const [index,item] of request.items.entries()){
   controller.signal.throwIfAborted();const {clip,media,duration,extension}=item;
   const target=request.items.length===1?destination:path.join(destination,`${String(index+1).padStart(3,'0')}-${safeFileName(clip.name)}-${request.id.slice(0,8)}.${extension}`);
   if(path.resolve(target)===path.resolve(media.path))throw new Error('匯出位置不能覆蓋來源素材');
   const before=await fs.stat(media.path),temporary=path.join(path.dirname(target),`.reelume-selection-${randomUUID()}.${extension}`);
   try{
    const args=clip.kind==='image'?['-i',media.path,'-frames:v','1','-map','0:v:0',temporary]:['-ss',String(clip.sourceIn),'-i',media.path,'-t',String(duration),...(clip.kind==='audio'?['-vn','-map','0:a:0','-c:a','pcm_s16le']:['-map','0:v:0','-map','0:a:0?','-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart']),temporary];
    await ffmpeg(args,{signal:controller.signal});controller.signal.throwIfAborted();const after=await fs.stat(media.path);if(before.size!==after.size||before.mtimeMs!==after.mtimeMs)throw new Error('匯出期間來源素材已變更');
    if(clip.kind!=='image'){const info=await probe(temporary);if(Math.abs(Number(info.format.duration)-duration)>.2)throw new Error('匯出長度驗證失敗');}
    controller.signal.throwIfAborted();await fs.rename(temporary,target);saved.push(target);
   }finally{await fs.rm(temporary,{force:true}).catch(()=>{});}
  }return {paths:saved,canceled:false};
  }catch(error){if(controller.signal.aborted)return {paths:saved,canceled:true};throw new Error(`${(error as Error).message}${saved.length?`（已有 ${saved.length} 個檔案儲存完成）`:''}`);}finally{this.controllers.delete(request.id);}
 }
}
