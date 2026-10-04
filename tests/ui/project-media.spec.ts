import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import { makeClip, newProject, type Project } from '../../shared/model';
import { nextProjectName } from '../../shared/projects';

const headers={'X-MyCut':'1'};
const saved=async(page:Page,id:string)=>{await expect(page.getByText('已儲存至本機',{exact:true})).toBeVisible();return await(await page.request.get(`/api/projects/${id}`)).json() as Project;};
const upload=async(page:Page,name:string)=>{const response=await page.request.post('/api/media/upload',{headers,multipart:{file:{name,mimeType:'audio/wav',buffer:await fs.readFile('tests/fixtures/original-en.wav')}}});expect(response.ok()).toBeTruthy();return response.json();};
const open=async(page:Page,p:Project)=>{await page.request.put(`/api/projects/${p.id}`,{headers,data:p});await page.goto('/');await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();};

test('new date-named projects have separate bins; unused imports survive reload and can be deleted and restored',async({page})=>{
  const uploaded=await upload(page,'舊專案歌曲.wav'),old=newProject();old.name='素材隔離舊專案';old.clips=[makeClip({kind:'audio',mediaId:uploaded.imported[0],trackId:'music',start:0,duration:90})];
  await open(page,old);await expect(page.locator('.media-card')).toHaveCount(1);await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();
  const names=[...await(await page.request.get('/api/projects')).json(),...await(await page.request.get('/api/projects?trash=1')).json()];const firstName=nextProjectName(names.map((p:Project)=>p.name));
  await page.getByRole('button',{name:'建立新專案',exact:true}).click();await expect(page.locator('.project-switch')).toContainText(firstName);await expect(page.locator('.media-card')).toHaveCount(0);
  const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'匯入素材',exact:true}).click();await(await chooser).setFiles({name:'本專案歌曲.wav',mimeType:'audio/wav',buffer:await fs.readFile('tests/fixtures/original-en.wav')});
  await expect(page.locator('.media-card')).toHaveCount(1);await expect(page.getByRole('button',{name:'加入 舊專案歌曲.wav',exact:true})).toHaveCount(0);await expect(page.locator('.timeline-footer')).toContainText('0 個片段');
  await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await page.reload();await page.getByRole('button',{name:`開啟 ${firstName}`,exact:true}).click();await expect(page.getByRole('button',{name:'加入 本專案歌曲.wav',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'刪除素材 本專案歌曲.wav',exact:true}).click();await expect(page.locator('.media-card')).toHaveCount(0);await expect(page.getByRole('dialog',{name:'刪除素材',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:/^復原/}).click();await expect(page.locator('.media-card')).toHaveCount(1);await page.getByRole('button',{name:/^重做/}).click();await expect(page.locator('.media-card')).toHaveCount(0);
  const project=(await(await page.request.get('/api/projects')).json()).find((p:Project)=>p.name===firstName);expect((await saved(page,project.id)).mediaIds).toEqual([]);
  await page.locator('.project-switch').click();const secondName=nextProjectName([...names.map((p:Project)=>p.name),firstName]);await page.getByRole('dialog',{name:'專案管理'}).getByRole('button',{name:'新增專案',exact:true}).click();await expect(page.locator('.project-switch')).toContainText(secondName);await expect(page.locator('.media-card')).toHaveCount(0);
  await page.screenshot({path:'test-results/new-project-empty-bin.png',fullPage:true});
  await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await page.getByRole('button',{name:`開啟 ${old.name}`,exact:true}).click();await expect(page.getByRole('button',{name:'加入 舊專案歌曲.wav',exact:true})).toBeVisible();
});

test('deleting a used asset removes its clips only from this project, supports cancel and undo, and persists',async({page})=>{
  const uploaded=await upload(page,'共享歌曲.wav'),id=uploaded.imported[0],p=newProject();p.name='刪除素材測試';p.mediaIds=[id];p.clips=[makeClip({kind:'audio',mediaId:id,trackId:'music',start:0,duration:60}),makeClip({kind:'audio',mediaId:id,trackId:'music',start:60,duration:60}),makeClip({kind:'text',trackId:'text',start:0,duration:90,text:'保留字幕'})];
  const other={...newProject(),name:'其他專案保留歌曲',mediaIds:[id],clips:p.clips};await page.request.put(`/api/projects/${other.id}`,{headers,data:other});await open(page,p);
  const remove=page.getByRole('button',{name:'刪除素材 共享歌曲.wav',exact:true}),dialog=page.getByRole('dialog',{name:'刪除素材',exact:true});
  await remove.click();await expect(dialog).toContainText('2 個片段');await dialog.getByRole('button',{name:'取消',exact:true}).click();await expect(page.locator('.clip-audio')).toHaveCount(2);
  await remove.click();await page.screenshot({path:'test-results/delete-project-media.png',fullPage:true});await dialog.getByRole('button',{name:'刪除素材與片段',exact:true}).click();await expect(page.locator('.media-card')).toHaveCount(0);await expect(page.locator('.clip-audio')).toHaveCount(0);await expect(page.locator('.clip-text')).toHaveCount(1);
  await page.getByRole('button',{name:/^復原/}).click();await expect(page.locator('.media-card')).toHaveCount(1);await expect(page.locator('.clip-audio')).toHaveCount(2);await page.getByRole('button',{name:/^重做/}).click();expect((await saved(page,p.id)).mediaIds).toEqual([]);
  await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await page.reload();await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();await expect(page.locator('.media-card')).toHaveCount(0);
  await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await page.getByRole('button',{name:`開啟 ${other.name}`,exact:true}).click();await expect(page.locator('.clip-audio')).toHaveCount(2);await expect(remove).toBeVisible();expect((await page.request.get(`/media/${id}/original`)).ok()).toBeTruthy();
});

