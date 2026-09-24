import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const require=createRequire(import.meta.url),root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut 可攜專案-'));
const binary=process.env.MYCUT_TEST_APP??path.resolve(process.platform==='win32'?'release/win-unpacked/MyCut.exe':`release/${process.arch==='arm64'?'mac-arm64':'mac'}/MyCut.app/Contents/MacOS/MyCut`);
const source=path.join(root,'原始影片.mp4'),bundle=path.join(root,'完整專案.mycutpack');
await promisify(execFile)(require('ffmpeg-static'),['-hide_banner','-y','-f','lavfi','-i','testsrc2=size=320x180:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','4','-c:v','libx264','-preset','ultrafast','-c:a','aac',source]);
const errors=[];let app;
async function launch(name){const data=path.join(root,name);const env={...process.env,MYCUT_DATA_DIR:data};delete env.ELECTRON_RUN_AS_NODE;const application=await electron.launch({executablePath:binary,env,args:[`--user-data-dir=${path.join(data,'profile')}`],timeout:30000});const page=await application.firstWindow();page.on('pageerror',e=>errors.push(e.message));return {application,page};}
async function current(page){return page.evaluate(async()=>{const list=await(await fetch('/api/projects')).json();return await(await fetch(`/api/projects/${list[0].id}`)).json();});}
try{
  let session=await launch('來源資料庫');app=session.application;let page=session.page;
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},source);
  await page.getByRole('button',{name:'從影片開始',exact:true}).click();await page.locator('.clip-video').click();await page.getByRole('navigation').getByRole('button',{name:'音訊',exact:true}).click();await page.getByRole('button',{name:'分離音訊',exact:true}).click();await expect(page.locator('.timeline-clip.selected')).toHaveCount(2);
  await page.locator('.inspector').getByRole('button',{name:'基本',exact:true}).click();await page.getByLabel('開始秒數',{exact:true}).fill('0.5');await page.getByLabel('片段長度',{exact:true}).fill('2');await page.getByRole('button',{name:'建立群組',exact:true}).click();
  await page.getByRole('navigation').getByRole('button',{name:'字幕',exact:true}).click();await page.getByRole('button',{name:'新增字幕',exact:true}).click();await page.getByLabel('文字內容',{exact:true}).fill('原始字幕');await page.getByRole('button',{name:'字幕批次編輯',exact:true}).click();await page.getByLabel('批次尋找').fill('原始');await page.getByLabel('批次取代').fill('還原');await page.getByRole('button',{name:'預覽套用（1 則）'}).click();await page.getByRole('button',{name:'儲存批次變更'}).click();
  await page.getByRole('navigation').getByRole('button',{name:'特效',exact:true}).click();await page.getByRole('button',{name:'時段特效',exact:true}).click();await page.getByRole('button',{name:'雨絲',exact:true}).click();await page.getByLabel('特效開始秒數').fill('1');await page.getByLabel('特效長度秒數').fill('1');
  await page.getByText('已儲存至本機',{exact:true}).waitFor();const original=await current(page),pair=original.clips.filter(c=>c.kind==='video'||c.kind==='audio');assert.deepEqual(pair.map(c=>[c.start,c.duration]),[[15,60],[15,60]]);assert.ok(pair[0].linkId);assert.equal(pair[0].linkId,pair[1].linkId);assert.equal(pair[0].groupId,pair[1].groupId);
  await app.evaluate(({dialog,shell},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});shell.showItemInFolder=()=>{};},bundle);
  await page.locator('.project-switch').click();await page.getByRole('button',{name:'打包完整專案',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'完整專案包已儲存'})).toBeVisible({timeout:30000});assert.ok((await fs.stat(bundle)).size>1000);await page.screenshot({path:'test-results/portable-project.png',fullPage:true});await app.close();app=undefined;
  // A fresh library and unavailable originals model moving the pack to another computer.
  await fs.rename(path.join(root,'來源資料庫'),path.join(root,'來源資料庫已移走'));await fs.rm(source);
  session=await launch('目的資料庫');app=session.application;page=session.page;await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},bundle);
  await page.getByRole('button',{name:'開啟專案檔',exact:true}).click();await expect(page.locator('.project-switch')).toContainText('還原',{timeout:30000});const restored=await current(page);assert.notEqual(restored.id,original.id);assert.equal(restored.clips.length,4);assert.equal(restored.clips.find(c=>c.kind==='text').text,'還原字幕');assert.deepEqual(restored.clips.find(c=>c.kind==='effect').effects.enabled,['rain']);assert.notEqual(restored.clips[0].mediaId,original.clips[0].mediaId);const media=await page.evaluate(async()=>await(await fetch('/api/media')).json());assert.equal(media.length,1);assert.notEqual(media[0].missing,true);
  await page.getByRole('button',{name:'匯出影片',exact:true}).click();await page.getByLabel('匯出解析度').selectOption('720');await page.getByLabel('匯出畫質').selectOption('standard');await page.getByRole('button',{name:'開始匯出',exact:true}).click();await expect(page.locator('.export-job.completed')).toHaveCount(1,{timeout:90000});await page.screenshot({path:'test-results/portable-restored-export.png',fullPage:true});assert.deepEqual(errors,[]);
  const version=JSON.parse(await fs.readFile('package.json','utf8')).version;const report={testedAt:new Date().toISOString(),version,platform:process.platform,arch:process.arch,packagedApp:true,nativeProjectPack:true,freshLibraryRestore:true,originalSourcesRemoved:true,mediaIdsRemapped:true,linkedInspectorTiming:true,groupsPreserved:true,timedEffectsPreserved:true,captionBatchPreserved:true,restored720pExport:true,root};await fs.writeFile(`docs/portable-desktop-${process.platform}-${process.arch}-test-result.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{if(app)await app.close();}
