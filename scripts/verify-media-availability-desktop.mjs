import { _electron as electron, expect } from '@playwright/test';
import { createCanvas } from '@napi-rs/canvas';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const version=JSON.parse(await fs.readFile('package.json','utf8')).version;
const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-availability-desktop-')),file=path.join(root,'restored.png');
await fs.writeFile(file,createCanvas(160,80).toBuffer('image/png'));
const env={...process.env,MYCUT_DATA_DIR:root};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:path.resolve(`release/${version}/mac/Reelume.app/Contents/MacOS/Reelume`),env,args:[`--user-data-dir=${path.join(root,'profile')}`],timeout:30000});
try{
 const page=await app.firstWindow();expect((await page.evaluate(()=>window.reelume.appInfo())).version).toBe(version);
 await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
 await page.getByRole('button',{name:'從影片開始',exact:true}).click();
 const card=page.locator('.media-card').filter({hasText:'restored.png'});await expect(card).toBeVisible({timeout:30000});
 const list=()=>page.evaluate(async()=>(await fetch('/api/media')).json());const id=(await list())[0].id;
 await fs.rename(file,file+'.moved');await expect(card).toHaveClass(/missing/,{timeout:15000});
 await card.getByRole('button',{name:'加入 restored.png',exact:true}).click();await expect(page.locator('.toast.error')).toContainText('重新連結');
 await fs.rename(file+'.moved',file);await page.getByRole('button',{name:'匯入素材',exact:true}).click();
 await expect(card).not.toHaveClass(/missing/,{timeout:15000});expect((await list()).map(m=>m.id)).toEqual([id]);
 await card.getByRole('button',{name:'加入 restored.png',exact:true}).click();await expect(page.locator('.timeline-clip')).toHaveCount(2);
 await fs.rename(file,file+'.moved');await expect(card).toHaveClass(/missing/,{timeout:15000});await fs.rename(file+'.moved',file);await expect(card).not.toHaveClass(/missing/,{timeout:15000});
 await expect(page.locator('.save-state')).toHaveText('已儲存至本機');await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await expect(page.getByRole('heading',{name:'我的專案'})).toBeVisible();
 const result={version,packaged:true,reimportSameId:'passed',restoreWhileRunning:'passed',addToTimeline:'passed',missingSourceBlocked:'passed',isolatedData:root};await fs.writeFile('docs/media-availability-desktop-test-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}catch(error){console.error(error);throw error;}finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}
