import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-interface-')),require=createRequire(import.meta.url);
const unpackaged=process.env.MYCUT_TEST_UNPACKAGED==='1';
const binary=unpackaged?require('electron'):(process.env.MYCUT_TEST_APP??path.resolve(process.platform==='win32'?'release/win-unpacked/MyCut.exe':`release/${process.arch==='arm64'?'mac-arm64':'mac'}/MyCut.app/Contents/MacOS/MyCut`));
const env={...process.env,MYCUT_DATA_DIR:root};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:binary,env,args:[...(unpackaged?['.']:[]),`--user-data-dir=${path.join(root,'profile')}`],timeout:30000});
try{
  const page=await app.firstWindow(),errors=[],audited=[];page.on('pageerror',e=>errors.push(e.message));
  await fs.mkdir('test-results',{recursive:true});
  const audit=async surface=>{const result=await page.locator('button').evaluateAll(buttons=>buttons.filter(b=>b.getBoundingClientRect().width&&b.getBoundingClientRect().height&&/^\s*[×＋+]?\s*$/.test(b.textContent??'')).map(b=>({name:b.getAttribute('aria-label'),tip:b.getAttribute('data-tooltip')})));assert.ok(result.every(b=>b.name&&b.tip),`${surface}: ${JSON.stringify(result.filter(b=>!b.name||!b.tip))}`);audited.push({surface,iconButtons:result.length});};
  await page.getByRole('heading',{name:'我的專案',exact:true}).waitFor();await page.locator('.loading-screen').waitFor({state:'detached'});await audit('home');await page.screenshot({path:'test-results/interface-home.png',fullPage:true});
  await page.getByRole('button',{name:'開啟示範專案',exact:true}).click();await page.locator('.app-shell').waitFor();await page.waitForFunction(()=>document.fonts.status==='loaded');
  const nav=page.getByRole('navigation'),tooltip=page.getByRole('tooltip');
  await page.getByText('已儲存至本機',{exact:true}).waitFor();await nav.getByRole('button',{name:'素材',exact:true}).hover();await expect(tooltip).toHaveText('素材');await page.screenshot({path:'test-results/interface-editor-tooltip.png',fullPage:true});
  await page.mouse.move(900,80);await page.getByRole('button',{name:/^分割（/}).hover();await expect(tooltip).toContainText('分割');await expect(page.getByRole('button',{name:/^分割（/})).toBeDisabled();await page.keyboard.press('Escape');await expect(tooltip).toHaveCount(0);
  for(const name of ['素材','音訊','文字','字幕','特效','濾鏡','轉場','圖形']){await nav.getByRole('button',{name,exact:true}).click();await audit(name);}
  await nav.getByRole('button',{name:'文字',exact:true}).click();
  for(let i=0;i<3;i++){await page.getByRole('button',{name:'回到開頭',exact:true}).click();await page.getByRole('button',{name:'新增文字',exact:true}).click();}
  await page.getByText('已儲存至本機',{exact:true}).waitFor();
  const read=()=>page.evaluate(async()=>{const list=await(await fetch('/api/projects')).json();return await(await fetch(`/api/projects/${list[0].id}`)).json();});
  const before=await read(),added=before.clips.slice(-3);assert.equal(before.clips.length,6);for(let i=1;i<added.length;i++)assert.equal(added[i].start,added[i-1].start+added[i-1].duration);
  await page.locator('.font-picker>summary').click();await expect(page.locator('.inspector .font-card')).toHaveCount(40);
  const fontNames=await page.evaluate(async()=> (await(await fetch('/api/fonts')).json()).map(f=>f.label));assert.deepEqual(await page.locator('.font-choice>span').allTextContents(),fontNames);
  await page.getByRole('button',{name:'套用字型：jf open 粉圓',exact:true}).click();await page.getByText('已儲存至本機',{exact:true}).waitFor();const after=await read();assert.equal(after.clips.length,before.clips.length);assert.deepEqual(after.clips.slice(0,-1),before.clips.slice(0,-1));assert.equal(after.clips.at(-1).fontId,'huninn');
  await audit('font properties');await page.screenshot({path:'test-results/interface-fonts.png',fullPage:true});
  await page.getByLabel('文字內容',{exact:true}).fill('時間軸顯示字幕內容');await expect(page.locator('.clip-text.selected')).toContainText('時間軸顯示字幕內容');
  await page.getByRole('button',{name:'字幕屬性',exact:true}).click();const captions=page.getByRole('list',{name:'專案字幕清單'});await expect(captions.getByRole('listitem')).toHaveCount(after.clips.filter(c=>c.kind==='text').length);await expect(captions.getByRole('button',{pressed:true})).toContainText('時間軸顯示字幕內容');await expect(page.locator('.inspector-tabs button')).toHaveText(['字幕','文字','動畫','調色']);await expect(page.locator('.inspector textarea,.inspector .clip-heading,.caption-tool-menu,.caption-current')).toHaveCount(0);
  await page.getByLabel('搜尋字幕內容').fill('山間');await captions.getByRole('button').click();await expect(page.getByLabel('搜尋字幕內容')).toHaveValue('山間');await page.getByRole('button',{name:'清除字幕搜尋'}).click();await expect(captions.getByRole('listitem')).toHaveCount(after.clips.filter(c=>c.kind==='text').length);
  await page.locator('.inspector').getByRole('button',{name:'文字',exact:true}).click();await expect(page.getByLabel('文字內容',{exact:true})).toHaveValue(/山間/);await page.getByLabel('文字內容',{exact:true}).fill('在文字分頁編輯字幕');await expect(page.locator('.clip-text.selected')).toContainText('在文字分頁編輯字幕');await expect(page.getByRole('button',{name:'逐字校時',exact:true})).toBeVisible();await page.getByRole('button',{name:'字幕屬性',exact:true}).click();await expect(captions.getByRole('button',{pressed:true})).toContainText('在文字分頁編輯字幕');
  const dragPanel=async(name,delta)=>{const box=await page.getByRole('separator',{name}).boundingBox();await page.mouse.move(box.x+3,box.y+90);await page.mouse.down();await page.mouse.move(box.x+3+delta,box.y+90,{steps:6});await page.mouse.up();};
  await dragPanel('調整播放器與屬性區寬度',-100);await dragPanel('調整功能區與播放器寬度',50);assert.equal(Math.round((await page.locator('.inspector').boundingBox()).width),370);assert.equal(Math.round((await page.locator('.library-panel').boundingBox()).width),322);
  await page.mouse.move(800,80);await audit('caption properties');await page.screenshot({path:'test-results/interface-caption-properties.png',fullPage:true});
  await page.getByRole('separator',{name:'調整功能區與播放器寬度'}).dblclick();await page.getByRole('separator',{name:'調整播放器與屬性區寬度'}).dblclick();
  await nav.getByRole('button',{name:'特效',exact:true}).click();await expect(page.locator('.library-panel input,.library-panel select')).toHaveCount(0);await page.getByRole('button',{name:'櫻花',exact:true}).click();await page.screenshot({path:'test-results/interface-effects.png',fullPage:true});await expect(page.getByLabel('特效品質',{exact:true})).toBeVisible();await expect(page.locator('.inspector .fx-card')).toHaveCount(0);await audit('effects properties');
  await expect(page.locator('.fx-card')).toHaveCount(40);
  const addedEffects=['泡泡','漂浮愛心','蝴蝶','彩色紙花','流動絲帶','晨光射線','十字星芒','底片顆粒','像素風','漫畫網點','電影黑邊','節奏放射線'];
  for(const name of addedEffects){const card=page.getByRole('button',{name,exact:true});await card.scrollIntoViewIfNeeded();await expect.poll(()=>card.locator('img').evaluate(img=>img.complete&&img.naturalWidth===480)).toBe(true);await card.click();await expect(card).toHaveAttribute('aria-pressed','true');await card.click();await expect(card).toHaveAttribute('aria-pressed','false');}
  await page.getByRole('button',{name:'泡泡',exact:true}).click();await page.screenshot({path:'test-results/interface-new-effects.png',fullPage:true});
  await page.getByRole('button',{name:'匯出影片',exact:true}).click();await page.getByRole('dialog',{name:'匯出影片',exact:true}).getByRole('button',{name:'關閉',exact:true}).hover();await expect(tooltip).toHaveText('關閉');await audit('export');await page.getByRole('button',{name:'關閉',exact:true}).click();await expect(tooltip).toHaveCount(0);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1120,740));await page.getByRole('button',{name:'放大時間軸',exact:true}).hover();await expect(tooltip).toHaveText('放大時間軸');const bounds=await tooltip.boundingBox(),viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth}));assert.equal(viewport.overflow,false);assert.ok(bounds.height<40,'short tooltip should stay on one line');assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=viewport.width&&bounds.y+bounds.height<=viewport.height);await page.screenshot({path:'test-results/interface-small-tooltip.png',fullPage:true});
  await page.getByRole('separator',{name:'調整功能區與播放器寬度'}).press('Home');await page.getByRole('separator',{name:'調整播放器與屬性區寬度'}).press('Home');
  for(const name of ['素材','音訊','文字','字幕','特效','濾鏡','轉場','圖形']){await nav.getByRole('button',{name,exact:true}).click();const overflow=await page.locator('.library-scroll').evaluate(el=>el.scrollWidth-el.clientWidth);assert.ok(overflow<=1,`${name} exceeds minimum library width by ${overflow}px`);}
  await page.screenshot({path:'test-results/interface-minimum-panels.png',fullPage:true});
  await nav.getByRole('button',{name:'素材',exact:true}).focus();await page.keyboard.press('Tab');await expect(tooltip).toHaveText('音訊');await page.keyboard.press('Enter');await expect(tooltip).toHaveCount(0);
  await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await page.locator('.project-home').waitFor();await audit('home with project');
  assert.deepEqual(errors,[]);
  const report={version:JSON.parse(await fs.readFile('package.json','utf8')).version,testedAt:new Date().toISOString(),platform:process.platform,arch:process.arch,packagedApp:!unpackaged,hoverNames:true,disabledTooltips:true,keyboardFocus:true,escapeDismissal:true,viewportBounds:true,shortTooltipSingleLine:true,effectCount:40,addedEffectsArtworkAndToggle:addedEffects,globalEffectPropertiesOnRight:true,effectCatalogOnLeft:true,textAppendsWithoutOverlap:true,resizablePanels:true,minimumPanelContentWidths:true,captionPropertyList:true,captionSearchRetained:true,captionTabBeforeText:true,captionTabListOnly:true,captionEditingInTextTab:true,karaokeInTextTab:true,timelineUsesTextContent:true,fontNamesPreview:true,fontSelectionEditsExistingClip:true,iconLabelAudit:audited,errors};
  await fs.writeFile(`docs/interface-${process.platform}-${process.arch}${unpackaged?'-source':''}-test-result.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}
