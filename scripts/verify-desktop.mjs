import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut 桌面測試-' ));
const fixture=path.join(root,'mycut-speech-en.wav');await fs.copyFile('tests/fixtures/original-en.wav',fixture);
const binary=process.env.MYCUT_TEST_APP??path.resolve(process.platform==='win32'?'release/win-unpacked/MyCut.exe':`release/${process.arch==='arm64'?'mac-arm64':'mac'}/MyCut.app/Contents/MacOS/MyCut`);
const environment={...process.env,MYCUT_DATA_DIR:root};delete environment.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:binary,env:environment,args:[`--user-data-dir=${path.join(root,'electron-profile')}`],timeout:30000});
try{
 const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.getByRole('button',{name:'開啟示範專案',exact:true}).click();
 await page.getByRole('button',{name:'山間・原創示範素材.png，00:00:00:00'}).waitFor({timeout:30000});
 await page.keyboard.press('Shift+ArrowRight');await page.keyboard.press('Shift+ArrowRight');
 await page.getByRole('navigation').getByRole('button',{name:'特效',exact:true}).click();await page.getByRole('button',{name:'櫻花',exact:true}).click();await page.getByRole('button',{name:'懷舊濾鏡',exact:true}).click();await page.getByRole('button',{name:'精靈粒子',exact:true}).click();
 await page.getByRole('button',{name:'星空／流星',exact:true}).click();await page.keyboard.press(process.platform==='darwin'?'Meta+z':'Control+z');await expect(page.getByRole('button',{name:'星空／流星',exact:true})).toHaveAttribute('aria-pressed','false');await page.keyboard.press(process.platform==='darwin'?'Meta+Shift+z':'Control+y');await expect(page.getByRole('button',{name:'星空／流星',exact:true})).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'畫面',exact:true}).click();await page.locator('.library-scroll').evaluate(el=>el.scrollTop=0);await page.screenshot({path:'test-results/desktop-effects.png',fullPage:true});
 const health=await page.evaluate(async()=>{const r=await fetch('/api/health');return r.json();});assert.equal(health.ffmpeg,true);assert.equal(health.fonts,JSON.parse(await fs.readFile('public/fonts/manifest.json','utf8')).length);assert.equal(health.platform,process.platform);assert.equal(await page.evaluate(()=>window.mycut?.platform),process.platform);
 assert.equal(await page.evaluate(()=>typeof window.mycut?.importFiles),'function');
 await page.getByText('已儲存至本機',{exact:true}).waitFor();
 // A small native export in the packaged app checks ASAR font and binary paths.
 const result=await page.evaluate(async()=>{const projects=await(await fetch('/api/projects')).json();const p=await(await fetch(`/api/projects/${projects[0].id}`)).json();p.name='CON';p.effects.enabled=['sakura','nostalgic','elven','rain','snow','fireflies','bokeh','vignette','lightLeak','fog','aurora','ambilight','strobe','glitch','fireworks','punch','spectrum','bloom','lightSweep','leaves','dandelion','embers','stars','vhs','ripple','kaleidoscope','mirror','raindrops'];p.clips=p.clips.filter(c=>c.kind==='text'||c.kind==='image').map(c=>({...c,start:0,duration:30,fadeIn:0,fadeOut:0,keyframes:[]}));for(const c of p.clips.filter(c=>c.kind==='text'))c.karaoke={enabled:true,color:'#ffe27a',words:[{text:c.text,start:0,end:30}],offset:0,source:'manual'};return(await fetch('/api/exports',{method:'POST',headers:{'Content-Type':'application/json','X-MyCut':'1'},body:JSON.stringify({project:p,settings:{resolution:720,quality:'standard',encoder:'libx264'}})})).json();});
 assert.ok(result.id,JSON.stringify(result));let status;const deadline=Date.now()+60000;
 do{await new Promise(r=>setTimeout(r,300));status=await page.evaluate(async id=>(await(await fetch('/api/exports')).json()).find(j=>j.id===id),result.id);if(Date.now()>deadline)throw new Error('Packaged export timed out');}while(!['completed','failed'].includes(status.status));
 assert.equal(status.status,'completed',status.error);
 const savedVideo=path.join(root,'中文另存影片.mp4');
 await app.evaluate(({dialog,shell},file)=>{dialog.showSaveDialog=async(_window,options)=>{globalThis.__mycutSaveDefault=options.defaultPath;return {canceled:false,filePath:file};};shell.showItemInFolder=()=>{};},savedVideo);
 assert.equal(await page.evaluate(id=>window.mycut.saveExport(id),result.id),true);
 assert.equal(await app.evaluate(()=>globalThis.__mycutSaveDefault),'_CON.mp4');assert.ok((await fs.stat(savedVideo)).size>1000);
 await page.getByRole('button',{name:'返回專案首頁'}).click();await page.screenshot({path:'test-results/desktop-home.png',fullPage:true});
 // Exercise the real native picker IPC with a deterministic fixture selection.
 await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},fixture);
 await page.getByRole('button',{name:'從影片開始',exact:true}).click();await page.getByRole('button',{name:'字幕',exact:true}).click();await page.getByLabel('音訊語言').selectOption('en');await page.getByLabel('辨識逐字時間與卡拉 OK').check();await page.getByRole('button',{name:'開始辨識字幕'}).click();await page.getByRole('button',{name:'校對與加入'}).waitFor({timeout:120000});await page.getByRole('button',{name:'校對與加入'}).click();
 assert.match(await page.getByLabel('字幕 1 文字',{exact:true}).inputValue(),/welcome/i);await page.screenshot({path:'test-results/desktop-captions.png',fullPage:true});await page.getByRole('button',{name:'加入時間軸',exact:true}).click();await page.getByText('已儲存至本機',{exact:true}).waitFor();
 assert.equal(await page.locator('.toast.error').count(),0);
 const speech=await page.evaluate(async()=>await(await fetch('/api/speech')).json());assert.equal(speech.available,true);
 const speechProject=await page.evaluate(async()=>{const list=await(await fetch('/api/projects')).json();const project=list.find(p=>p.name==='mycut-speech-en');return await(await fetch(`/api/projects/${project.id}`)).json();});assert.ok(speechProject.clips.some(c=>c.captionJobId&&c.karaoke.enabled&&c.karaoke.words.length>1));
 const projectFile=path.join(root,'native-project.mycut.json');await fs.writeFile(projectFile,JSON.stringify(speechProject));await page.getByRole('button',{name:'返回專案首頁'}).click();await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},projectFile);await page.getByRole('button',{name:'開啟專案檔',exact:true}).click();await page.locator('.project-switch').filter({hasText:'mycut-speech-en · 匯入'}).waitFor();
 await page.getByRole('button',{name:'返回專案首頁'}).click();await page.getByRole('heading',{name:'我的專案'}).waitFor();
 assert.deepEqual(errors,[]);const report={testedAt:new Date().toISOString(),platform:process.platform,arch:process.arch,version:JSON.parse(await fs.readFile('package.json','utf8')).version,packagedApp:true,fonts:health.fonts,nativeExport:'passed',nativeEffects:28,karaokeExport:true,acousticWordTiming:true,duration:status.duration,nativeUndoRedoKeys:'passed',nativeSaveDialog:'passed',windowsSafeName:'passed',nativeFilePicker:'passed',nativeProjectOpen:'passed',packagedSpeech:'passed',root};await fs.writeFile(`docs/desktop-${process.platform}-${process.arch}-test-result.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await app.close();}
