import { expect, type Page } from '@playwright/test';
import { makeClip, newProject, type Project } from '../../shared/model';

export async function checkTimelineWheelZoom(page:Page,modifier:'Meta'|'Alt'){
  const url=(pathname:string)=>new URL(pathname,page.url()).href;
  const p=newProject();p.name=`滾輪縮放 ${p.id.slice(0,8)}`;
  p.clips=[makeClip({kind:'shape',trackId:'main',start:0,duration:p.fps*300,name:'長片段'})];
  for(let i=0;i<10;i++){
    const trackId=`wheel-text-${i}`;p.tracks.push({id:trackId,name:`文字 ${i+1}`,kind:'text',manualTextLane:true,locked:false,hidden:false,muted:false});
    p.clips.push(makeClip({kind:'text',trackId,start:0,duration:60,text:`字幕 ${i+1}`}));
  }
  expect((await page.request.put(url(`/api/projects/${p.id}`),{headers:{'X-MyCut':'1'},data:p})).ok()).toBeTruthy();
  await page.goto(url('/'));await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();
  const scroll=page.locator('.timeline-scroll'),body=page.locator('.timeline-body'),slider=page.getByRole('slider',{name:'時間軸縮放',exact:true});
  await expect(slider).toHaveAttribute('data-tooltip',`${modifier==='Meta'?'Command':'Alt'}＋滑鼠滾輪縮放`);
  const read=()=>scroll.evaluate(el=>({left:el.scrollLeft,zoom:el.querySelector<HTMLElement>('.timeline-content')!.getBoundingClientRect().width/310,top:el.parentElement!.scrollTop}));
  const wheel=async(deltaY:number,key:string=modifier)=>{await page.keyboard.down(key);try{await page.mouse.wheel(0,deltaY);}finally{await page.keyboard.up(key);}};
  for(const selector of ['.clip-shape','.time-ruler','[data-track="music"]','.timeline-toolbar','.track-title','.timeline-footer']){
    await body.evaluate(el=>el.scrollTop=0);await scroll.evaluate(el=>el.scrollLeft=1500);
    const view=(await scroll.boundingBox())!,target=(await page.locator(selector).first().boundingBox())!;
    const x=selector==='.track-title'?target.x+target.width/2:view.x+view.width*.45,y=target.y+target.height/2;
    await page.mouse.move(x,y);const before=await read(),offset=Math.max(0,Math.min(view.width,x-view.x)),seconds=(before.left+offset)/before.zoom;
    await wheel(-100,selector==='.timeline-toolbar'?`${modifier}Right`:modifier);await expect.poll(async()=>(await read()).zoom, {message:`${modifier} wheel should zoom over ${selector}`}).toBeGreaterThan(before.zoom+1);
    const enlarged=await read();expect(enlarged.top).toBe(before.top);expect(Math.abs((enlarged.left+offset)/enlarged.zoom-seconds)).toBeLessThan(.03);
    expect(Math.abs(Number(await slider.inputValue())-Math.log(enlarged.zoom))).toBeLessThan(.026);
    await wheel(100);await expect.poll(async()=>(await read()).zoom).toBeLessThan(enlarged.zoom-1);
    const restored=await read();expect(Math.abs(restored.zoom-before.zoom)).toBeLessThan(.01);expect(Math.abs(restored.left-before.left)).toBeLessThanOrEqual(2);
    expect(Math.abs(Number(await slider.inputValue())-Math.log(restored.zoom))).toBeLessThan(.026);
  }
  // Toolbar controls and the wheel share the same scale for clip widths.
  await body.evaluate(el=>el.scrollTop=0);await scroll.evaluate(el=>el.scrollLeft=0);
  const shortClip=page.locator('[data-track="wheel-text-0"] .clip-text'),clipWidth=async()=>(await shortClip.boundingBox())!.width;
  const originalWidth=await clipWidth();await page.getByRole('button',{name:'放大時間軸',exact:true}).click();
  await expect.poll(clipWidth).toBeCloseTo(originalWidth*1.5,1);await page.getByRole('button',{name:'縮小時間軸',exact:true}).click();await expect.poll(clipWidth).toBeCloseTo(originalWidth,1);
  await page.locator('.track-header-ruler').hover();await wheel(-100);await expect.poll(clipWidth).toBeGreaterThan(originalWidth+1);
  await wheel(100);await expect.poll(clipWidth).toBeCloseTo(originalWidth,1);
  // Releasing the modifier restores ordinary scrolling without changing the zoom.
  await body.evaluate(el=>el.scrollTop=0);const view=(await scroll.boundingBox())!;await page.mouse.move(view.x+view.width/2,view.y+60);
  const before=await read();await page.mouse.wheel(120,0);await expect.poll(async()=>(await read()).left).toBeGreaterThan(before.left+50);expect((await read()).zoom).toBe(before.zoom);
  await page.mouse.wheel(0,120);await expect.poll(()=>body.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);expect((await read()).zoom).toBe(before.zoom);
  // Option no longer zooms on Mac; Windows still uses Alt, not Meta.
  await wheel(-100,modifier==='Meta'?'Alt':'Meta');await page.mouse.wheel(0,0);expect((await read()).zoom).toBe(before.zoom);
  // The shortcut is scoped to the timeline and does not alter the project data.
  await page.locator('.library-panel').hover();await wheel(-100);await page.mouse.wheel(0,0);expect((await read()).zoom).toBe(before.zoom);
  await expect(page.getByText('已儲存至本機',{exact:true})).toBeVisible();
  const saved=await(await page.request.get(url(`/api/projects/${p.id}`))).json() as Project;expect(saved.clips).toEqual(p.clips);
}

