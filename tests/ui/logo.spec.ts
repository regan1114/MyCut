import { test, expect } from '@playwright/test';
import { createCanvas } from '@napi-rs/canvas';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Project } from '../../shared/model';

test('logo import, corners, custom placement and reuse survive reopen',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'開啟示範專案',exact:true}).click();await expect(page.locator('.project-switch')).toBeVisible({timeout:30000});
 await page.getByRole('navigation').getByRole('button',{name:'Logo',exact:true}).click();
 const canvas=createCanvas(160,80),ctx=canvas.getContext('2d');ctx.fillStyle='#ff4422';ctx.fillRect(20,10,120,60);const bytes=canvas.toBuffer('image/png');
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'匯入 Logo',exact:true}).click();await(await chooser).setFiles({name:'品牌 Logo.png',mimeType:'image/png',buffer:bytes});
 await expect(page.getByRole('button',{name:'選擇 Logo 品牌 Logo.png',exact:true})).toBeVisible();
 const read=async()=>{await expect(page.locator('.save-state')).toHaveText('已儲存至本機');const list=await(await page.request.get('/api/projects')).json();const project=list.find((p:any)=>p.name==='山間，慢一點');return await(await page.request.get(`/api/projects/${project.id}`)).json() as Project;};
 await expect.poll(async()=>(await read()).logoMediaIds.length).toBe(1);
 let saved=await read();const projectId=saved.id;expect(saved.logoMediaIds).toHaveLength(1);
 const health=await(await page.request.get('/api/health')).json(),library=JSON.parse(await fs.readFile(path.join(health.root,'library.json'),'utf8')),logo=library.find((m:any)=>m.id===saved.logoMediaIds[0]);expect(path.dirname(logo.path)).toBe(path.join(health.root,'projects',projectId,'logos'));expect(await fs.readFile(logo.path)).toEqual(bytes);
 await page.getByRole('button',{name:'左上',exact:true}).click();await page.getByRole('button',{name:'加入影片',exact:true}).click();saved=await read();let clip=saved.clips.find(c=>c.logo)!;expect(clip.x).toBeLessThan(0);expect(clip.y).toBeLessThan(0);expect(clip.duration).toBe(360);expect(saved.tracks[0].id).toBe(clip.trackId);
 for(const [label,x,y] of [['右上',1,-1],['左下',-1,1],['右下',1,1]] as const){await page.getByRole('button',{name:label,exact:true}).click();saved=await read();clip=saved.clips.find(c=>c.logo)!;expect(Math.sign(clip.x)).toBe(x);expect(Math.sign(clip.y)).toBe(y);}
 await page.getByRole('button',{name:'自訂',exact:true}).click();await page.getByLabel('Logo 位置 X',{exact:true}).fill('120');await page.getByLabel('Logo 位置 Y',{exact:true}).fill('-90');saved=await read();clip=saved.clips.find(c=>c.logo)!;expect(clip.x).toBeCloseTo(120/1920);expect(clip.y).toBeCloseTo(-90/1080);
 await page.getByLabel('Logo 大小',{exact:true}).fill('20');saved=await read();expect(saved.clips.find(c=>c.logo)!.scale).toBe(.2);
 await page.screenshot({path:'test-results/logo-custom.png',fullPage:true});
 await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await expect(page.getByRole('heading',{name:'我的專案'})).toBeVisible();await page.reload();await page.getByRole('button',{name:'開啟 山間，慢一點',exact:true}).click();await page.getByRole('navigation').getByRole('button',{name:'Logo',exact:true}).click();await expect(page.getByRole('button',{name:'選擇 Logo 品牌 Logo.png',exact:true})).toBeVisible();
 expect((await read()).clips.find(c=>c.logo)!.x).toBeCloseTo(120/1920);
});
