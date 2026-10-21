import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
const version=JSON.parse(await fs.readFile('package.json','utf8')).version;
const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-vocals-desktop-'));
const fixture=path.join(root,'分離測試.wav');
execFileSync(ffmpeg,['-y','-i','tests/fixtures/original-en.wav','-t','2',fixture],{stdio:'ignore'});
const binary=process.env.MYCUT_TEST_APP??path.resolve(`release/${version}/mac/Reelume.app/Contents/MacOS/Reelume`);
const env={...process.env,MYCUT_DATA_DIR:root};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:binary,env,args:[`--user-data-dir=${path.join(root,'profile')}`],timeout:30000});
try{
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const info=await page.evaluate(()=>window.reelume.appInfo());expect(info.version).toBe(version);expect(info.packaged).toBe(true);
 await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},fixture);
 await page.getByRole('button',{name:'從影片開始',exact:true}).click();
 const original=page.locator('.media-card').filter({hasText:'分離測試.wav'});await expect(original).toBeVisible({timeout:30000});await original.click({button:'right'});
 await expect(page.getByRole('menuitem',{name:'分離音訊',exact:true})).toHaveCount(0);
 await page.getByRole('menuitem',{name:'分離人聲',exact:true}).click();await expect(page.getByLabel('人聲分離進度')).toBeVisible();
 const vocals=page.locator('.media-card').filter({hasText:'分離測試 · 人聲.wav'});await expect(vocals).toBeVisible({timeout:180000});
 await vocals.getByRole('button',{name:'加入 分離測試 · 人聲.wav',exact:true}).click();await expect(page.locator('.clip-audio')).toHaveCount(2);
 const media=await page.evaluate(async()=>await(await fetch('/api/media')).json());const output=media.find(m=>m.name==='分離測試 · 人聲.wav');expect(output.kind).toBe('audio');expect(output.duration).toBeCloseTo(2,1);expect(output.hasAudio).toBe(true);
 await expect(page.locator('.toast.error')).toHaveCount(0);expect(errors).toEqual([]);
 await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/vocals-desktop-0.6.30.png',fullPage:true});
 await expect(page.locator('.save-state')).toHaveText('已儲存至本機');await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await expect(page.getByRole('heading',{name:'我的專案'})).toBeVisible();
 console.log(JSON.stringify({version,packaged:true,platform:process.platform,arch:process.arch,vocalSeparation:'passed',outputDuration:output.duration,addToTimeline:'passed',isolatedData:root},null,2));
}finally{await app.close();}
