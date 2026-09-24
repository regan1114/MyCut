import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { Library } from '../server/library';
import { renderSegment, segmentPlan } from '../server/render';
import { ffmpeg, probe } from '../server/native';
import { newProject, makeClip, type FontInfo } from '../shared/model';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-hour-test-'));
const fontRoot=path.resolve('public/fonts');const fonts:FontInfo[]=JSON.parse(await fs.readFile(path.join(fontRoot,'manifest.json'),'utf8'));
const lib=new Library(root);await lib.init();const tone=path.join(root,'tone.wav');await ffmpeg(['-f','lavfi','-i','sine=frequency=660:sample_rate=48000','-t','2',tone]);const audio=await lib.import(tone);
const p=newProject();p.fps=24;p.name='一小時時間軸驗證';p.clips=[makeClip({kind:'shape',trackId:'main',start:0,duration:3600*p.fps,color:'#99d4ae'}),...[0,1799,3598].map(s=>makeClip({kind:'audio',mediaId:audio.id,trackId:'music',start:s*p.fps,duration:2*p.fps,volume:.3}))];
const expanded=process.argv.includes('--expanded');
const effects=expanded||process.env.MYCUT_TEST_EFFECTS==='1'||process.argv.includes('--effects');if(effects)p.effects.enabled=['sakura','rain','elven','fireflies','snow','nostalgic','vignette'];
if(expanded){p.effects.enabled=['spectrum','bloom','lightSweep','leaves','dandelion','embers','stars','vhs','ripple','kaleidoscope','mirror','raindrops'];for(const start of [0,1799,3598])p.clips.push(makeClip({kind:'text',trackId:'text',start:start*p.fps,duration:2*p.fps,text:'星光',fontSize:200,karaoke:{enabled:true,color:'#ffe27a',offset:0,source:'manual',words:[{text:'星',start:0,end:24},{text:'光',start:24,end:48}]}}));}
const plan=segmentPlan(p);const list:string[]=[];const started=Date.now();let peakRss=process.memoryUsage().rss;
for(let i=0;i<plan.length;i++){
 const s=plan[i],file=`part-${String(i).padStart(4,'0')}.mov`;
 await renderSegment(p,lib,fonts,fontRoot,s.from,s.to,{resolution:720,quality:'standard',encoder:'libx264'},path.join(root,file),path.join(root,'assets'),{size:{width:320,height:180}});
 list.push(`file '${file}'\nduration ${(s.to-s.from)/p.fps}`);peakRss=Math.max(peakRss,process.memoryUsage().rss);
 if(i%60===0)console.log(`Hour export: ${i+1}/${plan.length} segments, parent RSS ${(peakRss/1024**2).toFixed(1)} MiB`);
}
await fs.writeFile(path.join(root,'concat.txt'),list.join('\n'));
const output=path.join(root,'one-hour.mp4');await ffmpeg(['-f','concat','-safe','1','-i',path.join(root,'concat.txt'),'-map','0:v','-map','0:a','-c:v','copy','-c:a','aac','-b:a','192k','-t','3600','-movflags','+faststart',output]);
const info=await probe(output);const v=info.streams.find((s:any)=>s.codec_type==='video'),a=info.streams.find((s:any)=>s.codec_type==='audio');assert.equal(+v.nb_frames,86400);assert.ok(Math.abs(+info.format.duration-3600)<.05);assert.ok(Math.abs(+a.duration-3600)<.05);
const result={success:true,effects:p.effects.enabled,note:'320×180, 24fps timing and pipeline verification; not a 4K stress benchmark',duration:info.format.duration,frames:v.nb_frames,audioDuration:a.duration,segments:plan.length,elapsedSeconds:(Date.now()-started)/1000,parentPeakRssMiB:+(peakRss/1024**2).toFixed(1),output};
await fs.writeFile(path.resolve(expanded?'docs/expanded-hour-test-result.json':effects?'docs/effects-hour-test-result.json':'docs/hour-test-result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));lib.close();
for(const f of await fs.readdir(root)){if(f.startsWith('part-'))await fs.rm(path.join(root,f));}
