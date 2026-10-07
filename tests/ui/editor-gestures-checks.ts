import { expect, type Page } from '@playwright/test';
import { createCanvas } from '@napi-rs/canvas';
import { makeClip, newProject, type Project } from '../../shared/model';

export async function checkPreviewDrag(page:Page,animated=false,screenshot=true){
  const url=(pathname:string)=>new URL(pathname,page.url()).href;
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const image=createCanvas(160,100),ctx=image.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(20,10,120,80);
  const upload=await page.request.post(url('/api/media/upload'),{headers:{'X-MyCut':'1'},multipart:{file:{name:'logo.png',mimeType:'image/png',buffer:await image.encode('png')}}});expect(upload.ok()).toBeTruthy();
  const mediaId=(await upload.json()).imported[0];ctx.fillStyle='#16324b';ctx.fillRect(0,0,160,100);
  const backdrop=await page.request.post(url('/api/media/upload'),{headers:{'X-MyCut':'1'},multipart:{file:{name:'background.png',mimeType:'image/png',buffer:await image.encode('png')}}});expect(backdrop.ok()).toBeTruthy();
  const backgroundId=(await backdrop.json()).imported[0],p=newProject();p.name=`Logo 拖曳 ${animated?'動畫':'靜態'}`;
  p.tracks.unshift({...p.tracks[1],id:'logo'});
  const logo=makeClip({kind:'image',mediaId,trackId:'logo',start:0,duration:90,name:'Logo',scale:.25,rotation:15,fit:'contain',keyframes:animated?[{frame:0,x:0,y:0,scale:.25,opacity:1},{frame:90,x:.2,y:0,scale:.25,opacity:1}]:[]});
  const background=makeClip({kind:'image',mediaId:backgroundId,trackId:'main',start:0,duration:90,name:'背景',fit:'cover'});p.clips=[background,logo];
  await page.request.put(url(`/api/projects/${p.id}`),{headers:{'X-MyCut':'1'},data:p});await page.goto(url('/'));await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();
  const canvas=page.getByLabel('影片預覽，可拖曳影片或圖片調整位置'),box=(await canvas.boundingBox())!,x=box.x+box.width/2,y=box.y+box.height/2,dx=Math.round(box.width*.24),dy=Math.round(box.height*.22);
  const center=()=>canvas.evaluate((el:HTMLCanvasElement)=>Array.from(el.getContext('2d')!.getImageData(el.width/2,el.height/2,1,1).data).slice(0,3));
  await expect.poll(center).toEqual([255,0,0]);
  await page.mouse.move(x,y);await expect(canvas).toHaveCSS('cursor','grab');await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:8});
  await page.evaluate(()=>{window.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,buttons:0,clientX:0,clientY:0}));window.dispatchEvent(new PointerEvent('pointermove',{pointerId:2,buttons:1,clientX:0,clientY:0}));});
  await page.mouse.up();
  await expect(page.locator('[data-track="logo"] .timeline-clip')).toHaveClass(/selected/);
  const read=async()=>{await expect(page.getByText('已儲存至本機',{exact:true})).toBeVisible();return await(await page.request.get(url(`/api/projects/${p.id}`))).json() as Project;};
  await expect.poll(center).toEqual([22,50,75]);
  const saved=await read(),moved=saved.clips.find(c=>c.id===logo.id)!;
  expect(moved.x).toBeCloseTo(dx/box.width,4);expect(moved.y).toBeCloseTo(dy/box.height,4);expect(saved.clips.find(c=>c.id===background.id)).toEqual(background);
  if(animated){expect(moved.keyframes[0].x).toBeCloseTo(dx/box.width,4);expect(moved.keyframes[0].y).toBeCloseTo(dy/box.height,4);expect(moved.keyframes[1]).toEqual(logo.keyframes[1]);}
  await page.getByRole('button',{name:/^復原/}).click();expect((await read()).clips).toEqual(p.clips);
  await page.getByRole('button',{name:/^重做/}).click();expect((await read()).clips).toEqual(saved.clips);
  await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await page.locator('.project-home').waitFor();await page.reload();await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();expect((await read()).clips).toEqual(saved.clips);
  await canvas.click({position:{x:box.width/2+dx,y:box.height/2+dy}});
  if(screenshot)await page.screenshot({path:`test-results/preview-logo-drag-${animated?'animated':'static'}.png`,fullPage:true});
  await page.locator('.track-header').first().getByRole('button',{name:'鎖定軌道',exact:true}).click();
  await page.mouse.move(x+dx,y+dy);await expect(canvas).toHaveCSS('cursor','not-allowed');await page.mouse.down();await page.mouse.move(x+dx+30,y+dy+20,{steps:4});await page.mouse.up();expect((await read()).clips).toEqual(saved.clips);
  expect(errors).toEqual([]);
}

