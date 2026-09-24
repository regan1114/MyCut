import { openFonts, fontIs } from './font-helpers';
import { test, expect } from '@playwright/test';

let originalPreferences:{favoriteFontIds:string[]}|undefined,originalProjects:string[]=[];
test.afterEach(async({page,request})=>{
  await page.close();
  if(originalPreferences)await request.put('/api/preferences',{headers:{'X-MyCut':'1'},data:originalPreferences});
  const projects=await(await request.get('/api/projects')).json();
  for(const p of projects)if(!originalProjects.includes(p.id))await request.post(`/api/projects/${p.id}/trash`,{headers:{'X-MyCut':'1'}});
});

test('font favorites control new text and subtitles, persist, and recover from save failure',async({page})=>{
  originalPreferences=await(await page.request.get('/api/preferences')).json();
  originalProjects=(await(await page.request.get('/api/projects')).json()).map((p:{id:string})=>p.id);
  const put=(favoriteFontIds:string[])=>page.request.put('/api/preferences',{headers:{'X-MyCut':'1'},data:{favoriteFontIds}});
  await put([]);
    await page.goto('/');await page.getByRole('button',{name:'建立新專案',exact:true}).click();
    const nav=page.getByRole('navigation');await nav.getByRole('button',{name:'文字',exact:true}).click();await page.getByRole('button',{name:'新增文字',exact:true}).click();await fontIs(page,'notosanstc');
    await openFonts(page);await expect(page.locator('.font-card')).toHaveCount(40);await expect(page.locator('.font-default')).toContainText('思源黑體 TC');
    await page.getByLabel('我的最愛：辰宇落雁體',{exact:true}).check();await expect(page.locator('.font-default')).toContainText('辰宇落雁體');
    await page.getByLabel('我的最愛：jf open 粉圓',{exact:true}).check();await expect(page.locator('.font-default')).toContainText('jf open 粉圓');await fontIs(page,'notosanstc');
    await page.getByRole('button',{name:'我的最愛（2）',exact:true}).click();await expect(page.locator('.font-card')).toHaveCount(2);
    await page.getByLabel('我的最愛：jf open 粉圓',{exact:true}).click();await expect(page.locator('.font-card')).toHaveCount(1);await expect(page.locator('.font-default')).toContainText('辰宇落雁體');
    await page.getByRole('button',{name:'全部字型',exact:true}).click();await page.getByLabel('搜尋字型',{exact:true}).fill('DM Sans');await expect(page.locator('.font-card')).toHaveCount(1);await page.getByRole('button',{name:'套用字型：DM Sans',exact:true}).click();await fontIs(page,'dmsans');
    await nav.getByRole('button',{name:'文字',exact:true}).click();await page.getByRole('button',{name:'新增文字',exact:true}).click();await fontIs(page,'chenyuluoyan');
    await nav.getByRole('button',{name:'字幕',exact:true}).click();await page.getByRole('button',{name:'新增字幕',exact:true}).click();await fontIs(page,'chenyuluoyan');
    await page.locator('.library-panel input[type=file]').setInputFiles({name:'test.srt',mimeType:'text/plain',buffer:Buffer.from('1\n00:00:04,000 --> 00:00:06,000\n匯入的字幕\n')});await expect(page.locator('.timeline-footer')).toContainText('4 個片段');
    await page.getByRole('button',{name:'字幕批次編輯',exact:true}).click();await page.getByLabel('批次套用樣式').check();await expect(page.getByLabel('批次字型',{exact:true})).toHaveValue('chenyuluoyan');await page.getByRole('button',{name:'取消',exact:true}).click();
    await page.getByText('已儲存至本機',{exact:true}).waitFor();
    const projects=await(await page.request.get('/api/projects')).json();const p=await(await page.request.get(`/api/projects/${projects[0].id}`)).json();expect(p.clips.map((c:any)=>c.fontId)).toEqual(['dmsans','chenyuluoyan','chenyuluoyan','chenyuluoyan']);
    await openFonts(page);
    await page.route('**/api/preferences',async route=>route.request().method()==='PUT'?route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'測試：磁碟無法寫入'})}):route.continue());
    await page.getByLabel('我的最愛：辰宇落雁體',{exact:true}).click();await expect(page.locator('.toast.error')).toContainText('最愛字型儲存失敗');await expect(page.getByLabel('我的最愛：辰宇落雁體',{exact:true})).toBeChecked();await expect(page.locator('.font-default')).toContainText('辰宇落雁體');await page.unroute('**/api/preferences');
    await page.getByRole('button',{name:'返回專案首頁'}).click();await expect(page.locator('.project-home')).toBeVisible();await page.reload();await page.getByRole('button',{name:'建立新專案',exact:true}).click();await nav.getByRole('button',{name:'文字',exact:true}).click();await page.getByRole('button',{name:'新增文字',exact:true}).click();await fontIs(page,'chenyuluoyan');
    await openFonts(page);await page.getByLabel('我的最愛：辰宇落雁體',{exact:true}).uncheck();await expect(page.locator('.font-default')).toContainText('思源黑體 TC');await page.getByRole('button',{name:'我的最愛（0）',exact:true}).click();await expect(page.locator('.font-empty')).toContainText('尚未加入最愛');
});
