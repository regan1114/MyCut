import { _electron as electron, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkSnapshots, checkEdgeScroll, checkFitSelection } from '../tests/ui/project-improvements-checks';
import { checkTimelineWheelZoom } from '../tests/ui/timeline-wheel-checks';
import type { AppInfo } from '../src/api';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'mycut-project-improvements-'));
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
 const info=await page.evaluate(()=>window.mycut!.appInfo()) as AppInfo;expect(info.version).toBe(version);expect(info.packaged).toBe(true);expect(info.platform).toBe(process.platform);expect(info.arch).toBe(process.arch);
 expect(JSON.parse(await fs.readFile(path.join(root,'profile/running-version.json'),'utf8')).version).toBe(version);
 await page.getByRole('button',{name:'關於 MyCut',exact:true}).click();await expect(page.getByRole('dialog',{name:'關於 MyCut'})).toContainText(version);await page.screenshot({path:'test-results/desktop-version-info.png',fullPage:true});await page.keyboard.press('Escape');
 await checkSnapshots(page);for(const mode of ['move','left','right'] as const)await checkEdgeScroll(page,mode,mode==='right'?'blur':'up');await checkFitSelection(page);
 await checkTimelineWheelZoom(page,process.platform==='darwin'?'Meta':'Alt');expect(errors).toEqual([]);
 const report={version,testedAt:new Date().toISOString(),platform:process.platform,arch:process.arch,packagedApp:true,inputSource:'Playwright keyboard/mouse and DOM events; physical mouse not verified',versionIpc:true,runningVersionRecord:true,instanceConflictDialog:'message selection and version record unit-tested; native collision dialog not automated',snapshotsCapturePendingEdits:true,restoreCreatesIndependentProject:true,originalProjectPreserved:true,edgeScrollMoveAndBothTrimEdges:true,edgeScrollStopsOnReleaseAndBlur:true,undoRedo:true,fitSelection:true,commandWheelRegression:true,errors};
 await fs.writeFile('docs/project-improvements-desktop-test-result.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{if(app){await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}await fs.rm(root,{recursive:true,force:true});}
