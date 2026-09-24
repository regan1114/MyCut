import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-close-editor-'));
const unpackaged=process.env.MYCUT_TEST_UNPACKAGED==='1';
const binary=unpackaged?require('electron'):(process.env.MYCUT_TEST_APP??path.resolve(process.platform==='win32'?'release/win-unpacked/MyCut.exe':`release/${process.arch==='arm64'?'mac-arm64':'mac'}/MyCut.app/Contents/MacOS/MyCut`));
const env={...process.env,MYCUT_DATA_DIR:root};delete env.ELECTRON_RUN_AS_NODE;
let app;
async function launch(){app=await electron.launch({executablePath:binary,env,args:[...(unpackaged?['.']:[]),`--user-data-dir=${path.join(root,'profile')}`],timeout:30000});const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));return page;}
const errors=[];
const closeWindow=()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());
const data=page=>page.evaluate(async()=>{const projects=await(await fetch('/api/projects')).json();return await(await fetch(`/api/projects/${projects[0].id}`)).json();});
try{
 let page=await launch();await page.getByRole('button',{name:'建立新專案',exact:true}).click();await page.getByRole('navigation').getByRole('button',{name:'文字',exact:true}).click();await page.getByRole('button',{name:'新增文字',exact:true}).click();await page.getByText('已儲存至本機',{exact:true}).waitFor();
 // Delay disk requests so the close path must wait; edits during that wait must also be saved.
 let releaseSave,pending=false;const gate=new Promise(resolve=>{releaseSave=resolve;});
 await page.route('**/api/projects/*',async route=>{if(route.request().method()==='PUT'){pending=true;await gate;}await route.continue();});
 await page.getByLabel('文字內容',{exact:true}).fill('關閉前的修改');await closeWindow();await expect.poll(()=>pending).toBe(true);await closeWindow();
 assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),1);await expect(page.locator('.app-shell')).toBeVisible();
 await page.getByLabel('文字內容',{exact:true}).fill('儲存等待期間的最後修改');releaseSave();await expect(page.locator('.project-home')).toBeVisible();await page.unroute('**/api/projects/*');
 assert.equal((await data(page)).clips[0].text,'儲存等待期間的最後修改');await page.getByRole('button',{name:'開啟 未命名專案',exact:true}).click();await page.locator('.timeline-clip').click();await expect(page.getByLabel('文字內容',{exact:true})).toHaveValue('儲存等待期間的最後修改');
 // A failed save leaves the editor open and can be retried by closing again.
 await page.route('**/api/projects/*',route=>route.request().method()==='PUT'?route.fulfill({status:500,json:{error:'儲存失敗測試'}}):route.continue());
 await page.getByLabel('文字內容',{exact:true}).fill('儲存失敗後仍保留的修改');await closeWindow();await expect(page.locator('.toast.error')).toContainText('儲存失敗測試');await expect(page.locator('.app-shell')).toBeVisible();assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),1);
 await page.unroute('**/api/projects/*');await closeWindow();await expect(page.locator('.project-home')).toBeVisible();assert.equal((await data(page)).clips[0].text,'儲存失敗後仍保留的修改');
 await page.getByRole('button',{name:'開啟 未命名專案',exact:true}).click();
 // Closing the editor does not shut down a running native export.
 const job=await page.evaluate(async()=>{const projects=await(await fetch('/api/projects')).json(),p=await(await fetch(`/api/projects/${projects[0].id}`)).json();p.clips=p.clips.map(c=>({...c,start:0,duration:3600*p.fps}));return await(await fetch('/api/exports',{method:'POST',headers:{'Content-Type':'application/json','X-MyCut':'1'},body:JSON.stringify({project:p,settings:{resolution:720,quality:'standard',encoder:'libx264'}})})).json();});assert.ok(job.id);
 await closeWindow();await expect(page.locator('.project-home')).toBeVisible();
 const afterClose=await page.evaluate(async id=>(await(await fetch('/api/exports')).json()).find(j=>j.id===id),job.id);assert.ok(['queued','running'].includes(afterClose.status),JSON.stringify(afterClose));
 await page.evaluate(async id=>{const response=await fetch(`/api/exports/${id}/pause`,{method:'POST',headers:{'X-MyCut':'1'}});if(!response.ok)throw Error(await response.text());},job.id);
 await page.screenshot({path:'test-results/close-editor-home.png',fullPage:true});
 // Closing from the manager still closes the app when no jobs are running.
 let closed=app.waitForEvent('close');await app.evaluate(({BrowserWindow})=>{setTimeout(()=>BrowserWindow.getAllWindows()[0].close(),0);});await closed;app=undefined;
 // Explicit application quit must not be converted into "return home".
 page=await launch();const savedOnOpen=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().includes('/api/projects/'));await page.getByRole('button',{name:'開啟 未命名專案',exact:true}).click();await savedOnOpen;await page.getByText('已儲存至本機',{exact:true}).waitFor();closed=app.waitForEvent('close');await app.evaluate(({app})=>{setTimeout(()=>app.quit(),0);});await closed;app=undefined;
 assert.deepEqual(errors,[]);
 const version=JSON.parse(await fs.readFile('package.json','utf8')).version;
 const report={version,testedAt:new Date().toISOString(),platform:process.platform,arch:process.arch,packagedApp:!unpackaged,nativeCloseReturnsHome:true,waitsForSave:true,editsDuringSavePreserved:true,repeatedCloseSafe:true,failedSaveKeepsEditor:true,retrySaveOnClose:true,exportContinuesOnHome:true,managerCloseStillCloses:true,explicitQuitStillQuits:true,errors};
 await fs.writeFile(`docs/close-editor-${process.platform}-${process.arch}${unpackaged?'-source':''}-test-result.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}}
