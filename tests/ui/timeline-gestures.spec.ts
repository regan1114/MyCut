import { test, expect } from '@playwright/test';
import { makeClip, newProject, uid, type Project } from '../../shared/model';
import { checkEmptyTrackCleanup, checkZoomedTimelineDrag } from './editor-gestures-checks';

for(const start of [0,600])test(`first image drag after zoom keeps the scrolled timeline in place (start ${start})`,async({page})=>{
  await page.goto('/');await checkZoomedTimelineDrag(page,start);
});

test('subtitle drags outside text lanes keep the source lane and never add tracks',async({page})=>{
  const p=newProject();p.name='字幕拖離軌道';p.clips=[makeClip({kind:'text',trackId:'text',start:60,duration:60,text:'保留原軌道'})];
  await page.request.put(`/api/projects/${p.id}`,{headers:{'X-MyCut':'1'},data:p});await page.goto('/');await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();
  const moving=page.locator('.clip-text'),source=page.locator('[data-track="text"]');
  for(let attempt=0;attempt<3;attempt++){
    const box=(await moving.boundingBox())!,origin=(await source.boundingBox())!,video=(await page.locator('[data-track="main"]').boundingBox())!;
    const x=box.x+box.width/2,y=box.y+box.height/2;
    await page.mouse.move(x,y);await page.mouse.down();
    await page.mouse.move(x+30,video.y+video.height/2,{steps:8});
    await expect(source).toHaveCount(1);await expect(page.locator('.track-lane')).toHaveCount(p.tracks.length);
    await page.mouse.move(x,origin.y+origin.height/2,{steps:8});await page.mouse.up();
    await expect(source.locator('.clip-text')).toHaveCount(1);await expect(page.locator('.track-lane')).toHaveCount(p.tracks.length);
  }
  // Releasing over an incompatible lane also leaves the caption where it was.
  const box=(await moving.boundingBox())!,video=(await page.locator('[data-track="main"]').boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+100,video.y+video.height/2);await page.mouse.up();
  await expect(page.getByText('已儲存至本機',{exact:true})).toBeVisible();const saved=await(await page.request.get(`/api/projects/${p.id}`)).json() as Project;
  expect(saved.tracks).toEqual(p.tracks);expect(saved.clips).toEqual(p.clips);
});

test('a subtitle can return to its original lane after one deliberate insertion, and cancel adds nothing',async({page})=>{
  const p=newProject();p.name='字幕拖回原軌';p.clips=[makeClip({kind:'text',trackId:'text',start:60,duration:60,text:'拖回這句'})];
  await page.request.put(`/api/projects/${p.id}`,{headers:{'X-MyCut':'1'},data:p});await page.goto('/');await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();
  const source=page.locator('[data-track="text"]'),moving=page.locator('.clip-text');
  let box=(await moving.boundingBox())!,lane=(await source.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  for(let i=0;i<5;i++)await page.mouse.move(box.x+box.width/2+i,lane.y+lane.height+3);
  await expect(source).toHaveCount(1);await expect(page.locator('.track-lane')).toHaveCount(p.tracks.length);
  await expect(page.locator('.timeline-track-insertion')).toHaveCount(1);
  await page.mouse.up();await expect(source).toHaveCount(1);await expect(page.locator('.track-lane')).toHaveCount(p.tracks.length+1);
  await expect(source.locator('.clip-text')).toHaveCount(0);
  await page.getByRole('button',{name:/^復原/}).click();await expect(source.locator('.clip-text')).toHaveCount(1);await expect(page.locator('.track-lane')).toHaveCount(p.tracks.length);
  await page.getByRole('button',{name:/^重做/}).click();await expect(page.locator('.track-lane')).toHaveCount(p.tracks.length+1);
  box=(await moving.boundingBox())!;lane=(await source.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,lane.y+lane.height/2,{steps:8});await page.mouse.up();
  await expect(source.locator('.clip-text')).toHaveCount(1);await expect(page.locator('.track-lane')).toHaveCount(p.tracks.length);
  box=(await moving.boundingBox())!;lane=(await source.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,lane.y-3);
  await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true})));await page.mouse.up();
  await expect(page.locator('.track-lane')).toHaveCount(p.tracks.length);await expect(source.locator('.clip-text')).toHaveCount(1);await expect(page.locator('.timeline-drag-preview')).toHaveCount(0);
  await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await page.reload();await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();
  await expect(source.locator('.clip-text')).toHaveCount(1);await expect(page.locator('.track-lane')).toHaveCount(p.tracks.length);
});

