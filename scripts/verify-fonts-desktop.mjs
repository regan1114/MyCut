import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url),root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-fonts-'));
const unpackaged=process.env.MYCUT_TEST_UNPACKAGED==='1';
const binary=unpackaged?require('electron'):(process.env.MYCUT_TEST_APP??path.resolve(process.platform==='win32'?'release/win-unpacked/MyCut.exe':`release/${process.arch==='arm64'?'mac-arm64':'mac'}/MyCut.app/Contents/MacOS/MyCut`));
const env={...process.env,MYCUT_DATA_DIR:root};delete env.ELECTRON_RUN_AS_NODE;
const errors=[];let app;
async function launch(){app=await electron.launch({executablePath:binary,env,args:[...(unpackaged?['.']:[]),`--user-data-dir=${path.join(root,'profile')}`],timeout:30000});const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));return page;}
async function quit(){const closed=app.waitForEvent('close');await app.evaluate(({app})=>{setTimeout(()=>app.quit(),0);});await closed;app=undefined;}
async function openFonts(page){const picker=page.locator('.font-picker');if(await picker.getAttribute('open')===null)await picker.locator('summary').click();await page.getByLabel('搜尋字型',{exact:true}).fill('');await page.getByRole('button',{name:'全部字型',exact:true}).click();}
try{
  let page=await launch();await page.getByRole('button',{name:'建立新專案',exact:true}).click();
  await page.getByRole('navigation').getByRole('button',{name:'文字',exact:true}).click();await page.getByRole('button',{name:'新增文字',exact:true}).click();await openFonts(page);await expect(page.locator('.font-card')).toHaveCount(40);
  await expect(page.locator('.font-default')).toContainText('思源黑體 TC');
  await page.getByLabel('我的最愛：辰宇落雁體',{exact:true}).check();await expect(page.locator('.font-default')).toContainText('辰宇落雁體');
  await page.getByRole('navigation').getByRole('button',{name:'文字',exact:true}).click();await page.getByRole('button',{name:'新增文字',exact:true}).click();await expect(page.locator('.font-picker')).toHaveAttribute('data-font-id','chenyuluoyan');
  await page.getByText('已儲存至本機',{exact:true}).waitFor();
  const fonts=await page.evaluate(async()=>await(await fetch('/api/fonts')).json());
  // Load every bundled browser font explicitly; ordinary browsing remains lazy.
  const loaded=await page.evaluate(async fonts=>{const result=[];for(const f of fonts){const faces=await document.fonts.load(`24px "${f.family}"`,'把日常 Create');result.push({id:f.id,loaded:faces.length>0&&faces.every(face=>face.status==='loaded')});}return result;},fonts);
  assert.equal(loaded.length,40);assert.ok(loaded.every(f=>f.loaded),JSON.stringify(loaded.filter(f=>!f.loaded)));
  const firstOrigin=new URL(page.url()).origin;
  await quit();
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(root,'preferences.json'),'utf8')).favoriteFontIds,['chenyuluoyan']);
  page=await launch();await page.getByRole('button',{name:'建立新專案',exact:true}).click();
  await page.getByRole('navigation').getByRole('button',{name:'文字',exact:true}).click();await page.getByRole('button',{name:'新增文字',exact:true}).click();await expect(page.locator('.font-picker')).toHaveAttribute('data-font-id','chenyuluoyan');
  await page.getByText('已儲存至本機',{exact:true}).waitFor();
  const secondOrigin=new URL(page.url()).origin;
  await openFonts(page);await expect(page.getByLabel('我的最愛：辰宇落雁體',{exact:true})).toBeChecked();
  await page.getByRole('button',{name:'我的最愛（1）',exact:true}).click();
  await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/font-favorites-desktop.png',fullPage:true});
  // Exercise cached ordinary text and animated karaoke through native export.
  const result=await page.evaluate(async()=>{const list=await(await fetch('/api/projects')).json();const p=await(await fetch(`/api/projects/${list[0].id}`)).json();const c=p.clips[0];p.clips=['chenyuluoyan','chirongoroundtc','dmsans'].map((fontId,i)=>({...c,id:crypto.randomUUID(),fontId,start:i*30,duration:30,text:i===2?'Create your story.':'把日常，剪成故事。',fontSize:100,karaoke:{...c.karaoke,enabled:i===1,words:i===1?[{text:'把日常，剪成故事。',start:0,end:30}]:[]}}));return(await fetch('/api/exports',{method:'POST',headers:{'Content-Type':'application/json','X-MyCut':'1'},body:JSON.stringify({project:p,settings:{resolution:720,quality:'standard',encoder:'libx264'}})})).json();});
  assert.ok(result.id,JSON.stringify(result));let status;
  await expect.poll(async()=>{status=await page.evaluate(async id=>(await(await fetch('/api/exports')).json()).find(j=>j.id===id),result.id);return status.status;},{timeout:60000,intervals:[300,500,1000]}).toMatch(/completed|failed/);
  assert.equal(status.status,'completed',status.error);assert.equal(status.duration,3);
  const output=path.join(root,'exports',result.id,'output.mp4');assert.ok((await fs.stat(output)).size>1000);
  await page.getByRole('button',{name:'全部字型',exact:true}).click();await page.getByLabel('我的最愛：辰宇落雁體',{exact:true}).uncheck();await expect(page.locator('.font-default')).toContainText('思源黑體 TC');
  await page.getByRole('navigation').getByRole('button',{name:'字幕',exact:true}).click();await page.getByRole('button',{name:'新增字幕',exact:true}).click();await expect(page.locator('.font-picker')).toHaveAttribute('data-font-id','notosanstc');await page.getByText('已儲存至本機',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  const report={testedAt:new Date().toISOString(),version:JSON.parse(await fs.readFile('package.json','utf8')).version,platform:process.platform,arch:process.arch,packagedApp:!unpackaged,fontCount:40,allBrowserFontsLoaded:true,favoritesSurviveRestart:true,origins:[firstOrigin,secondOrigin],defaultRestoredAfterClearing:true,newProjectDefault:true,nativeExport:{duration:3,resolution:720,fonts:['chenyuluoyan','chirongoroundtc','dmsans'],ordinaryText:true,karaoke:true,output},root};
  await fs.writeFile(`docs/fonts-${process.platform}-${process.arch}${unpackaged?'-source':''}-test-result.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));await quit();
}finally{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}}
