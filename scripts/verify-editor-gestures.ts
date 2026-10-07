import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkPreviewDrag, checkEmptyTrackCleanup, checkZoomedTimelineDrag } from '../tests/ui/editor-gestures-checks';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-editor-gestures-'));
const binary=process.env.MYCUT_TEST_APP??path.resolve(`release/${process.arch==='arm64'?'mac-arm64':'mac'}/MyCut.app/Contents/MacOS/MyCut`);
const env:Record<string,string>={...Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>entry[1]!==undefined)),MYCUT_DATA_DIR:root};delete env.ELECTRON_RUN_AS_NODE;
let app:Awaited<ReturnType<typeof electron.launch>>|undefined;
try{
  app=await electron.launch({executablePath:binary,env,args:[`--user-data-dir=${path.join(root,'profile')}`],timeout:30000});
  const page=await app.firstWindow(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  page.setDefaultTimeout(30000);
  page.on('dialog',dialog=>{if(dialog.type()!=='beforeunload')errors.push(`Unexpected dialog: ${dialog.message()}`);void dialog.accept().catch(()=>{});});
  await page.getByRole('heading',{name:'我的專案',exact:true}).waitFor();
  await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.webContents.setBackgroundThrottling(false);win.setContentSize(1500,950);win.setIgnoreMouseEvents(true);win.showInactive();});
  for(const animated of [false,true]){console.log(`Checking packaged logo drag (animated: ${animated})`);await checkPreviewDrag(page,animated,false);}
  console.log('Checking packaged empty track cleanup');await checkEmptyTrackCleanup(page,false);
  for(const start of [0,600]){console.log(`Checking packaged first image drag after zoom (start: ${start})`);await checkZoomedTimelineDrag(page,start);}
  expect(errors).toEqual([]);
  const report={version:await app.evaluate(({app})=>app.getVersion()),testedAt:new Date().toISOString(),platform:process.platform,arch:process.arch,packagedApp:true,logoDrag:true,animatedLogoDrag:true,lockedLogo:true,undoRedo:true,persistence:true,legacyEmptyTrackCleanup:true,moveAndDeleteTrackCleanup:true,zoomedTimelineDragKeepsViewport:true,zoomedImageTiming:true,errors};
  await fs.writeFile('docs/editor-gestures-desktop-test-result.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{
  if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}
  await fs.rm(root,{recursive:true,force:true});
}
