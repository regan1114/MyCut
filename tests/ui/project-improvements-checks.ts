import { expect, type Page } from '@playwright/test';
import { makeClip, newProject, type Project } from '../../shared/model';

const url=(page:Page,pathname:string)=>new URL(pathname,page.url()).href;
const read=async(page:Page,id:string)=>{await expect(page.getByText('已儲存至本機',{exact:true})).toBeVisible();return await(await page.request.get(url(page,`/api/projects/${id}`))).json() as Project;};
const open=async(page:Page,p:Project)=>{expect((await page.request.put(url(page,`/api/projects/${p.id}`),{headers:{'X-MyCut':'1'},data:p})).ok()).toBeTruthy();await page.goto(url(page,'/'));await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();};

export async function checkSnapshots(page:Page){
 const p=newProject();p.name=`快照 ${p.id.slice(0,8)}`;p.clips=[makeClip({kind:'text',trackId:'text',start:0,duration:90,text:'快照內容'})];await open(page,p);
 await page.locator('.project-switch').click();const manager=page.getByRole('dialog',{name:'專案管理',exact:true});await manager.getByLabel('專案名稱',{exact:true}).fill(p.name+' 已編輯');await manager.getByRole('button',{name:'專案快照',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'專案快照',exact:true});await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'建立快照',exact:true}).click();await expect(dialog.locator('.snapshot-list>button').first()).toContainText('手動');await expect(dialog.locator('.snapshot-list>button').first()).toContainText(p.name+' 已編輯');
 await page.screenshot({path:'test-results/project-snapshots.png',fullPage:true});
 await dialog.getByRole('button',{name:'關閉快照',exact:true}).click();await page.locator('.clip-text').click();await page.getByLabel('文字內容',{exact:true}).fill('目前內容保留');await read(page,p.id);
 await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await page.getByRole('button',{name:`專案快照 ${p.name} 已編輯`,exact:true}).click();await expect(dialog.locator('.snapshot-list>button').first()).toContainText('手動');await dialog.getByRole('button',{name:'還原為新專案',exact:true}).click();
 await expect(page.locator('.project-switch')).toContainText(p.name+' 已編輯 · 還原');await expect(page.locator('.clip-text')).toContainText('快照內容');expect((await read(page,p.id)).clips[0].text).toBe('目前內容保留');
 const summaries=await(await page.request.get(url(page,'/api/projects'))).json();const restored=summaries.find((r:Project)=>r.name===p.name+' 已編輯 · 還原');expect(restored.id).not.toBe(p.id);expect((await read(page,restored.id)).clips[0].text).toBe('快照內容');
 await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await expect(page.locator('.project-home')).toBeVisible();await page.reload();await expect(page.getByRole('button',{name:`開啟 ${p.name} 已編輯`,exact:true})).toBeVisible();await expect(page.getByRole('button',{name:`開啟 ${p.name} 已編輯 · 還原`,exact:true})).toBeVisible();
}

export async function checkEdgeScroll(page:Page,mode:'move'|'left'|'right',stop:'up'|'blur'='up'){
 const p=newProject();p.name=`邊緣捲動 ${mode} ${p.id.slice(0,8)}`;const start=mode==='left'?900:60,duration=mode==='left'?900:120;p.clips=[makeClip({kind:'shape',trackId:'main',start,duration,name:'操作片段'}),makeClip({kind:'shape',trackId:'main',start:6000,duration:90,name:'長片尾'})];await open(page,p);
 await page.getByRole('button',{name:'磁吸對齊',exact:true}).click();const scroll=page.locator('.timeline-scroll'),clip=page.locator('.clip-shape').first();if(mode==='left')await scroll.evaluate(el=>el.scrollLeft=1400);
 const viewport=(await scroll.boundingBox())!,initialScroll=await scroll.evaluate(el=>el.scrollLeft),target=mode==='move'?clip:clip.locator(`.trim-handle.${mode}`),box=(await target.boundingBox())!,x=box.x+box.width/2,y=box.y+box.height/2,targetX=mode==='left'?viewport.x+4:viewport.x+viewport.width-5;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(targetX,y,{steps:10});
 const current=()=>scroll.evaluate(el=>el.scrollLeft);await expect.poll(async()=>Math.abs(await current()-initialScroll)).toBeGreaterThan(70);const during=await current();await expect.poll(async()=>Math.abs(await current()-during)).toBeGreaterThan(70);
 if(stop==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();const finalScroll=await current();await page.waitForTimeout(150);expect(await current()).toBe(finalScroll);
 const saved=await read(page,p.id),actual=saved.clips.find(c=>c.id===p.clips[0].id)!,delta=Math.round((targetX-x+finalScroll-initialScroll)/55*p.fps);
 expect(Math.abs((mode==='right'?actual.duration-duration:actual.start-start)-delta)).toBeLessThanOrEqual(1);if(mode==='left')expect(actual.start+actual.duration).toBe(start+duration);
 await page.getByRole('button',{name:/^復原/}).click();expect((await read(page,p.id)).clips).toEqual(p.clips);await page.getByRole('button',{name:/^重做/}).click();expect((await read(page,p.id)).clips).toEqual(saved.clips);
 await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await expect(page.locator('.project-home')).toBeVisible();
}

export async function checkFitSelection(page:Page){
 const p=newProject();p.name=`選取縮放 ${p.id.slice(0,8)}`;p.clips=[makeClip({kind:'shape',trackId:'main',start:240,duration:120}),makeClip({kind:'shape',trackId:'main',start:540,duration:120})];await open(page,p);
 const fit=page.getByRole('button',{name:'符合選取片段',exact:true}),clips=page.locator('.clip-shape');await expect(fit).toBeDisabled();await clips.nth(0).click();await clips.nth(1).click({modifiers:['Shift']});await fit.click();
 const metrics=()=>page.locator('.timeline-scroll').evaluate(el=>{const view=el.getBoundingClientRect(),clips=el.querySelectorAll('.clip-shape');return {left:clips[0].getBoundingClientRect().left-view.left,right:view.right-clips[1].getBoundingClientRect().right,scroll:el.scrollLeft};});
 await expect.poll(async()=>(await metrics()).left).toBeCloseTo(40,0);expect((await metrics()).right).toBeCloseTo(40,0);const before=await metrics();await fit.click();expect(await metrics()).toEqual(before);expect((await read(page,p.id)).clips).toEqual(p.clips);await page.screenshot({path:'test-results/fit-selection.png',fullPage:true});
 await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await expect(page.locator('.project-home')).toBeVisible();
}