test('an import completing after a project switch belongs to its original project',async({page})=>{
  const result=await upload(page,'稍後匯入.wav'),origin=newProject(),other=newProject();origin.name='匯入原專案';other.name='匯入期間的新專案';await page.request.put(`/api/projects/${other.id}`,{headers,data:other});await open(page,origin);
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);await page.route('**/api/media/upload',async route=>{await gate;await route.fulfill({json:result});});
  const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'匯入素材',exact:true}).click();await(await chooser).setFiles('tests/fixtures/original-en.wav');await expect(page.getByRole('button',{name:'正在匯入…',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();release();await page.getByRole('button',{name:`開啟 ${other.name}`,exact:true}).click();await expect(page.locator('.media-card')).toHaveCount(0);
  await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await page.getByRole('button',{name:`開啟 ${origin.name}`,exact:true}).click();await expect(page.getByRole('button',{name:'加入 稍後匯入.wav',exact:true})).toBeVisible();
});

test('recorded narration is registered in this project bin and survives reopening',async({page,context})=>{
  await context.grantPermissions(['microphone']);const p=newProject();p.name='旁白素材保存';await open(page,p);await page.getByRole('navigation').getByRole('button',{name:'音訊',exact:true}).click();await page.getByRole('button',{name:'錄製旁白',exact:true}).click();
  await expect(page.getByRole('button',{name:'停止錄音並加入素材',exact:true})).toBeVisible();await page.waitForTimeout(1200);await page.getByRole('button',{name:'停止錄音並加入素材',exact:true}).click();await expect(page.locator('.media-card')).toHaveCount(1,{timeout:30000});
  const project=await saved(page,p.id);expect(project.mediaIds).toHaveLength(1);expect(project.clips).toHaveLength(0);await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await page.reload();await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();await expect(page.locator('.media-card')).toHaveCount(1);await expect(page.locator('.media-name')).toContainText('旁白');
});

test('audio ignores media type filters and both library views keep their own search',async({page})=>{
  const uploaded=await upload(page,'音訊篩選歌曲.wav'),p=newProject();p.name='素材音訊獨立篩選';p.mediaIds=uploaded.imported;
  await open(page,p);
  const nav=page.getByRole('navigation'),panel=page.locator('.library-panel');
  await panel.locator('.filter-chips').getByRole('button',{name:'影片',exact:true}).click();
  await page.getByLabel('搜尋素材').fill('影片名稱');await expect(panel.locator('.media-card')).toHaveCount(0);
  await nav.getByRole('button',{name:'音訊',exact:true}).click();await expect(page.getByLabel('搜尋音訊')).toHaveValue('');
  await expect(panel.locator('.media-card')).toHaveCount(1);await expect(panel.getByRole('button',{name:'錄製旁白',exact:true})).toBeVisible();
  await page.getByLabel('搜尋音訊').fill('沒有這首');await expect(panel.locator('.media-card')).toHaveCount(0);
  await nav.getByRole('button',{name:'素材',exact:true}).click();await expect(page.getByLabel('搜尋素材')).toHaveValue('影片名稱');
  await expect(panel.locator('.filter-chips').getByRole('button',{name:'影片',exact:true})).toHaveClass('active');
  await panel.locator('.filter-chips').getByRole('button',{name:'全部',exact:true}).click();await page.getByLabel('搜尋素材').fill('');
  await expect(panel.locator('.media-card')).toHaveCount(1);
  await nav.getByRole('button',{name:'音訊',exact:true}).click();await expect(page.getByLabel('搜尋音訊')).toHaveValue('沒有這首');
  await page.getByLabel('搜尋音訊').fill('');await expect(panel.locator('.media-card')).toHaveCount(1);
  await page.screenshot({path:'test-results/audio-independent-filter.png',fullPage:true});
});