test('marker clicks seek exactly, cancel stops scrubbing, and leaving editor removes gesture listeners', async ({ page }) => {
  const p = newProject(); p.name = '時間軸手勢清理'; p.clips = [makeClip({ kind: 'text', trackId: 'text', start: 0, duration: 900, text: '手勢驗證' })];
  p.markers = [{ id: uid(), frame: 300, name: '十秒標記' }];
  await page.request.put(`/api/projects/${p.id}`, { headers: { 'X-MyCut': '1' }, data: p });
  await page.goto('/'); await page.getByRole('button', { name: `開啟 ${p.name}`, exact: true }).click();
  const marker = page.getByRole('button', { name: '十秒標記（雙擊刪除）' });
  await marker.click(); await expect(page.locator('.time-display b')).toHaveText('00:00:10:00');
  await marker.dblclick(); await expect(marker).toHaveCount(0);
  const ruler = page.locator('.time-ruler'), box = (await ruler.boundingBox())!;
  await page.mouse.move(box.x + 80, box.y + 12); await page.mouse.down(); await page.mouse.move(box.x + 140, box.y + 12);
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true })));
  const canceledFrame = await page.locator('.time-display b').innerText(); await page.mouse.move(box.x + 250, box.y + 12); await page.mouse.up(); await expect(page.locator('.time-display b')).toHaveText(canceledFrame);
  // Simulate closing while pointer capture is still active; the next editor must not inherit it.
  await page.mouse.move(box.x + 80, box.y + 12); await page.mouse.down();
  await page.getByRole('button', { name: '返回專案首頁' }).evaluate((button: HTMLButtonElement) => button.click());
  await page.locator('.project-home').waitFor(); await page.mouse.up(); await page.getByRole('button', { name: `開啟 ${p.name}`, exact: true }).click();
  await page.mouse.move(800, 650); await expect(page.locator('.time-display b')).toHaveText('00:00:00:00');
});

test('subtitle previews snap across tracks, release on continued movement and commit only on drop',async({page})=>{
  const p=newProject();p.name='字幕預覽磁吸';p.clips=[makeClip({kind:'text',trackId:'text',start:30,duration:60,text:'移動字幕'}),makeClip({kind:'shape',trackId:'main',start:180,duration:90,name:'對齊參考'})];
  await page.request.put(`/api/projects/${p.id}`,{headers:{'X-MyCut':'1'},data:p});await page.goto('/');await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();
  const clip=page.locator('.clip-text'),guide=page.locator('.timeline-snap-guide'),preview=page.locator('.timeline-drag-preview'),box=(await clip.boundingBox())!;
  const x=box.x+box.width/2,y=box.y+box.height/2,targetX=x+165;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(targetX+4,y);
  await expect(guide).toHaveCount(1);expect(await preview.evaluate(el=>parseFloat(el.style.left))).toBe(220);expect(await clip.evaluate(el=>parseFloat(el.style.left))).toBe(55);
  await page.mouse.move(targetX+18,y);await expect(guide).toHaveCount(0);expect(await preview.evaluate(el=>parseFloat(el.style.left))).toBeGreaterThan(227);
  await page.mouse.move(targetX+4,y);await expect(guide).toHaveCount(1);await page.mouse.up();await expect(preview).toHaveCount(0);await expect(guide).toHaveCount(0);
  await expect(page.getByText('已儲存至本機',{exact:true})).toBeVisible();const saved=await(await page.request.get(`/api/projects/${p.id}`)).json() as Project;
  expect(saved.clips[0].start).toBe(120);expect(saved.clips[0].trackId).toBe('text');expect(saved.tracks).toEqual(p.tracks);
  await page.getByRole('button',{name:/^復原/}).click();await expect.poll(()=>clip.evaluate(el=>parseFloat(el.style.left))).toBe(55);
});