export async function checkEmptyTrackCleanup(page:Page,screenshot=true){
  const url=(pathname:string)=>new URL(pathname,page.url()).href,p=newProject();p.name='舊專案空軌道清理';
  p.clips=[makeClip({kind:'text',trackId:'text',start:0,duration:30,text:'保留字幕'}),makeClip({kind:'text',trackId:'manual-used',start:60,duration:60,text:'移回主軌'})];
  p.tracks.unshift({...p.tracks[0],id:'empty-manual',manualTextLane:true,textStyle:{fontSize:80}}, {...p.tracks[1],id:'empty-video'}, {...p.tracks[2],id:'empty-audio'}, {...p.tracks[0],id:'manual-used',manualTextLane:true});
  expect((await page.request.put(url(`/api/projects/${p.id}`),{headers:{'X-MyCut':'1'},data:p})).ok()).toBeTruthy();
  await page.goto(url('/'));await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();
  const lanes=page.locator('.track-lane'),moving=page.locator('.clip-text').filter({hasText:'移回主軌'});
  await expect(lanes).toHaveCount(4);
  const read=async()=>{await expect(page.getByText('已儲存至本機',{exact:true})).toBeVisible();return await(await page.request.get(url(`/api/projects/${p.id}`))).json() as Project;};
  const cleaned=await read();expect(cleaned.clips).toEqual(p.clips);expect(cleaned.tracks.map(t=>t.id)).toEqual(['manual-used','text','main','music']);
  const box=(await moving.boundingBox())!,target=(await page.locator('[data-track="text"]').boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,target.y+target.height/2,{steps:8});
  await page.evaluate(()=>{window.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,buttons:0,clientX:0,clientY:0}));window.dispatchEvent(new PointerEvent('pointermove',{pointerId:2,buttons:1,clientX:0,clientY:0}));});
  await page.mouse.up();
  await expect(lanes).toHaveCount(3);expect((await read()).clips).toEqual(p.clips.map(c=>({...c,trackId:'text'})));
  await page.getByRole('button',{name:/^復原/}).click();await expect(lanes).toHaveCount(4);
  await page.getByRole('button',{name:/^重做/}).click();await expect(lanes).toHaveCount(3);
  await page.getByRole('button',{name:/^復原/}).click();await expect(lanes).toHaveCount(4);
  await page.getByRole('button',{name:'刪除（Delete）',exact:true}).click();await expect(lanes).toHaveCount(3);expect((await read()).clips).toEqual([p.clips[0]]);
  await page.getByRole('button',{name:/^復原/}).click();await expect(lanes).toHaveCount(4);expect((await read()).clips).toEqual(p.clips);
  await page.getByRole('button',{name:/^重做/}).click();await expect(lanes).toHaveCount(3);
  await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await page.locator('.project-home').waitFor();await page.reload();await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();
  const reopened=await read();expect(reopened.tracks).toEqual(newProject().tracks);expect(reopened.clips).toEqual([p.clips[0]]);
  if(screenshot)await page.screenshot({path:'test-results/empty-track-cleanup.png',fullPage:true});
}

export async function checkZoomedTimelineDrag(page:Page,start=0){
  const url=(pathname:string)=>new URL(pathname,page.url()).href;
  const image=createCanvas(160,100);image.getContext('2d').fillRect(0,0,160,100);
  const upload=await page.request.post(url('/api/media/upload'),{headers:{'X-MyCut':'1'},multipart:{file:{name:'timeline-image.png',mimeType:'image/png',buffer:await image.encode('png')}}});expect(upload.ok()).toBeTruthy();
  const p=newProject();p.name=`放大後首次拖曳 ${start}`;
  p.clips=[makeClip({kind:'image',mediaId:(await upload.json()).imported[0],trackId:'main',start,duration:3600,name:'長圖片'})];
  expect((await page.request.put(url(`/api/projects/${p.id}`),{headers:{'X-MyCut':'1'},data:p})).ok()).toBeTruthy();
  await page.goto(url('/'));await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();
  for(let i=0;i<2;i++)await page.getByRole('button',{name:'放大時間軸',exact:true}).click();
  const scroll=page.locator('.timeline-scroll'),clip=page.locator('.clip-image');
  // The clip's beginning is offscreen; grab its visible middle without selecting it first.
  await scroll.evaluate(el=>el.scrollLeft=5000);await expect.poll(()=>scroll.evaluate(el=>el.scrollLeft)).toBe(5000);
  const viewport=(await scroll.boundingBox())!,lane=(await page.locator('[data-track="main"]').boundingBox())!;
  const x=viewport.x+200,y=lane.y+lane.height/2;
  const ticks=await page.locator('.ruler-tick').evaluateAll(els=>els.slice(0,2).map(el=>parseFloat((el as HTMLElement).style.left))),dx=Math.round(ticks[1]-ticks[0]);
  const read=async()=>{await expect(page.getByText('已儲存至本機',{exact:true})).toBeVisible();return await(await page.request.get(url(`/api/projects/${p.id}`))).json() as Project;};
  for(let attempt=1;attempt<=2;attempt++){
    await expect(clip).not.toHaveClass(/selected/);
    await expect.poll(()=>page.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest('.clip-image'),{x,y})).toBe(true);
    await page.mouse.move(x,y);await page.mouse.down();await expect(clip).toHaveClass(/selected/);
    await expect.poll(()=>scroll.evaluate(el=>el.scrollLeft)).toBe(5000);
    await page.mouse.move(x+dx,y,{steps:8});await page.mouse.up();
    await expect.poll(()=>scroll.evaluate(el=>el.scrollLeft)).toBe(5000);
    const saved=await read();expect(saved.clips).toEqual([{...p.clips[0],start:start+attempt*p.fps}]);expect(saved.tracks).toEqual(p.tracks);
    await expect(page.locator('.time-display b')).toHaveText('00:00:00:00');await page.keyboard.press('Escape');
  }
  await page.getByRole('button',{name:/^復原/}).click();expect((await read()).clips[0].start).toBe(start+p.fps);
  await page.getByRole('button',{name:/^重做/}).click();expect((await read()).clips[0].start).toBe(start+2*p.fps);
  await expect.poll(()=>scroll.evaluate(el=>el.scrollLeft)).toBe(5000);
  await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await page.locator('.project-home').waitFor();await page.reload();
  await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();expect((await read()).clips).toEqual([{...p.clips[0],start:start+2*p.fps}]);
}
