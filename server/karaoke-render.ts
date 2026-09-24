import { spawn } from 'node:child_process';
import { createCanvas } from '@napi-rs/canvas';
import { drawTextFrame } from '../shared/karaoke';
import type { Clip, FontInfo, Project } from '../shared/model';
import { ffmpegPath } from './native';
import { registerCanvasFonts } from './canvas-fonts';

// At most one ten-second transparent clip is prepared at a time. QTRLE is lossless
// and preserves alpha, so the existing native track order and transforms remain intact.
export async function renderKaraokeSegment(c:Clip,p:Project,fonts:FontInfo[],fontRoot:string,from:number,to:number,W:number,H:number,dest:string,signal?:AbortSignal,onProgress?:(ratio:number)=>void){
 if(signal?.aborted)throw new Error('工作已暫停');registerCanvasFonts(fonts,fontRoot,c.fontId);
 const canvas=createCanvas(W,H),ctx=canvas.getContext('2d');const child=spawn(ffmpegPath,['-hide_banner','-nostdin','-y','-threads','1','-f','rawvideo','-pixel_format','rgba','-video_size',`${W}x${H}`,'-framerate',String(p.fps),'-i','pipe:0','-an','-c:v','qtrle','-pix_fmt','argb','-frames:v',String(to-from),'-threads','1',dest],{stdio:['pipe','ignore','pipe'],windowsHide:true});
 let stderr='',failure:Error|undefined;child.stderr.on('data',(b:Buffer)=>{stderr=(stderr+b.toString()).slice(-4000);});child.stdin.on('error',()=>{});
 const finished=new Promise<void>((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(new Error(signal?.aborted?'工作已暫停':stderr||`歌詞繪製失敗 ${code}`)));});finished.catch(e=>{failure=e;});
 const cancel=()=>child.kill('SIGTERM');signal?.addEventListener('abort',cancel,{once:true});
 try{for(let frame=from;frame<to;frame++){
   if(signal?.aborted)throw new Error('工作已暫停');if(failure)throw failure;
   drawTextFrame(ctx as unknown as CanvasRenderingContext2D,c,W,H,fonts,p.width,frame-c.start);
   await new Promise<void>((resolve,reject)=>child.stdin.write(canvas.data(),e=>e?reject(e):resolve()));onProgress?.((frame-from+1)/(to-from));
 }child.stdin.end();await finished;}finally{signal?.removeEventListener('abort',cancel);cancel();await finished.catch(()=>{});}
}
