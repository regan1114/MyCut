import { test, expect } from '@playwright/test';
import { newProject, makeClip, type Project } from '../../shared/model';
import { openFonts, fontIs } from './font-helpers';

test('new subtitles start at the playhead in a gap or overlap and retain unified track names after reload', async ({ page }) => {
  const p = newProject(); p.name = '字幕從播放頭開始';
  p.tracks[0].name = '原稿字幕對齊';
  p.tracks.unshift({ ...p.tracks[0], id: 'old-lyrics', name: '自動歌詞' });
  p.clips = [makeClip({ kind: 'text', trackId: 'old-lyrics', start: 0, duration: 60, text: '前一句' }),
    makeClip({ kind: 'text', trackId: 'old-lyrics', start: 300, duration: 60, text: '後一句' })];
  await page.request.put(`/api/projects/${p.id}`, { headers: { 'X-MyCut': '1' }, data: p });
  await page.goto('/');
  await page.getByRole('button', { name: `開啟 ${p.name}`, exact: true }).click();
  await page.getByRole('navigation').getByRole('button', { name: '字幕', exact: true }).click();
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowRight');
  await expect(page.locator('.time-display b')).toHaveText('00:00:03:00');
  await page.getByRole('button', { name: '新增字幕', exact: true }).click();
  await expect(page.getByLabel('開始秒數', { exact: true })).toHaveValue('3');
  await expect(page.locator('.time-display b')).toHaveText('00:00:03:00');
  await page.getByRole('button', { name: '新增字幕', exact: true }).click();
  await expect(page.getByLabel('開始秒數', { exact: true })).toHaveValue('3');
  await expect(page.getByText('已儲存至本機', { exact: true })).toBeVisible();
  let saved: Project = await (await page.request.get(`/api/projects/${p.id}`)).json();
  expect(saved.clips.slice(0, 2)).toEqual(p.clips.map(clip => ({ ...clip, trackId: 'text' })));
  expect(saved.clips.slice(2).map(clip => clip.start)).toEqual([90, 90]);
  expect(saved.clips[2].trackId).not.toBe(saved.clips[3].trackId);
  expect(saved.tracks.filter(track => track.kind === 'text').map(track => track.name)).toEqual(['文字與字幕', '文字與字幕']);
  await page.screenshot({ path: 'test-results/subtitle-at-playhead.png', fullPage: true });
  await page.getByRole('button', { name: /^復原/ }).click();
  await expect(page.locator('.clip-text')).toHaveCount(3);
  await page.getByRole('button', { name: /^重做/ }).click();
  await expect(page.locator('.clip-text')).toHaveCount(4);
  await page.getByRole('button', { name: '返回專案首頁' }).click();
  await page.reload();
  await page.getByRole('button', { name: `開啟 ${p.name}`, exact: true }).click();
  saved = await (await page.request.get(`/api/projects/${p.id}`)).json();
  expect(saved.clips.slice(2).map(clip => clip.start)).toEqual([90, 90]);
  await expect(page.locator('.track-header').filter({ hasText: '文字與字幕' })).toHaveCount(2);
});

test('text styles append after the track tail; compact font properties edit one existing clip',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const p=newProject();p.name='文字接續與字型屬性';await page.request.put(`/api/projects/${p.id}`,{headers:{'X-MyCut':'1'},data:p});
  await page.goto('/');await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();
  const nav=page.getByRole('navigation');await expect(nav.getByRole('button',{name:'字型',exact:true})).toHaveCount(0);
  await nav.getByRole('button',{name:'文字',exact:true}).click();await expect(page.locator('.preset-title,.preset-subtitle')).toHaveCount(0);
  for(const style of ['title','title','title','editorial']){await page.getByRole('button',{name:'回到開頭',exact:true}).click();await nav.getByRole('button',{name:style==='subtitle'?'字幕':'文字',exact:true}).click();if(style==='editorial')await page.locator('.text-preset.preset-editorial').click();else await page.locator('.library-panel').getByRole('button',{name:style==='subtitle'?'新增字幕':'新增文字',exact:true}).click();}
  await expect(page.locator('.timeline-footer')).toContainText('4 個片段');
  const read=async()=>{await page.getByText('已儲存至本機',{exact:true}).waitFor();return await(await page.request.get(`/api/projects/${p.id}`)).json() as Project;};
  const before=await read();expect(before.clips.map(c=>c.start)).toEqual([0,90,180,270]);
  await openFonts(page);await expect(page.locator('.inspector .font-card')).toHaveCount(40);
  const labels=await page.locator('.font-choice>span').allTextContents();const fonts=await(await page.request.get('/api/fonts')).json();expect(labels).toEqual(fonts.map((f:any)=>f.label));
  await page.getByRole('button',{name:'套用字型：jf open 粉圓',exact:true}).click();await fontIs(page,'huninn');
  await expect(page.locator('.timeline-footer')).toContainText('4 個片段');const after=await read();expect(after.clips.map(c=>c.id)).toEqual(before.clips.map(c=>c.id));expect(after.clips.slice(0,-1)).toEqual(before.clips.slice(0,-1));expect(after.clips.at(-1)!.fontId).toBe('huninn');
  await page.screenshot({path:'test-results/text-font-properties.png',fullPage:true});
  await page.locator('.clip-text').first().click();
  await page.getByRole('button',{name:/^複製片段（/}).click();await expect(page.getByLabel('開始秒數',{exact:true})).toHaveValue('12');
  await page.getByRole('button',{name:/^復原（/}).click();await expect(page.locator('.timeline-footer')).toContainText('4 個片段');await page.getByRole('button',{name:/^重做（/}).click();await expect(page.locator('.timeline-footer')).toContainText('5 個片段');
  await read();await page.reload();await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();await expect(page.locator('.timeline-footer')).toContainText('5 個片段');
  const final=await read();expect(final.clips.map(c=>c.start)).toEqual([0,90,180,270,360]);
  expect(errors).toEqual([]);
});
