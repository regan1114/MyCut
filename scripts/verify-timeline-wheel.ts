import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkTimelineWheelRecovery, checkTimelineWheelZoom } from '../tests/ui/timeline-wheel-checks';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-timeline-wheel-'));
const version=(JSON.parse(await fs.readFile('package.json','utf8')) as {version:string}).version;
const binary=process.env.MYCUT_TEST_APP??path.resolve(`release/${version}/mac/MyCut.app/Contents/MacOS/MyCut`);
const env:Record<string,string>={...Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>entry[1]!==undefined)),MYCUT_DATA_DIR:root};delete env.ELECTRON_RUN_AS_NODE;
let app:Awaited<ReturnType<typeof electron.launch>>|undefined;
try{
  app=await electron.launch({executablePath:binary,env,args:[`--user-data-dir=${path.join(root,'profile')}`],timeout:30000});
  const page=await app.firstWindow(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(30000);
  page.on('dialog',dialog=>{if(dialog.type()!=='beforeunload')errors.push(dialog.message());void dialog.accept().catch(()=>{});});
  await page.getByRole('heading',{name:'我的專案',exact:true}).waitFor();
  await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.webContents.setBackgroundThrottling(false);win.setContentSize(1500,950);win.setIgnoreMouseEvents(true);win.showInactive();});
  const modifier=process.platform==='darwin'?'Meta':'Alt';
  await checkTimelineWheelZoom(page,modifier);await page.getByRole('button',{name:'返回專案首頁',exact:true}).click();await expect(page.locator('.project-home')).toBeVisible();
  for(const scenario of ['modifier','axis','interrupted-gesture'] as const)await checkTimelineWheelRecovery(page,scenario,modifier);
  expect(errors).toEqual([]);
  const report={version:await app.evaluate(({app})=>app.getVersion()),testedAt:new Date().toISOString(),platform:process.platform,arch:process.arch,packagedApp:true,inputSource:'Playwright keyboard/mouse and DOM event replay; physical mouse not verified',zoomShortcut:modifier==='Meta'?'Command+wheel':'Alt+wheel',leftAndRightModifier:true,alternateModifierDoesNotZoom:true,clipArea:true,ruler:true,emptyTrack:true,toolbar:true,trackHeader:true,footer:true,pointerTimePreserved:true,ordinaryScrolling:true,projectTimingUnchanged:true,toolbarAndClipWidthsSynchronized:true,missingWheelModifier:true,horizontalWheel:true,interruptedGestureRecovery:true,modifierClearedOnKeyupAndBlur:true,errors};
  await fs.writeFile('docs/timeline-wheel-desktop-test-result.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{
  if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}
  await fs.rm(root,{recursive:true,force:true});
}
