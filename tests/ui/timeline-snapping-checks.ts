import { expect, type Page } from '@playwright/test';
import { makeClip, newProject, uid, type Project } from '../../shared/model';

const url=(page:Page,pathname:string)=>new URL(pathname,page.url()).href;
async function open(page:Page,p:Project){
  expect((await page.request.put(url(page,`/api/projects/${p.id}`),{headers:{'X-MyCut':'1'},data:p})).ok()).toBeTruthy();
  await page.goto(url(page,'/'));await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();
}
async function read(page:Page,p:Project){
  await expect(page.getByText('已儲存至本機',{exact:true})).toBeVisible();
  return await(await page.request.get(url(page,`/api/projects/${p.id}`))).json() as Project;
}

export async function checkTrimSnapping(page:Page,position:'above'|'below',edge:'left'|'right'){
  const p=newProject();p.name=`修剪磁吸 ${position} ${edge}`;
  p.tracks.splice(position==='above'?1:2,0,{...p.tracks[1],id:'reference',name:'對齊參考'});
  const target=edge==='left'?120:300;
  p.clips=[makeClip({kind:'shape',trackId:'main',start:180,duration:60,name:'修剪片段'}),makeClip({kind:'shape',trackId:'reference',start:edge==='left'?60:target,duration:60,name:'上下參考'})];
  await open(page,p);
  const clip=page.locator('[data-track="main"] .timeline-clip'),handle=clip.locator(`.trim-handle.${edge}`),guide=page.locator('.timeline-snap-guide');
  const pxFrame=55/p.fps,delta=edge==='left'?-60:60;
  const box=(await handle.boundingBox())!,x=box.x+box.width/2,y=box.y+box.height/2,targetX=x+delta*pxFrame;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(targetX+4,y);
  await expect(guide).toHaveCount(1);expect(await guide.evaluate(el=>parseFloat(el.style.left))).toBe(target*pxFrame);
  await page.mouse.move(targetX+18,y);await expect(guide).toHaveCount(0);
  await page.mouse.move(targetX+4,y);await expect(guide).toHaveCount(1);await page.mouse.up();await expect(guide).toHaveCount(0);
  const saved=await read(page,p),trimmed=saved.clips[0];
  expect(edge==='left'?trimmed.start:trimmed.start+trimmed.duration).toBe(target);
  expect(edge==='left'?trimmed.start+trimmed.duration:trimmed.start).toBe(edge==='left'?240:180);
  expect(saved.clips[1]).toEqual(p.clips[1]);
  await page.getByRole('button',{name:/^復原/}).click();expect((await read(page,p)).clips).toEqual(p.clips);
  await page.getByRole('button',{name:/^重做/}).click();expect((await read(page,p)).clips).toEqual(saved.clips);
  await page.getByRole('button',{name:/^復原/}).click();await read(page,p);
  await page.getByRole('button',{name:'磁吸對齊',exact:true}).click();
  const free=(await handle.boundingBox())!;await page.mouse.move(free.x+free.width/2,free.y+free.height/2);await page.mouse.down();
  await page.mouse.move(free.x+free.width/2+delta*pxFrame+4,free.y+free.height/2);await expect(guide).toHaveCount(0);await page.mouse.up();
  const unsnapped=(await read(page,p)).clips[0];
  expect(edge==='left'?unsnapped.start:unsnapped.start+unsnapped.duration).toBe(target+Math.round(4/pxFrame));
}

export async function checkGroupSnapping(page:Page){
  const p=newProject();p.name='多選片段磁吸';p.tracks.splice(1,0,{...p.tracks[1],id:'reference',name:'對齊參考'});
  const groupId=uid();p.clips=[makeClip({kind:'shape',trackId:'main',start:30,duration:30,name:'抓住這段',groupId}),makeClip({kind:'shape',trackId:'main',start:90,duration:45,name:'這段尾端對齊',groupId}),makeClip({kind:'shape',trackId:'reference',start:210,duration:90,name:'上下參考'})];
  await open(page,p);
  const moving=page.getByRole('button',{name:'抓住這段，00:00:01:00',exact:true}),box=(await moving.boundingBox())!;
  const x=box.x+box.width/2,y=box.y+box.height/2,guide=page.locator('.timeline-snap-guide');
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+75*55/p.fps+4,y);
  await expect(guide).toHaveCount(1);expect(await guide.evaluate(el=>parseFloat(el.style.left))).toBe(210*55/p.fps);
  await page.mouse.up();const saved=await read(page,p);
  expect(saved.clips.slice(0,2).map(c=>[c.start,c.duration])).toEqual([[105,30],[165,45]]);expect(saved.clips[2]).toEqual(p.clips[2]);
  await page.getByRole('button',{name:/^復原/}).click();expect((await read(page,p)).clips).toEqual(p.clips);
}
