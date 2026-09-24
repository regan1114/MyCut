import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { Library } from '../server/library';
import { ffmpeg } from '../server/native';
import { audioFeatures } from '../server/rhythm';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-spectrum-hour-')),lib=new Library(root);await lib.init();
try{
 const file=path.join(root,'hour.wav');await ffmpeg(['-f','lavfi','-i','sine=frequency=660:sample_rate=8000:duration=3600','-c:a','pcm_s16le',file]);const media=await lib.import(file);let peak=process.memoryUsage().rss;const timer=setInterval(()=>{peak=Math.max(peak,process.memoryUsage().rss);},100),start=Date.now();
 try{const data=await audioFeatures(lib,media.id,undefined,true),bands=Buffer.from(data.bands!,'base64'),wave=Buffer.from(data.waveform!,'base64'),energy=Buffer.from(data.energy,'base64');assert.equal(energy.length,180000);assert.equal(bands.length,5760000);assert.equal(wave.length,5760000);assert.ok(bands.subarray(-32).some(v=>v>100));assert.ok(wave.subarray(-32).some(v=>v!==128));assert.deepEqual(await audioFeatures(lib,media.id,undefined,true),data);const result={success:true,duration:3600,featureFrames:energy.length,binaryBytes:energy.length+bands.length+wave.length,jsonBytes:Buffer.byteLength(JSON.stringify(data)),analysisAndCacheSeconds:(Date.now()-start)/1000,parentPeakRssMiB:Math.round(peak/1024**2),note:'Actual continuous one-hour tone; includes library waveform task, excludes FFmpeg memory.',root};await fs.writeFile('docs/spectrum-hour-test-result.json',JSON.stringify(result,null,2)+'\n');console.log(result);}finally{clearInterval(timer);}
}finally{lib.close();}
