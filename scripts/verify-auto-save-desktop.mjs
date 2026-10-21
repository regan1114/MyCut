import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {newProject,makeClip} from '../shared/model.ts';
const version=JSON.parse(await fs.readFile('package.json','utf8')).version,root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-auto-save-')),destination=path.join(root,'自動儲存.mp4');
const env={...process.env,MYCUT_DATA_DIR:root};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:path.resolve(`release/${version}/mac/Reelume.app/Contents/MacOS/Reelume`),env,args:[`--user-data-dir=${path.join(root,'profile')}`],timeout:30000});
try{
 const page=await app.firstWindow();const p=newProject();p.name='自動儲存測試';p.clips=[makeClip({kind:'shape',trackId:'main',start:0,duration:30})];
 await page.evaluate(async p=>{await fetch(`/api/projects/${p.id}`,{method:'PUT',headers:{'Content-Type':'application/json','X-Reelume':'1'},body:JSON.stringify(p)});},p);await page.reload();await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();
 await app.evaluate(({dialog,shell})=>{globalThis.pickerCount=0;dialog.showSaveDialog=async()=>{globalThis.pickerCount++;return {canceled:true};};shell.showItemInFolder=file=>{globalThis.revealed=file;};});
 await page.getByRole('button',{name:'匯出影片',exact:true}).click();const modal=page.getByRole('dialog',{name:'匯出影片',exact:true});await modal.getByLabel('匯出解析度').selectOption('720');await modal.getByRole('button',{name:'開始匯出',exact:true}).click();await expect.poll(()=>app.evaluate(()=>globalThis.pickerCount)).toBe(1);await expect(modal.getByRole('button',{name:'開始匯出',exact:true})).toBeEnabled();expect(await page.evaluate(async()=>(await fetch('/api/exports')).json())).toEqual([]);
 await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>{globalThis.pickerCount++;return {canceled:false,filePath:file};};},destination);
 await modal.getByRole('button',{name:'開始匯出',exact:true}).click();await expect(modal.locator('.job-status')).toContainText('已儲存影片',{timeout:60000});expect((await fs.stat(destination)).size).toBeGreaterThan(1000);expect(await app.evaluate(()=>globalThis.pickerCount)).toBe(2);await expect(modal).toContainText(destination);
 await modal.getByRole('button',{name:'顯示檔案',exact:true}).click();await expect.poll(()=>app.evaluate(()=>globalThis.revealed)).toBe(destination);expect(await app.evaluate(()=>globalThis.pickerCount)).toBe(2);
 await modal.getByRole('button',{name:'關閉',exact:true}).click();await expect(modal).toHaveCount(0);expect((await fs.stat(destination)).size).toBeGreaterThan(1000);await expect(page.locator('.save-state')).toHaveText('已儲存至本機');await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await expect(page.getByRole('heading',{name:'我的專案'})).toBeVisible();
 const result={version,packaged:true,pickerCancellation:'passed',automaticSave:'passed',noSecondPrompt:'passed',revealSavedFile:'passed',savedFileSurvivesClose:'passed',isolatedData:root};await fs.writeFile('docs/auto-save-desktop-test-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
