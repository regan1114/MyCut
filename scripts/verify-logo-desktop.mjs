import { _electron as electron, expect } from '@playwright/test';
import { createCanvas } from '@napi-rs/canvas';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const version=JSON.parse(await fs.readFile('package.json','utf8')).version;
const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-logo-desktop-'));
const env={...process.env,MYCUT_DATA_DIR:root};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:process.env.MYCUT_TEST_APP??path.resolve(`release/${version}/mac/Reelume.app/Contents/MacOS/Reelume`),env,args:[`--user-data-dir=${path.join(root,'profile')}`],timeout:30000});
try{
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 expect((await page.evaluate(()=>window.reelume.appInfo())).version).toBe(version);
 await page.getByRole('button',{name:'開啟示範專案',exact:true}).click();
 await expect(page.locator('.project-switch')).toBeVisible({timeout:30000});
 await page.getByRole('navigation').getByRole('button',{name:'Logo',exact:true}).click();
 const canvas=createCanvas(160,80),ctx=canvas.getContext('2d');ctx.fillStyle='#ff4422';ctx.fillRect(20,10,120,60);const bytes=canvas.toBuffer('image/png');
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'匯入 Logo',exact:true}).click();await(await chooser).setFiles({name:'品牌 Logo.png',mimeType:'image/png',buffer:bytes});
 await expect(page.getByRole('button',{name:'選擇 Logo 品牌 Logo.png',exact:true})).toBeVisible();
 const read=async()=>{await expect(page.locator('.save-state')).toHaveText('已儲存至本機');return page.evaluate(async()=>{const list=await(await fetch('/api/projects')).json();return(await fetch(`/api/projects/${list.find(p=>p.name==='山間，慢一點').id}`)).json();});};
 await expect.poll(async()=>(await read()).logoMediaIds.length).toBe(1);
 let saved=await read();const library=JSON.parse(await fs.readFile(path.join(root,'library.json'),'utf8')),logo=library.find(m=>m.id===saved.logoMediaIds[0]);
 expect(path.dirname(logo.path)).toBe(path.join(root,'projects',saved.id,'logos'));expect(await fs.readFile(logo.path)).toEqual(bytes);
 await page.getByRole('button',{name:'左上',exact:true}).click();await page.getByRole('button',{name:'加入影片',exact:true}).click();
 for(const [label,x,y] of [['左上',-1,-1],['右上',1,-1],['左下',-1,1],['右下',1,1]]){await page.getByRole('button',{name:label,exact:true}).click();saved=await read();const clip=saved.clips.find(c=>c.logo);expect(Math.sign(clip.x)).toBe(x);expect(Math.sign(clip.y)).toBe(y);}
 await page.getByRole('button',{name:'自訂',exact:true}).click();await page.getByLabel('Logo 位置 X',{exact:true}).fill('120');await page.getByLabel('Logo 位置 Y',{exact:true}).fill('-90');saved=await read();expect(saved.clips.find(c=>c.logo).x).toBeCloseTo(120/1920);
 await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await expect(page.getByRole('heading',{name:'我的專案'})).toBeVisible();await page.reload();await page.getByRole('button',{name:'開啟 山間，慢一點',exact:true}).click();await page.getByRole('navigation').getByRole('button',{name:'Logo',exact:true}).click();await expect(page.getByRole('button',{name:'選擇 Logo 品牌 Logo.png',exact:true})).toBeVisible();
 expect((await read()).clips.find(c=>c.logo).y).toBeCloseTo(-90/1080);expect(errors).toEqual([]);
 await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await expect(page.getByRole('heading',{name:'我的專案'})).toBeVisible();
 const result={version,packaged:true,platform:process.platform,arch:process.arch,logoImport:'passed',ownedProjectFolder:'passed',corners:'passed',customPosition:'passed',reopen:'passed',isolatedData:root};
 await fs.writeFile('docs/logo-desktop-test-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}catch(error){console.error(error);await(await app.firstWindow()).screenshot({path:'test-results/logo-desktop-failure.png'}).catch(()=>{});throw error;}finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
