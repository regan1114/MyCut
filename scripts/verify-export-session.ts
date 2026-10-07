import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkExportSession } from '../tests/ui/export-session-checks';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-export-session-'));
const binary=process.env.MYCUT_TEST_APP??path.resolve('release/0.6.20/mac/MyCut.app/Contents/MacOS/MyCut');
const env:Record<string,string>={...Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>entry[1]!==undefined)),MYCUT_DATA_DIR:root};delete env.ELECTRON_RUN_AS_NODE;
let app:Awaited<ReturnType<typeof electron.launch>>|undefined;
let origin:string|undefined;
try{
  app=await electron.launch({executablePath:binary,env,args:[`--user-data-dir=${path.join(root,'profile')}`],timeout:30000});
  const page=await app.firstWindow(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(30000);
  page.on('dialog',dialog=>{if(dialog.type()!=='beforeunload')errors.push(dialog.message());void dialog.accept().catch(()=>{});});
  await page.getByRole('heading',{name:'我的專案',exact:true}).waitFor();
  origin=page.url();
  await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.webContents.setBackgroundThrottling(false);win.setContentSize(1500,950);win.setIgnoreMouseEvents(true);win.showInactive();});
  await checkExportSession(page,async()=>{await app!.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());});expect(errors).toEqual([]);
  const report={version:await app.evaluate(({app})=>app.getVersion()),testedAt:new Date().toISOString(),platform:process.platform,arch:process.arch,packagedApp:true,currentJobOnly:true,confirmation:true,declineKeepsExporting:true,confirmStopsAndCloses:true,nativeWindowCloseConfirmation:true,pauseResume:true,completedMovie:true,noHistoryOnReopen:true,errors};
  await fs.writeFile('docs/export-session-desktop-test-result.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{
  if(origin)try{const jobs=await(await fetch(new URL('/api/exports',origin))).json() as {id:string}[];await Promise.allSettled(jobs.map(job=>fetch(new URL(`/api/exports/${job.id}`,origin),{method:'DELETE',headers:{'X-MyCut':'1'}})));}catch{}
  if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}
  await fs.rm(root,{recursive:true,force:true});
}
