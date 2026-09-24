import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Library } from '../server/library';
import { SpeechJobs } from '../server/speech';
import { ffmpeg, probe } from '../server/native';
import { renderSegment } from '../server/render';
import { audioFeatures } from '../server/rhythm';
import { newProject, makeClip } from '../shared/model';
import { defaultKaraoke, validWordTiming } from '../shared/karaoke';
import { cuesToEnhancedLrc } from '../shared/captions';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-karaoke-test-')),lib=new Library(root);await lib.init();
const fonts=JSON.parse(await fs.readFile('public/fonts/manifest.json','utf8')),fontRoot=path.resolve('public/fonts');const speech=new SpeechJobs(path.join(root,'captions'),lib,process.cwd());await speech.init();
try{
 const p=newProject();p.name='逐字高亮匯出測試';const words=[{text:'星',start:0,end:15},{text:'光',start:30,end:60}];p.clips=[makeClip({kind:'text',trackId:'text',start:0,duration:90,text:'星光',fontSize:240,karaoke:{...defaultKaraoke(),enabled:true,words}})];
 const settings={resolution:720 as const,quality:'high' as const,encoder:'libx264' as const},assets=path.join(root,'assets'),opts={size:{width:320,height:180}};
 await renderSegment(p,lib,fonts,fontRoot,0,90,settings,path.join(root,'full.mov'),assets,opts);await renderSegment(p,lib,fonts,fontRoot,45,90,settings,path.join(root,'tail.mov'),assets,opts);
 const frame=async(file:string,time:number,name:string)=>{const out=path.join(root,name+'.rgb');await ffmpeg(['-ss',String(time),'-i',file,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24',out]);return fs.readFile(out);};
 const a=await frame(path.join(root,'full.mov'),1.5,'a'),b=await frame(path.join(root,'tail.mov'),0,'b'),early=await frame(path.join(root,'full.mov'),0,'early'),late=await frame(path.join(root,'full.mov'),2.5,'late');const diff=a.reduce((s,v,i)=>s+Math.abs(v-b[i]),0)/a.length;assert.ok(diff<2,`segment seam ${diff}`);const yellow=(b:Buffer)=>{let n=0;for(let i=0;i<b.length;i+=3)if(b[i]>180&&b[i+1]>140&&b[i+2]<160)n++;return n;};assert.equal(yellow(early),0);assert.ok(yellow(late)>100);assert.equal((await probe(path.join(root,'full.mov'))).streams[0].nb_frames,'90');
 // An opaque upper track must occlude the lyric. Karaoke must not bypass the compositor.
 p.tracks.unshift({id:'cover',name:'遮蔽層',kind:'video',hidden:false,muted:false,locked:false});p.clips.push(makeClip({kind:'shape',trackId:'cover',start:0,duration:90,scale:4,color:'#123456'}));await renderSegment(p,lib,fonts,fontRoot,60,61,settings,path.join(root,'covered.mov'),assets,opts);assert.equal(yellow(await frame(path.join(root,'covered.mov'),0,'covered')),0);p.clips.pop();p.tracks.shift();
 const controller=new AbortController();await assert.rejects(()=>renderSegment(p,lib,fonts,fontRoot,0,90,settings,path.join(root,'cancel.mov'),assets,{...opts,signal:controller.signal,onProgress:()=>controller.abort()}),/暫停|EPIPE|aborted/i);assert.ok(!(await fs.readdir(assets)).some(n=>n.startsWith('karaoke-')));
 const tone=path.join(root,'tone.wav');await ffmpeg(['-f','lavfi','-i','sine=frequency=440:duration=3',tone]);const m=await lib.import(tone);const spectral=await audioFeatures(lib,m.id,undefined,true);assert.equal(Buffer.from(spectral.bands!,'base64').length,Buffer.from(spectral.energy,'base64').length*32);assert.ok(Buffer.from(spectral.bands!,'base64').some(v=>v>100));p.effects.enabled=['spectrum','bloom','stars','raindrops'];p.clips.push(makeClip({kind:'audio',trackId:'music',mediaId:m.id,start:0,duration:90}));await renderSegment(p,lib,fonts,fontRoot,0,90,settings,path.join(root,'fx-karaoke.mov'),assets);await ffmpeg(['-ss','1.5','-i',path.join(root,'fx-karaoke.mov'),'-frames:v','1',path.join(root,'karaoke.png')]);
 const recognition=[];
 for(const language of ['en','zh'] as const){const file=path.resolve(`tests/fixtures/original-${language}.wav`);const media=await lib.import(file),project=newProject();project.clips=[makeClip({kind:'audio',trackId:'voice',mediaId:media.id,start:108000,duration:Math.floor(media.duration*30)})];const started=Date.now(),job=await speech.create(project,{mode:'lyrics',language,karaoke:true});const deadline=Date.now()+180000;while(!['completed','failed'].includes(job.status)){assert.ok(Date.now()<deadline,'recognition timeout');await new Promise(r=>setTimeout(r,200));}assert.equal(job.status,'completed',job.error);const cues=speech.get(job.id).cues!;assert.ok(cues.length);assert.ok(cues.every(c=>validWordTiming(c.text,c.words??[])),JSON.stringify(cues));assert.ok(cues.flatMap(c=>c.words!).length>8);assert.match(cuesToEnhancedLrc(cues,30),/^\[60:/);recognition.push({language,seconds:(Date.now()-started)/1000,cues:cues.length,words:cues.flatMap(c=>c.words!).length,text:cues.map(c=>c.text).join(' ')});console.log(JSON.stringify(recognition.at(-1)));}
 const result={success:true,segmentDifference:diff,transparentLayerOrder:true,cancelCleanup:true,actualSpectralFeatures:true,karaokeWithEffects:'720p',recognition,root};await fs.writeFile('docs/karaoke-test-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{speech.close();lib.close();}