test('playback, jumps and zoom keep the playhead in view, and returning to the start scrolls back', async ({ page }) => {
  const p=newProject();p.name='播放頭跟隨';p.clips=[makeClip({kind:'text',trackId:'text',start:0,duration:3600,text:'長時間字幕'})];
  await page.request.put(`/api/projects/${p.id}`,{headers:{'X-MyCut':'1'},data:p});
  await page.goto('/');await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();
  const scroll=page.locator('.timeline-scroll');const box=(await scroll.boundingBox())!;
  await page.mouse.click(box.x+box.width*.8-20,box.y+12);
  const before=await scroll.evaluate(el=>el.scrollLeft);
  await page.keyboard.press('Space');
  await expect.poll(()=>scroll.evaluate(el=>el.scrollLeft),{timeout:6000}).toBeGreaterThan(before+55);
  await page.keyboard.press('Space');
  const visible=()=>page.evaluate(()=>{const head=document.querySelector('.playhead')!.getBoundingClientRect(),view=document.querySelector('.timeline-scroll')!.getBoundingClientRect();return head.left>=view.left&&head.left<view.right;});
  await expect.poll(visible).toBe(true);
  for(let i=0;i<35;i++)await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(()=>scroll.evaluate(el=>el.scrollLeft)).toBeGreaterThan(1000);await expect.poll(visible).toBe(true);
  await page.getByRole('button',{name:'放大時間軸',exact:true}).click();await expect.poll(visible).toBe(true);
  await page.screenshot({path:'test-results/playhead-follow.png',fullPage:true});
  await page.getByRole('button',{name:'回到開頭',exact:true}).click();await expect.poll(()=>scroll.evaluate(el=>el.scrollLeft)).toBe(0);
});

test('text overlap and vertical drags add lanes that disappear after moving back or deleting',async({page})=>{
  const p=newProject();p.name='動態字幕軌道';p.clips=[makeClip({kind:'text',trackId:'text',start:0,duration:60,text:'第一句'}),makeClip({kind:'text',trackId:'text',start:90,duration:60,text:'移動這句'})];
  await page.request.put(`/api/projects/${p.id}`,{headers:{'X-MyCut':'1'},data:p});await page.goto('/');await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();
  await page.getByRole('button',{name:'磁吸對齊',exact:true}).click();
  const moving=page.locator('.clip-text').filter({hasText:'移動這句'}),headers=page.locator('.track-header').filter({hasText:'文字與字幕'});
  const drag=async(dx:number,y?:number)=>{const b=(await moving.boundingBox())!;await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+dx,y??b.y+b.height/2,{steps:8});await page.mouse.up();};
  const read=async()=>{await expect(page.getByText('已儲存至本機',{exact:true})).toBeVisible();return await(await page.request.get(`/api/projects/${p.id}`)).json() as Project;};
  await drag(-110);await expect(headers).toHaveCount(2);let saved=await read();expect(saved.clips[1].start).toBe(30);expect(saved.clips[1].trackId).not.toBe(saved.clips[0].trackId);
  await drag(110);await expect(headers).toHaveCount(1);saved=await read();expect(saved.clips[1].start).toBe(90);expect(saved.clips[1].trackId).toBe(saved.clips[0].trackId);
  let lane=(await page.locator('[data-track="text"]').boundingBox())!;
  await drag(0,lane.y-3);await expect(headers).toHaveCount(2);saved=await read();expect(saved.clips[1].start).toBe(90);expect(saved.tracks[0].id).toBe(saved.clips[1].trackId);expect(saved.tracks[0].manualTextLane).toBe(true);
  await page.getByRole('button',{name:/^復原/}).click();await expect(headers).toHaveCount(1);await page.getByRole('button',{name:/^重做/}).click();await expect(headers).toHaveCount(2);
  await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await page.reload();await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();await expect(headers).toHaveCount(2);
  lane=(await page.locator('[data-track="text"]').boundingBox())!;
  await drag(0,lane.y+lane.height/2);await expect(headers).toHaveCount(1);
  lane=(await page.locator('[data-track="text"]').boundingBox())!;
  await drag(0,lane.y+lane.height+3);await expect(headers).toHaveCount(2);saved=await read();expect(saved.tracks[saved.tracks.findIndex(t=>t.id==='text')+1].id).toBe(saved.clips[1].trackId);expect(saved.clips[1].start).toBe(90);
  await page.screenshot({path:'test-results/dynamic-text-lanes.png',fullPage:true});
  await page.getByRole('button',{name:'刪除（Delete）',exact:true}).click();await expect(headers).toHaveCount(1);await expect(page.locator('.clip-text')).toHaveCount(1);
  await page.getByRole('button',{name:/^復原/}).click();await expect(headers).toHaveCount(2);await expect(page.locator('.clip-text')).toHaveCount(2);
  await page.getByRole('button',{name:/^重做/}).click();await expect(headers).toHaveCount(1);await expect(page.locator('.clip-text')).toHaveCount(1);
});

test('opening an older project removes extra empty lanes including manual lanes and saves the cleanup',async({page})=>{
  await page.goto('/');await checkEmptyTrackCleanup(page);
});
