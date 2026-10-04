import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkTextTracks, checkMediaTracks } from '../tests/ui/track-settings-checks';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-track-desktop-'));
const binary=process.env.MYCUT_TEST_APP??path.resolve(`release/${process.arch==='arm64'?'mac-arm64':'mac'}/MyCut.app/Contents/MacOS/MyCut`);
const env:Record<string,string>={...Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>entry[1]!==undefined)),MYCUT_DATA_DIR:root};delete env.ELECTRON_RUN_AS_NODE;
let app:Awaited<ReturnType<typeof electron.launch>>|undefined;
try{
  app=await electron.launch({executablePath:binary,env,args:[`--user-data-dir=${path.join(root,'profile')}`],timeout:30000});
  const page=await app.firstWindow(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>{if(dialog.type()!=='beforeunload')errors.push(`Unexpected dialog: ${dialog.message()}`);void dialog.accept().catch(()=>{});});
  await page.getByRole('heading',{name:'我的專案',exact:true}).waitFor();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1500,950));
  console.log('Checking packaged text tracks');await checkTextTracks(page);console.log('Checking packaged media tracks');await checkMediaTracks(page);
  if(errors.length)throw new Error(errors.join('\n'));
  const version=await app.evaluate(({app})=>app.getVersion());
  const report={version,testedAt:new Date().toISOString(),platform:process.platform,arch:process.arch,packagedApp:true,textTrackStyle:true,independentTracks:true,batchStylePersistence:true,newTextTracks:true,undoRedo:true,reload:true,mediaOverlapPlacement:true,mediaDragDrop:true,trimAndSpeed:true,errors};
  await fs.writeFile('docs/track-settings-desktop-test-result.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{
  if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}
  await fs.rm(root,{recursive:true,force:true});
}
