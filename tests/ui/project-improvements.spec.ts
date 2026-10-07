import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
const {version}=createRequire(import.meta.url)('../../package.json');
import { newProject } from '../../shared/model';
import { checkSnapshots, checkEdgeScroll, checkFitSelection } from './project-improvements-checks';

test('snapshots capture pending edits and restore a new project while preserving the original',async({page})=>{await page.goto('/');await checkSnapshots(page);});
for(const mode of ['move','left','right'] as const)test(`edge scroll follows ${mode} edits and supports undo`,async({page})=>{await page.goto('/');await checkEdgeScroll(page,mode,mode==='right'?'blur':'up');});
test('fit selection frames multiple clips and keeps edits unchanged',async({page})=>{await page.goto('/');await checkFitSelection(page);});

test('snapshot failures remain visible and retry works',async({page})=>{
 const p=newProject();p.name='快照錯誤重試';await page.request.put(`/api/projects/${p.id}`,{headers:{'X-MyCut':'1'},data:p});await page.goto('/');await page.getByRole('button',{name:`專案快照 ${p.name}`,exact:true}).click();const dialog=page.getByRole('dialog',{name:'專案快照',exact:true});await expect(dialog).toContainText('尚無快照');await expect(dialog.getByRole('button',{name:'還原為新專案',exact:true})).toBeDisabled();
 await page.route(`**/api/projects/${p.id}/snapshots`,route=>route.request().method()==='POST'?route.fulfill({status:500,json:{error:'快照儲存測試錯誤'}}):route.continue());await dialog.getByRole('button',{name:'建立快照',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('快照儲存測試錯誤');await page.unroute(`**/api/projects/${p.id}/snapshots`);await dialog.getByRole('button',{name:'建立快照',exact:true}).click();await expect(dialog.locator('.snapshot-list>button')).toHaveCount(1);
 await page.route('**/snapshots/*/restore',route=>route.fulfill({status:500,json:{error:'還原測試錯誤'}}));await dialog.getByRole('button',{name:'還原為新專案',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('還原測試錯誤');await expect(dialog.getByRole('button',{name:'還原為新專案',exact:true})).toBeEnabled();await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
});

test('version identification appears in home and editor',async({page})=>{
 await page.goto('/');await expect(page.getByRole('button',{name:'關於 MyCut',exact:true})).toHaveText('v'+version);await page.getByRole('button',{name:'關於 MyCut',exact:true}).click();await expect(page.getByRole('dialog',{name:'關於 MyCut'})).toContainText(version);await page.keyboard.press('Escape');await page.getByRole('button',{name:'建立新專案',exact:true}).click();await expect(page.getByRole('button',{name:'關於 MyCut',exact:true})).toHaveText('v'+version);
});

test('a local newer build prompts once and the version information remains accessible',async({page})=>{
 await page.addInitScript(()=>{window.mycut={platform:'darwin',appInfo:async()=>({version:'0.6.24',platform:'darwin',arch:'x64',packaged:true,appPath:'/example/MyCut.app',newerVersion:'0.6.25'})} as never;});await page.goto('/');const dialog=page.getByRole('dialog',{name:'關於 MyCut'});await expect(dialog).toContainText('本機已有較新的 0.6.25');await expect(dialog).toContainText('/example/MyCut.app');await page.keyboard.press('Escape');await page.getByRole('button',{name:'建立新專案',exact:true}).click();await expect(dialog).toHaveCount(0);await page.getByRole('button',{name:'關於 MyCut',exact:true}).click();await expect(dialog).toContainText('本機已有較新的 0.6.25');
});
