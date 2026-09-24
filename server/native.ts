import { createRequire } from 'node:module';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
const require = createRequire(import.meta.url);
import { unpackedPath } from '../shared/platform';
const unpack=(p:string|null)=>{if(!p)throw new Error('此平台缺少原生媒體工具');return unpackedPath(p);};
export const ffmpegPath:string = process.env.FFMPEG_PATH || unpack(require('ffmpeg-static'));
export const ffprobePath:string = process.env.FFPROBE_PATH || unpack(process.platform==='darwin'&&process.arch==='arm64'?path.join(path.dirname(require.resolve('@ffprobe-installer/darwin-arm64/package.json')),'ffprobe'):require('ffprobe-static').path);
export function runNative(binary:string,args:string[],options:{signal?:AbortSignal;onProgress?:(seconds:number)=>void;onProcess?:(p:ChildProcess)=>void}={}): Promise<string> {
  return new Promise((resolve,reject)=>{
    if(options.signal?.aborted) return reject(new Error('工作已暫停'));
    const child=spawn(binary,args,{stdio:['ignore','pipe','pipe'],windowsHide:true});options.onProcess?.(child);
    let out='',err='',lineBuffer='';
    const cancel=()=>child.kill('SIGTERM');options.signal?.addEventListener('abort',cancel,{once:true});
    child.stdout.on('data',(b:Buffer)=>{const s=b.toString();out=(out+s).slice(-2_000_000);lineBuffer+=s;const lines=lineBuffer.split('\n');lineBuffer=lines.pop()??'';for(const l of lines){if(l.startsWith('out_time_us='))options.onProgress?.(Number(l.slice(12))/1e6);}});
    child.stderr.on('data',(b:Buffer)=>{err=(err+b.toString()).slice(-16000);});
    child.on('error',e=>{options.signal?.removeEventListener('abort',cancel);reject(e);});
    child.on('close',code=>{options.signal?.removeEventListener('abort',cancel);if(code===0)resolve(out);else reject(new Error(options.signal?.aborted?'工作已暫停':err.slice(-5000)||`FFmpeg 結束代碼 ${code}`));});
  });
}
export const ffmpeg=(args:string[],options:Parameters<typeof runNative>[2]={})=>runNative(ffmpegPath,['-hide_banner','-nostdin','-y','-threads','2','-filter_complex_threads','1',...args],options);
export async function probe(file:string) { return JSON.parse(await runNative(ffprobePath,['-v','error','-show_format','-show_streams','-of','json',file])); }
