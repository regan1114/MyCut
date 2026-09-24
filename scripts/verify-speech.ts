import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Library } from '../server/library';
import { SpeechJobs } from '../server/speech';
import { ffmpeg } from '../server/native';
import { makeClip, newProject } from '../shared/model';
import { cuesToLrc } from '../shared/captions';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-speech-test-'));const library=new Library(root);await library.init();const jobs=new SpeechJobs(path.join(root,'captions'),library,process.cwd());await jobs.init();
const wait=async(id:string,service=jobs)=>{const deadline=Date.now()+180000;while(true){const j=service.get(id);if(j.status==='completed')return j;if(j.status==='failed')throw new Error(j.error);if(Date.now()>deadline)throw new Error('Speech recognition timeout');await new Promise(r=>setTimeout(r,200));}};
const results=[];
try{
 assert.equal((await jobs.capabilities()).available,true);
 const fixtures={en:path.resolve('tests/fixtures/original-en.wav'),zh:path.resolve('tests/fixtures/original-zh.wav'),lyrics:path.resolve('tests/fixtures/original-lyrics.wav')};
 for(const [file,language,mode] of [[fixtures.en,'en','captions'],[fixtures.zh,'zh','captions'],[fixtures.lyrics,'en','lyrics']] as const){
  let source:string=file;if(mode==='lyrics'){source=path.join(root,'lyrics-with-music.wav');await ffmpeg(['-i',file,'-f','lavfi','-i','sine=frequency=196:sample_rate=16000','-filter_complex','[1:a]volume=0.25[tone];[0:a][tone]amix=inputs=2:duration=first:normalize=0[out]','-map','[out]','-c:a','pcm_s16le',source]);}
  const media=await library.import(source);const p=newProject();p.name=`Actual ${language} ${mode}`;p.clips=[makeClip({kind:'audio',trackId:'voice',mediaId:media.id,start:mode==='lyrics'?3600*p.fps:60,duration:Math.floor(media.duration*p.fps)})];
  const started=Date.now();const j=await jobs.create(p,{mode,language,traditional:true,vocalFocus:true});const result=await wait(j.id);assert.ok(result.cues?.length,'No recognized cues');const text=result.cues!.map(c=>c.text).join(' ');if(language==='en'&&mode==='captions')assert.match(text,/sun is shining/i);if(language==='zh')assert.match(text,/字幕|影片/);if(mode==='lyrics'){assert.match(text,/morning|sing|light/i);assert.match(cuesToLrc(result.cues!,p.fps),/^\[60:/);}
  assert.ok(result.cues!.every(c=>c.start>=p.clips[0].start&&c.start+c.duration<=p.clips[0].start+p.clips[0].duration));results.push({language,mode,audioSeconds:media.duration,recognitionSeconds:(Date.now()-started)/1000,text,cues:result.cues!.length});console.log(JSON.stringify(results.at(-1)));
 }
 // Interrupt real native recognition; restart restores its snapshot as paused.
 const media=library.records[0];const p=newProject();p.clips=[makeClip({kind:'audio',trackId:'voice',mediaId:media.id,start:0,duration:Math.floor(media.duration*p.fps)})];const j=await jobs.create(p,{mode:'captions',language:'en'});await new Promise(r=>setTimeout(r,300));await jobs.pause(j.id);assert.equal(jobs.get(j.id).status,'paused');const restored=new SpeechJobs(path.join(root,'captions'),library,process.cwd());await restored.init();assert.equal(restored.get(j.id).status,'paused');await restored.resume(j.id);const deadline=Date.now()+180000;while(restored.get(j.id).status!=='completed'){const j2=restored.get(j.id);assert.notEqual(j2.status,'failed',j2.error);assert.ok(Date.now()<deadline);await new Promise(r=>setTimeout(r,200));}assert.ok(restored.get(j.id).cueCount>0);restored.close();
 // An actual hour-long file, with original speech at both ends and silence
 // between, verifies seeking, silence skipping and timestamps across all 120 chunks.
 const hourFile=path.join(root,'one-hour.wav');await ffmpeg(['-i',fixtures.en,'-filter_complex','[0:a]asplit=2[a][b];[a]apad,atrim=duration=3600[base];[b]adelay=3590000:all=1[tail];[base][tail]amix=inputs=2:duration=first:normalize=0[out]','-map','[out]','-ar','16000','-ac','1','-c:a','pcm_s16le',hourFile]);
 const hourMedia=await library.import(hourFile);const hourProject=newProject();hourProject.name='One-hour sparse speech';hourProject.clips=[makeClip({kind:'audio',trackId:'voice',mediaId:hourMedia.id,start:0,duration:3600*30})];const hourStarted=Date.now();const hourJob=await jobs.create(hourProject,{mode:'captions',language:'en'});while(jobs.get(hourJob.id).completedChunks<1){if(jobs.get(hourJob.id).status==='failed')throw new Error(jobs.get(hourJob.id).error);await new Promise(r=>setTimeout(r,100));}await jobs.pause(hourJob.id);const checkpoint=jobs.get(hourJob.id).completedChunks;assert.ok(checkpoint>=1&&checkpoint<120);const hourRestored=new SpeechJobs(path.join(root,'captions'),library,process.cwd());await hourRestored.init();await hourRestored.resume(hourJob.id);const hourResult=await wait(hourJob.id,hourRestored);hourRestored.close();assert.equal(hourResult.completedChunks,120);assert.ok(hourResult.cues!.some(c=>c.start<10*30));assert.ok(hourResult.cues!.some(c=>c.start>=3590*30));assert.ok(hourResult.cues!.every(c=>c.start<30*30||c.start>=3589*30),'Silent regions produced hallucinated captions');
 await fs.writeFile('docs/speech-test-result.json',JSON.stringify({testedAt:new Date().toISOString(),engine:'whisper.cpp 1.8.6',model:'small-q5_1',fixtures:'Original macOS synthetic speech and synthetic singing with a generated accompaniment tone',results,pauseResume:'passed',hourTimestamp:'passed',hourFile:{audioSeconds:hourMedia.duration,chunks:hourResult.completedChunks,resumedFromChunk:checkpoint,cues:hourResult.cueCount,recognitionSeconds:(Date.now()-hourStarted)/1000,scope:'Real 3,600-second PCM file with speech at beginning/end and silence between. Not a continuous speech or dense music benchmark.'}},null,2));console.log('Real speech / lyrics / interruption recovery / one-hour sparse audio passed');
}finally{jobs.close();library.close();}
