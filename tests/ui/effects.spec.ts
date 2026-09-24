import { test, expect } from '@playwright/test';
test('effects preview, layering, undo, saved project and seek remain consistent',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.getByRole('button',{name:'開啟示範專案',exact:true}).click();await expect(page.getByRole('button',{name:'匯出影片',exact:true})).toBeVisible({timeout:30000});
 await page.getByRole('navigation').getByRole('button',{name:'特效',exact:true}).click();await expect(page.locator('.fx-card')).toHaveCount(40);
 await expect(page.getByRole('navigation').getByRole('button',{name:'濾鏡',exact:true})).toBeVisible();
 await page.waitForFunction(()=>document.fonts.status==='loaded');
 const pixel=()=>page.locator('.preview-stage canvas').evaluate((el:HTMLCanvasElement)=>{const data=el.getContext('2d')!.getImageData(0,0,el.width,el.height).data;let h=2166136261;for(const b of data)h=Math.imul(h^b,16777619);return h>>>0;});
 // Chromium can switch GPU/CPU raster paths after readback; allow at most 4/255 channel rounding.
 // Wait until the demo image has loaded into the preview.
 await expect.poll(async()=>await page.locator('.preview-stage canvas').evaluate((el:HTMLCanvasElement)=>{const px=el.getContext('2d')!.getImageData(10,10,1,1).data;return px[0];})).toBeGreaterThan(30);
 const original=await pixel();await page.getByRole('button',{name:'櫻花',exact:true}).click();await expect(page.getByRole('button',{name:'櫻花',exact:true})).toHaveAttribute('aria-pressed','true');await expect.poll(pixel).not.toBe(original);
 await page.getByRole('button',{name:'懷舊濾鏡',exact:true}).click();await page.getByRole('button',{name:'精靈粒子',exact:true}).click();await expect(page.locator('.fx-enabled')).toContainText('已開啟 3 種');
 await page.getByRole('button',{name:/^復原（/}).click();await expect(page.getByRole('button',{name:'精靈粒子',exact:true})).toHaveAttribute('aria-pressed','false');await page.getByRole('button',{name:/^重做（/}).click();await expect(page.getByRole('button',{name:'精靈粒子',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByLabel('特效強度',{exact:true}).focus();await page.keyboard.press('End');await expect(page.getByLabel('特效強度',{exact:true})).toHaveValue('1');await page.getByRole('button',{name:/^復原（/}).click();await expect(page.getByLabel('特效強度',{exact:true})).toHaveValue('0.7');
 await page.getByRole('button',{name:'回到開頭',exact:true}).click();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const frame0=await pixel();await page.locator('.preview-stage canvas').evaluate((el:HTMLCanvasElement)=>{(window as any).__effectFrame0=el.getContext('2d')!.getImageData(0,0,el.width,el.height).data;});await page.keyboard.press('Shift+ArrowRight');await expect.poll(pixel).not.toBe(frame0);await page.getByRole('button',{name:'回到開頭',exact:true}).click();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const difference=await page.locator('.preview-stage canvas').evaluate((el:HTMLCanvasElement)=>{const before=(window as any).__effectFrame0 as Uint8ClampedArray,after=el.getContext('2d')!.getImageData(0,0,el.width,el.height).data;let sum=0,max=0;for(let i=0;i<after.length;i++){const d=Math.abs(before[i]-after[i]);sum+=d;max=Math.max(max,d);}return {mean:sum/after.length,max};});expect(difference.mean).toBeLessThan(.5);expect(difference.max).toBeLessThanOrEqual(4);
 await page.keyboard.press('Shift+ArrowRight');await page.keyboard.press('Shift+ArrowRight');await page.locator('.library-scroll').evaluate(el=>el.scrollTop=0);await page.screenshot({path:'test-results/effects-panel.png',fullPage:true});
 await expect(page.getByText('已儲存至本機',{exact:true})).toBeVisible();await page.reload();await page.getByRole('button',{name:'開啟 山間，慢一點',exact:true}).first().click();await page.getByRole('navigation').getByRole('button',{name:'特效',exact:true}).click();await expect(page.locator('.fx-enabled')).toContainText('已開啟 3 種');
 await page.getByRole('button',{name:'全部關閉',exact:true}).click();await expect(page.locator('.fx-card[aria-pressed=true]')).toHaveCount(0);await expect(page.getByText('已儲存至本機',{exact:true})).toBeVisible();expect(errors).toEqual([]);
});

test('music effects analyse imported audio and stop responding when its track is muted',async({page})=>{
 const {newProject,makeClip}=await import('../../shared/model');
 const rate=8000,seconds=3,wav=Buffer.alloc(44+rate*seconds*2);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);for(let i=0;i<rate*seconds;i++)wav.writeInt16LE(i/rate%.5<.08?Math.round(Math.sin(i/rate*2*Math.PI*220)*22000):0,44+i*2);
 const response=await page.request.post('/api/media/upload',{headers:{'X-MyCut':'1'},multipart:{file:{name:'rhythm-test.wav',mimeType:'audio/wav',buffer:wav}}});expect(response.ok()).toBeTruthy();const uploaded=await response.json();const p=newProject();p.name='特效節奏測試';p.effects.enabled=['strobe','spectrum','beatRays'];p.effects.intensity=1;p.clips=[makeClip({kind:'shape',trackId:'main',start:0,duration:90,color:'#507561'}),makeClip({kind:'audio',trackId:'music',mediaId:uploaded.imported[0],start:0,duration:90})];
 expect((await page.request.put(`/api/projects/${p.id}`,{headers:{'X-MyCut':'1'},data:p})).ok()).toBeTruthy();await page.goto('/');
 const analysisResponse=page.waitForResponse(r=>r.url().includes('/rhythm?spectrum=1'));
 await page.getByRole('button',{name:'開啟 特效節奏測試',exact:true}).click();const analysis=await analysisResponse;expect(analysis.ok()).toBeTruthy();const features=await analysis.json();expect(features.beats.length).toBeGreaterThanOrEqual(5);expect(Buffer.from(features.bands,'base64').length).toBeGreaterThan(4000);await expect(page.locator('.fx-analysis')).toHaveCount(0);
 const center=()=>page.locator('.preview-stage canvas').evaluate((el:HTMLCanvasElement)=>Array.from(el.getContext('2d')!.getImageData(el.width/2,el.height/2,1,1).data).slice(0,3).reduce((s,v)=>s+v,0));
 await page.getByRole('navigation').getByRole('button',{name:'特效',exact:true}).click();await page.getByLabel('頻譜樣式').selectOption('circle');await page.getByLabel('特效品質').selectOption('draft');await page.getByLabel('頻譜樣式').selectOption('waveform');await page.getByLabel('頻譜樣式').selectOption('bars');const lit=await center();await page.locator('.track-header').filter({hasText:'音樂'}).getByRole('button',{name:'靜音軌道',exact:true}).click();await expect.poll(center).toBeLessThan(lit-20);await expect(page.getByText('已儲存至本機',{exact:true})).toBeVisible();
});

test('new effects have artwork, change the preview and persist as global or timed effects',async({page})=>{
 const {newProject,makeClip}=await import('../../shared/model');
 const {effectCatalog}=await import('../../shared/effects');const added=effectCatalog.slice(28);
 const p=newProject();p.name='新增特效驗證';p.clips=[makeClip({kind:'shape',trackId:'main',start:0,duration:300,color:'#37577a'}),makeClip({kind:'shape',trackId:'overlay',start:0,duration:300,shape:'circle',color:'#efd2a4',scale:.27,x:.12})];
 expect((await page.request.put(`/api/projects/${p.id}`,{headers:{'X-MyCut':'1'},data:p})).ok()).toBeTruthy();
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();
 await page.getByRole('navigation').getByRole('button',{name:'特效',exact:true}).click();await expect(page.locator('.fx-card')).toHaveCount(40);
 const pixel=()=>page.locator('.preview-stage canvas').evaluate((el:HTMLCanvasElement)=>{const data=el.getContext('2d')!.getImageData(0,0,el.width,el.height).data;let h=2166136261;for(const b of data)h=Math.imul(h^b,16777619);return h>>>0;});
 for(const item of added){
  const card=page.getByRole('button',{name:item.name,exact:true});await card.scrollIntoViewIfNeeded();
  await expect.poll(()=>card.locator('img').evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth===480)).toBe(true);
  const before=await pixel();await card.click();await expect(card).toHaveAttribute('aria-pressed','true');
  if(item.id!=='beatRays')await expect.poll(pixel).not.toBe(before);
  await card.click();await expect(card).toHaveAttribute('aria-pressed','false');
 }
 await page.getByRole('button',{name:'泡泡',exact:true}).click();await page.getByRole('button',{name:/^復原（/}).click();await expect(page.getByRole('button',{name:'泡泡',exact:true})).toHaveAttribute('aria-pressed','false');await page.getByRole('button',{name:/^重做（/}).click();
 await page.getByRole('button',{name:'時段特效',exact:true}).click();await page.getByRole('button',{name:'彩色紙花',exact:true}).click();await expect(page.locator('.clip-effect')).toContainText('彩色紙花');
 await page.getByLabel('特效開始秒數',{exact:true}).fill('2');await page.getByLabel('特效長度秒數',{exact:true}).fill('4');
 const saved=async()=>(await page.request.get(`/api/projects/${p.id}`)).json();
 await expect.poll(async()=>{const v=await saved();return [v.effects.enabled,v.clips.find((c:any)=>c.kind==='effect')?.effects.enabled,v.clips.find((c:any)=>c.kind==='effect')?.duration];}).toEqual([['bubbles'],['confetti'],120]);
 await page.reload();await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();await expect(page.locator('.clip-effect')).toContainText('彩色紙花');await page.getByRole('navigation').getByRole('button',{name:'特效',exact:true}).click();await expect(page.getByRole('button',{name:'泡泡',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'泡泡',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/effects-new.png',fullPage:true});
 expect(errors).toEqual([]);
 await page.goto('/artwork/gallery.html');await page.locator('#effects img').evaluateAll(async images=>{await Promise.all(images.map(i=>(i as HTMLImageElement).decode()));});await page.evaluate(()=>document.fonts.ready);
 await page.locator('#effects').screenshot({path:'docs/artwork-effects.png'});
 await page.locator('#effects figure').evaluateAll(figures=>figures.slice(0,28).forEach(f=>f.remove()));await page.locator('#effects').screenshot({path:'docs/artwork-effects-new.png'});
});
