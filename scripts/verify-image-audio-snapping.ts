import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkImageAudioSnapping } from '../tests/ui/image-audio-snapping-checks';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-image-audio-snap-'));
const binary=process.env.MYCUT_TEST_APP??path.resolve('release/0.6.21/mac/MyCut.app/Contents/MacOS/MyCut');
const env:Record<string,string>={...Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>entry[1]!==undefined)),MYCUT_DATA_DIR:root};delete env.ELECTRON_RUN_AS_NODE;
let app:Awaited<ReturnType<typeof electron.launch>>|undefined;
try{
  app=await electron.launch({executablePath:binary,env,args:[`--user-data-dir=${path.join(root,'profile')}`],timeout:30000});
  const page=await app.firstWindow(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(30000);
  page.on('dialog',dialog=>{if(dialog.type()!=='beforeunload')errors.push(`Unexpected dialog: ${dialog.message()}`);void dialog.accept().catch(()=>{});});
  await page.getByRole('heading',{name:'我的專案',exact:true}).waitFor();
  await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.webContents.setBackgroundThrottling(false);win.setContentSize(1500,950);win.setIgnoreMouseEvents(true);win.showInactive();});
  await fs.mkdir('test-results',{recursive:true});await checkImageAudioSnapping(page,'main');await checkImageAudioSnapping(page,'logo');await checkImageAudioSnapping(page,'main',true);expect(errors).toEqual([]);
  const report={version:await app.evaluate(({app})=>app.getVersion()),testedAt:new Date().toISOString(),platform:process.platform,arch:process.arch,packagedApp:true,importedImageAndAudio:true,longAudio:true,backgroundAndUpperImage:true,fitAndScrolledTimeline:true,snapRelease:true,undoRedo:true,persistence:true,errors};
  await fs.writeFile('docs/image-audio-snapping-desktop-test-result.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{
  if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}
  await fs.rm(root,{recursive:true,force:true});
}
