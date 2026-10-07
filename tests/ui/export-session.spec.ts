import { test, expect } from '@playwright/test';
import { checkExportSession } from './export-session-checks';

test('export only shows the current job and confirms cancellation before stopping and closing',async({page})=>{
 await page.goto('/');await checkExportSession(page);
});

test('cancel during creation tracks the late job, survives cancellation failure, and can retry',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'開啟示範專案',exact:true}).click();await page.getByRole('button',{name:'匯出影片',exact:true}).click();
 let release!:()=>void;const pending=new Promise<void>(resolve=>release=resolve),removed:string[]=[];
 const id='5356cb4c-cd8c-43b3-b830-3e5330577150';
 const job={id,name:'延遲建立的匯出',status:'queued',progress:0,completedSegments:0,totalSegments:1,duration:12,createdAt:new Date().toISOString(),settings:{resolution:1080,quality:'high',encoder:'libx264'}};
 await page.route('**/api/exports',async route=>{if(route.request().method()!=='POST')return route.continue();await pending;await route.fulfill({json:job});});
 await page.route(`**/api/exports/${id}`,async route=>{if(route.request().method()==='DELETE'){removed.push(id);await route.fulfill(removed.length===1?{status:500,json:{error:'取消暫時失敗，請重試'}}:{json:{ok:true}});}else await route.fulfill({json:job});});
 const dialog=page.getByRole('dialog',{name:'匯出影片',exact:true}),confirm=page.getByRole('alertdialog',{name:'取消匯出？',exact:true});
 await dialog.getByRole('button',{name:'開始匯出',exact:true}).click();await expect(dialog).toContainText('正在準備匯出');await dialog.getByRole('button',{name:'關閉',exact:true}).click();await confirm.getByRole('button',{name:'否',exact:true}).click();expect(removed).toEqual([]);
 await dialog.press('Escape');await confirm.getByRole('button',{name:'確定',exact:true}).click();await expect(confirm.getByRole('button',{name:'正在取消…',exact:true})).toBeDisabled();release();
 await expect(confirm).toHaveCount(0);await expect(dialog).toBeVisible();await expect(dialog.locator('.job-heading')).toContainText(job.name);await expect(page.getByRole('status')).toContainText('取消暫時失敗');expect(removed).toEqual([id]);
 await dialog.getByRole('button',{name:'取消匯出',exact:true}).click();await confirm.getByRole('button',{name:'確定',exact:true}).click();await expect(dialog).toHaveCount(0);expect(removed).toEqual([id,id]);await page.getByRole('button',{name:'匯出影片',exact:true}).click();await expect(page.locator('.export-job')).toHaveCount(0);
});
