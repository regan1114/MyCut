import { test,expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { startServer } from '../../server/index';
import type { FontInfo } from '../../shared/model';

test('custom font import applies, loads in preview and retains selection and favorites after reopening',async({page})=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-custom-font-ui-')),service=await startServer({root,port:0}),origin=`http://127.0.0.1:${service.port}`;
  try{
  const fonts=JSON.parse(await fs.readFile('public/fonts/manifest.json','utf8')) as FontInfo[],bytes=await fs.readFile(path.join('public/fonts',fonts.find(f=>f.id==='huninn')!.file));
  await page.goto(origin);await page.getByRole('button',{name:'建立新專案',exact:true}).click();await page.getByRole('navigation').getByRole('button',{name:'文字',exact:true}).click();await page.getByRole('button',{name:'新增文字',exact:true}).click();await page.locator('.font-picker>summary').click();
  await page.getByLabel('自訂字型檔',{exact:true}).setInputFiles({name:'自己的中文字型.ttf',mimeType:'font/ttf',buffer:bytes});
  await expect(page.locator('.font-picker')).toHaveAttribute('data-font-id',/^custom-/);const id=await page.locator('.font-picker').getAttribute('data-font-id');const imported=await(await page.request.get(`${origin}/api/fonts`)).json() as FontInfo[],font=imported.find(f=>f.id===id)!;
  expect(font.label).toBe('自己的中文字型');expect(font.custom).toBe(true);await expect.poll(()=>page.evaluate(async family=>(await document.fonts.load(`400 24px "${family}"`)).length,font.family)).toBeGreaterThan(0);
  expect((await page.request.get(`${origin}/api/fonts/${id}/file`)).ok()).toBeTruthy();await page.getByLabel('我的最愛：自己的中文字型',{exact:true}).check();await expect(page.locator('.font-default')).toContainText('自己的中文字型');
  await page.getByLabel('搜尋字型',{exact:true}).fill('自己的');await page.screenshot({path:'test-results/custom-font-import.png',fullPage:true});
  const name=await page.locator('.project-switch span').innerText();await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await page.locator('.project-home').waitFor();await page.reload();await page.getByRole('button',{name:`開啟 ${name}`,exact:true}).click();await page.locator('.timeline-clip').click();await expect(page.locator('.font-picker')).toHaveAttribute('data-font-id',id!);await page.locator('.font-picker>summary').click();await expect(page.getByLabel('我的最愛：自己的中文字型',{exact:true})).toBeChecked();
  await page.getByLabel('自訂字型檔',{exact:true}).setInputFiles({name:'重複.ttf',mimeType:'font/ttf',buffer:bytes});await expect(page.locator('.font-picker')).toHaveAttribute('data-font-id',id!);await expect(page.getByRole('button',{name:'匯入自己的字型',exact:true})).toBeEnabled();expect((await(await page.request.get(`${origin}/api/fonts`)).json()).filter((f:FontInfo)=>f.custom)).toHaveLength(1);
  }finally{service.close();await fs.rm(root,{recursive:true,force:true});}
});
