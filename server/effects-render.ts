import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createCanvas } from '@napi-rs/canvas';
import { renderEffects } from '../shared/effects';
import { effectLayersAt, projectNeedsRhythm } from '../shared/effect-timeline';
import { sampleRhythm } from '../shared/rhythm';
import type { Project, ExportSettings, FontInfo } from '../shared/model';
import type { Library } from './library';
import { projectFeatures } from './rhythm';
import { registerCanvasFonts } from './canvas-fonts';
import { ffmpeg, ffmpegPath } from './native';

function processDone(child:ChildProcessWithoutNullStreams,signal?:AbortSignal){
  let error='';child.stderr.on('data',(b:Buffer)=>{error=(error+b.toString()).slice(-5000);});
  const promise=new Promise<void>((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(new Error(signal?.aborted?'工作已暫停':error||`特效轉碼結束代碼 ${code}`)));});
  promise.catch(()=>{});return promise;
}
/** Native compositor -> one RGBA frame -> shared effects -> native encoder.
 * Backpressure bounds RAM independently of duration. Only segment audio/video are temporary. */
export async function renderEffectStream(args:string[],p:Project,library:Library,fonts:FontInfo[],fontRoot:string,from:number,to:number,W:number,H:number,settings:ExportSettings,dest:string,workdir:string,options:{signal?:AbortSignal;onProgress?:(s:number)=>void}){
  const {signal}=options;if(signal?.aborted)throw new Error('工作已暫停');
  const features=projectNeedsRhythm(p)?await projectFeatures(p,library,signal):new Map();
  if(signal?.aborted)throw new Error('工作已暫停');
  registerCanvasFonts(fonts,fontRoot);
  const audio=path.join(workdir,`fx-${from}.wav`),video=path.join(workdir,`fx-${from}.mov`);
  const duration=(to-from)/p.fps,total=to-from;
  const source=createCanvas(W,H),output=createCanvas(W,H),scratch=createCanvas(W,H);const sc=source.getContext('2d'),ctx=output.getContext('2d');const pixels=sc.createImageData(W,H);const bytes=Buffer.from(pixels.data.buffer,pixels.data.byteOffset,pixels.data.byteLength);
  const producer=spawn(ffmpegPath,['-hide_banner','-nostdin','-y','-threads','2','-filter_complex_threads','1',...args,'-map','[vout]','-an','-pix_fmt','rgba','-f','rawvideo','-threads','1','-t',String(duration),'pipe:1','-map','[aout]','-vn','-c:a','pcm_s16le','-ar','48000','-ac','2','-t',String(duration),audio],{stdio:'pipe',windowsHide:true});
  const encoderArgs=['-hide_banner','-nostdin','-y','-threads','2','-f','rawvideo','-pixel_format','rgba','-video_size',`${W}x${H}`,'-framerate',String(p.fps),'-i','pipe:0','-an','-c:v',settings.encoder];
  if(settings.encoder==='libx264')encoderArgs.push('-preset','fast','-crf',settings.quality==='high'?'18':'23','-threads','2');
  else encoderArgs.push('-b:v',`${settings.resolution===2160?40:settings.resolution===1080?12:6}M`,'-allow_sw','1');
  encoderArgs.push('-pix_fmt','yuv420p','-frames:v',String(total),'-video_track_timescale',String(p.fps*1000),video);
  const encoder=spawn(ffmpegPath,encoderArgs,{stdio:'pipe',windowsHide:true});encoder.stdout.resume();producer.stdin.end();
  const produced=processDone(producer,signal),encoded=processDone(encoder,signal);
  // Always attach an error listener; write callbacks propagate EPIPE without crashing Node.
  encoder.stdin.on('error',()=>{});producer.stdin.on('error',()=>{});
  let pipeError:Error|undefined;
  let stopping=false,killTimer:ReturnType<typeof setTimeout>|undefined;
  const cancel=()=>{if(stopping)return;stopping=true;
    // FFmpeg can be waiting for its first raw frame when pause arrives. Closing
    // the pipes supplies EOF; SIGTERM alone can leave that read blocked.
    producer.stdin.destroy();encoder.stdin.destroy();producer.stdout.destroy();
    producer.kill('SIGTERM');encoder.kill('SIGTERM');
    killTimer=setTimeout(()=>{producer.kill('SIGKILL');encoder.kill('SIGKILL');},2000);killTimer.unref();
  };
  produced.catch(e=>{pipeError=e;cancel();});encoded.catch(e=>{pipeError=e;cancel();});signal?.addEventListener('abort',cancel,{once:true});
  let used=0,frames=0;
  try{
    for await(const chunk of producer.stdout){
      const buffer=chunk as Buffer;let offset=0;
      while(offset<buffer.length){
        if(signal?.aborted)throw new Error('工作已暫停');if(pipeError)throw pipeError;
        const size=Math.min(bytes.length-used,buffer.length-offset);buffer.copy(bytes,used,offset,offset+size);used+=size;offset+=size;
        if(used===bytes.length){
          if(frames>=total)throw new Error('特效來源影格數超出預期');
          sc.putImageData(pixels,0,0);const time=(from+frames)/p.fps;
          ctx.clearRect(0,0,W,H);ctx.drawImage(source,0,0);
          for(const effects of effectLayersAt(p,from+frames)){sc.clearRect(0,0,W,H);sc.drawImage(output,0,0);renderEffects(ctx as unknown as CanvasRenderingContext2D,source as unknown as CanvasImageSource,W,H,time,effects,sampleRhythm(p,time,features,effects.speed),scratch.getContext('2d') as unknown as CanvasRenderingContext2D);}
          const raw=output.data();await new Promise<void>((resolve,reject)=>encoder.stdin.write(raw,error=>error?reject(error):resolve()));
          frames++;used=0;options.onProgress?.(frames/p.fps*.95);
        }
      }
    }
    await produced;if(used||frames!==total)throw new Error(`特效影格數不符：${frames}/${total}`);
    encoder.stdin.end();await encoded;
    await ffmpeg(['-i',video,'-i',audio,'-map','0:v:0','-map','1:a:0','-c','copy','-t',String(duration),dest],{signal});options.onProgress?.(duration);
  }finally{
    signal?.removeEventListener('abort',cancel);cancel();await Promise.allSettled([produced,encoded]);clearTimeout(killTimer);
    await Promise.all([fs.rm(audio,{force:true}),fs.rm(video,{force:true})]);
  }
}