export async function checkTimelineWheelRecovery(page:Page,scenario:'modifier'|'axis'|'interrupted-gesture',modifier:'Meta'|'Alt'){
  const url=(pathname:string)=>new URL(pathname,page.url()).href;
  const p=newProject();p.name=`滾輪相容性 ${scenario} ${p.id.slice(0,8)}`;
  p.clips=[makeClip({kind:'shape',trackId:'main',start:0,duration:p.fps*300,name:'長片段'})];
  expect((await page.request.put(url(`/api/projects/${p.id}`),{headers:{'X-MyCut':'1'},data:p})).ok()).toBeTruthy();
  await page.goto(url('/'));await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();
  const ruler=page.locator('.time-ruler'),read=()=>page.locator('.timeline-content').evaluate(el=>el.getBoundingClientRect().width/310);
  const dispatch=(init:Pick<WheelEventInit,'deltaX'|'deltaY'|'deltaMode'|'altKey'|'metaKey'>)=>ruler.evaluate((el,init)=>{
    const rect=el.getBoundingClientRect();const event=new WheelEvent('wheel',{bubbles:true,cancelable:true,clientX:rect.left+300,clientY:rect.top+10,...init});
    el.dispatchEvent(event);return event.defaultPrevented;
  },init);
  if(scenario==='modifier'){
    // Some input sources send the key separately from wheel events. Cover both modifier keys.
    for(const key of [modifier,`${modifier}Right`]){
      const before=await read();await page.keyboard.down(key);
      try{expect(await dispatch({deltaY:-100})).toBe(true);await expect.poll(read).toBeGreaterThan(before+1);}
      finally{await page.keyboard.up(key);}
      const after=await read();expect(await dispatch({deltaY:-100})).toBe(false);expect(await read()).toBe(after);
    }
    await page.keyboard.down(modifier);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    const before=await read();expect(await dispatch({deltaY:-100})).toBe(false);expect(await read()).toBe(before);await page.keyboard.up(modifier);
  }else if(scenario==='axis'){
    await ruler.hover();const before=await read();await page.keyboard.down(modifier);
    try{
      await page.mouse.wheel(-100,0);await expect.poll(read).toBeGreaterThan(before+1);
      await page.mouse.wheel(100,0);await expect.poll(read).toBeCloseTo(before,2);
    }finally{await page.keyboard.up(modifier);}
  }else{
    // Losing focus can omit pointerup; an interrupted seek/selection must not block zoom.
    const heldModifier=modifier==='Meta'?{metaKey:true}:{altKey:true};
    for(const selector of ['.time-ruler','[data-track="music"]']){
      const box=(await page.locator(selector).boundingBox())!;await page.mouse.move(box.x+200,box.y+10);await page.mouse.down();
      try{
        const before=await read();await dispatch({deltaY:-100,...heldModifier});expect(await read()).toBe(before);
        await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
        await dispatch({deltaY:-100,...heldModifier});await expect.poll(read).toBeGreaterThan(before+1);
        await expect(page.locator('.timeline-marquee')).toHaveCount(0);
      }finally{await page.mouse.up();}
    }
  }
  await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();
  await expect(page.locator('.project-home')).toBeVisible();
  const saved=await(await page.request.get(url(`/api/projects/${p.id}`))).json() as Project;expect(saved.clips).toEqual(p.clips);
}
