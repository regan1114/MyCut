import { expect, type Page } from '@playwright/test';
import { makeClip, newProject, type Project } from '../../shared/model';

export async function checkTimelineWheelZoom(page:Page){
  const url=(pathname:string)=>new URL(pathname,page.url()).href;
  const p=newProject();p.name='Option 滾輪縮放';
  p.clips=[makeClip({kind:'shape',trackId:'main',start:0,duration:p.fps*300,name:'長片段'})];
  for(let i=0;i<10;i++){
    const trackId=`wheel-text-${i}`;p.tracks.push({id:trackId,name:`文字 ${i+1}`,kind:'text',manualTextLane:true,locked:false,hidden:false,muted:false});
    p.clips.push(makeClip({kind:'text',trackId,start:0,duration:60,text:`字幕 ${i+1}`}));
  }
  expect((await page.request.put(url(`/api/projects/${p.id}`),{headers:{'X-MyCut':'1'},data:p})).ok()).toBeTruthy();
  await page.goto(url('/'));await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();
  const scroll=page.locator('.timeline-scroll'),body=page.locator('.timeline-body');
  const read=()=>scroll.evaluate(el=>({left:el.scrollLeft,zoom:el.querySelector<HTMLElement>('.timeline-content')!.getBoundingClientRect().width/310,top:el.parentElement!.scrollTop}));
  const wheel=async(deltaY:number,modifier='Alt')=>{await page.keyboard.down(modifier);try{await page.mouse.wheel(0,deltaY);}finally{await page.keyboard.up(modifier);}};
  for(const selector of ['.clip-shape','.time-ruler','[data-track="music"]','.timeline-toolbar','.track-title','.timeline-footer']){
    await body.evaluate(el=>el.scrollTop=0);await scroll.evaluate(el=>el.scrollLeft=1500);
    const view=(await scroll.boundingBox())!,target=(await page.locator(selector).first().boundingBox())!;
    const x=selector==='.track-title'?target.x+target.width/2:view.x+view.width*.45,y=target.y+target.height/2;
    await page.mouse.move(x,y);const before=await read(),offset=Math.max(0,Math.min(view.width,x-view.x)),seconds=(before.left+offset)/before.zoom;
    await wheel(-100,selector==='.timeline-toolbar'?'AltRight':'Alt');await expect.poll(async()=>(await read()).zoom, {message:`Option wheel should zoom over ${selector}`}).toBeGreaterThan(before.zoom+1);
    const enlarged=await read();expect(enlarged.top).toBe(before.top);expect(Math.abs((enlarged.left+offset)/enlarged.zoom-seconds)).toBeLessThan(.03);
    await wheel(100);await expect.poll(async()=>(await read()).zoom).toBeLessThan(enlarged.zoom-1);
    const restored=await read();expect(Math.abs(restored.zoom-before.zoom)).toBeLessThan(.01);expect(Math.abs(restored.left-before.left)).toBeLessThanOrEqual(2);
  }
  // Releasing Option restores ordinary scrolling without changing the zoom.
  await body.evaluate(el=>el.scrollTop=0);const view=(await scroll.boundingBox())!;await page.mouse.move(view.x+view.width/2,view.y+60);
  const before=await read();await page.mouse.wheel(120,0);await expect.poll(async()=>(await read()).left).toBeGreaterThan(before.left+50);expect((await read()).zoom).toBe(before.zoom);
  await page.mouse.wheel(0,120);await expect.poll(()=>body.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);expect((await read()).zoom).toBe(before.zoom);
  // The shortcut is scoped to the timeline and does not alter the project data.
  await page.locator('.library-panel').hover();await wheel(-100);await page.mouse.wheel(0,0);expect((await read()).zoom).toBe(before.zoom);
  await expect(page.getByText('已儲存至本機',{exact:true})).toBeVisible();
  const saved=await(await page.request.get(url(`/api/projects/${p.id}`))).json() as Project;expect(saved.clips).toEqual(p.clips);
}
