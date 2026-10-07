import { expect, type Page } from '@playwright/test';
import { makeClip, newProject, type ExportJob } from '../../shared/model';

export async function checkExportSession(page:Page,closeEditor?:()=>Promise<void>){
 const url=(pathname:string)=>new URL(pathname,page.url()).href,headers={'X-MyCut':'1'},settings={resolution:720,quality:'standard',encoder:'libx264'};
 const p=newProject();p.name='本次匯出與取消';p.clips=[makeClip({kind:'shape',trackId:'main',start:0,duration:9000})];
 const old={...newProject(),name:'不應出現的歷史匯出',clips:[makeClip({kind:'shape',trackId:'main',start:0,duration:15})]};
 const history=await(await page.request.post(url('/api/exports'),{headers,data:{project:old,settings}})).json() as ExportJob;
 await expect.poll(async()=>(await(await page.request.get(url(`/api/exports/${history.id}`))).json()).status,{timeout:30000}).toBe('completed');
 await page.request.put(url(`/api/projects/${p.id}`),{headers,data:p});await page.goto(url('/'));await page.getByRole('button',{name:`開啟 ${p.name}`,exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'匯出影片',exact:true}),confirm=page.getByRole('alertdialog',{name:'取消匯出？',exact:true});
 await page.getByRole('button',{name:'匯出影片',exact:true}).click();await expect(dialog.locator('.export-job')).toHaveCount(0);await expect(dialog).not.toContainText(old.name);
 await dialog.getByLabel('匯出解析度').selectOption('720');
 const response=page.waitForResponse(r=>r.url()===url('/api/exports')&&r.request().method()==='POST');await dialog.getByRole('button',{name:'開始匯出',exact:true}).click();const job=await(await response).json() as ExportJob;
 const read=async()=>await(await page.request.get(url(`/api/exports/${job.id}`))).json() as ExportJob;
 await expect(dialog.locator('.export-job')).toHaveCount(1);await expect(dialog.locator('.job-heading')).toContainText(p.name);await expect(dialog.getByRole('button',{name:'開始匯出',exact:true})).toBeDisabled();
 await dialog.getByRole('button',{name:'取消匯出',exact:true}).click();await expect(confirm).toBeVisible();await expect(confirm.getByRole('button',{name:'否',exact:true})).toBeFocused();
 const before=(await read()).progress;await expect.poll(async()=>(await read()).progress,{timeout:15000}).toBeGreaterThan(before);
 await page.screenshot({path:'test-results/export-cancel-confirm.png',fullPage:true});await confirm.getByRole('button',{name:'否',exact:true}).click();await expect(confirm).toHaveCount(0);await expect(dialog).toBeVisible();expect((await read()).status).toBe('running');
 await dialog.getByRole('button',{name:'暫停',exact:true}).click();await expect(dialog.locator('.job-status')).toContainText('已暫停');await dialog.getByRole('button',{name:'繼續',exact:true}).click();await expect(dialog.locator('.job-status')).toContainText('正在匯出');
 if(closeEditor)await closeEditor();else await dialog.getByRole('button',{name:'關閉',exact:true}).click();await expect(confirm).toBeVisible();await confirm.getByRole('button',{name:'確定',exact:true}).click();await expect(confirm).toHaveCount(0);await expect(dialog).toHaveCount(0);
 expect((await page.request.get(url(`/api/exports/${job.id}`))).status()).toBe(404);
 await page.getByRole('button',{name:'匯出影片',exact:true}).click();await expect(dialog.locator('.export-job')).toHaveCount(0);await dialog.getByRole('button',{name:'關閉',exact:true}).click();
 await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await page.locator('.project-home').waitFor();
 const short={...newProject(),name:'完成後只保留當次工作',clips:old.clips};await page.request.put(url(`/api/projects/${short.id}`),{headers,data:short});await page.reload();await page.getByRole('button',{name:`開啟 ${short.name}`,exact:true}).click();
 await page.getByRole('button',{name:'匯出影片',exact:true}).click();await expect(dialog.locator('.export-job')).toHaveCount(0);await dialog.getByLabel('匯出解析度').selectOption('720');
 const completedResponse=page.waitForResponse(r=>r.url()===url('/api/exports')&&r.request().method()==='POST');await dialog.getByRole('button',{name:'開始匯出',exact:true}).click();const completed=await(await completedResponse).json() as ExportJob;
 await expect(dialog.locator('.export-job.completed')).toHaveCount(1,{timeout:30000});expect((await page.request.get(url(`/api/exports/${completed.id}/file`))).ok()).toBe(true);
 await page.screenshot({path:'test-results/export-current-completed.png',fullPage:true});await dialog.getByRole('button',{name:'關閉',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(confirm).toHaveCount(0);
 await page.getByRole('button',{name:'匯出影片',exact:true}).click();await expect(dialog.locator('.export-job')).toHaveCount(0);await dialog.getByRole('button',{name:'關閉',exact:true}).click();
 await page.request.delete(url(`/api/exports/${history.id}`),{headers});
}
