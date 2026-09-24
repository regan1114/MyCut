const {app,BrowserWindow,dialog,ipcMain,shell}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const {randomUUID}=require('node:crypto');
const {pathToFileURL}=require('node:url');
let service,win,origin,quitting=false,editorOpen=false;
const isMac=process.platform==='darwin';
const ownsLock=app.requestSingleInstanceLock();
if(!ownsLock)app.quit();
app.on('second-instance',()=>{if(!origin)return;if(!win||win.isDestroyed())void makeWindow();else{if(win.isMinimized())win.restore();win.show();win.focus();}});
async function makeWindow(){
  editorOpen=false;
  win=new BrowserWindow({width:1500,height:960,minWidth:1120,minHeight:740,backgroundColor:'#101010',title:'MyCut',...(isMac?{titleBarStyle:'hiddenInset',trafficLightPosition:{x:18,y:23}}:{}),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  if(!isMac)win.setAutoHideMenuBar(true);
  win.on('close',event=>{if(!quitting&&editorOpen){event.preventDefault();win.webContents.send('mycut:close-editor');return;}if(!isMac&&!quitting&&(service?.jobs.isRunning||service?.speech.isRunning||service?.portable.isRunning)){event.preventDefault();win.minimize();}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==origin)event.preventDefault();});
  win.webContents.session.setPermissionRequestHandler((_contents,permission,callback)=>callback(permission==='media'));
  await win.loadURL(origin);
}
if(ownsLock)app.whenReady().then(async()=>{
  if(process.platform==='win32')app.setAppUserModelId('studio.mycut.desktop');
  const {startServer,safeFileName}=await import(pathToFileURL(path.join(app.getAppPath(),'dist-server/index.mjs')).href);
  service=await startServer({appRoot:app.getAppPath(),root:process.env.MYCUT_DATA_DIR??(app.isPackaged?path.join(app.getPath('userData'),'workspace'):path.join(app.getAppPath(),'.mycut')),port:0});origin=`http://127.0.0.1:${service.port}`;
  const handle=(name,fn)=>ipcMain.handle(name,async(event,...args)=>{if(new URL(event.senderFrame.url).origin!==origin)throw new Error('來源不符');return fn(...args);});
  handle('mycut:editor-state',active=>{if(typeof active!=='boolean')throw new Error('無效的編輯狀態');editorOpen=active;});
  handle('mycut:import',async()=>{const result=await dialog.showOpenDialog(win,{properties:['openFile','multiSelections'],filters:[{name:'媒體檔案',extensions:['mp4','mov','mkv','webm','m4v','avi','mp3','wav','m4a','aac','flac','ogg','png','jpg','jpeg','webp']}]});const errors=[],imported=[];for(const file of result.filePaths){try{const m=await service.library.import(file);imported.push(m.id);}catch(e){errors.push(`${path.basename(file)}：${e.message}`);}}return {media:service.library.list(),errors,imported};});
  handle('mycut:open-project',async()=>{const result=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'MyCut 專案',extensions:['json','mycut','mycutpack']}]});if(result.canceled||!result.filePaths[0])return null;if(path.extname(result.filePaths[0]).toLowerCase()==='.mycutpack')return service.portable.import(result.filePaths[0]);const p=JSON.parse(await fs.readFile(result.filePaths[0],'utf8'));return service.projects.save({...p,id:randomUUID(),name:String(p.name||'匯入專案').slice(0,110)+' · 匯入'});});
  handle('mycut:pack-project',async(project)=>{const result=await dialog.showSaveDialog(win,{defaultPath:`${safeFileName(String(project.name||'專案'))}.mycutpack`,filters:[{name:'MyCut 完整專案包',extensions:['mycutpack']}]});if(result.canceled||!result.filePath)return false;await service.portable.export(project,result.filePath);shell.showItemInFolder(result.filePath);return true;});
  handle('mycut:save-export',async(id)=>{const j=service.jobs.get(id);if(j.status!=='completed')return;const result=await dialog.showSaveDialog(win,{defaultPath:`${safeFileName(j.name)}.mp4`,filters:[{name:'MP4 影片',extensions:['mp4']}]});if(result.canceled||!result.filePath)return;await fs.copyFile(path.join(service.jobs.dir(j),'output.mp4'),result.filePath);shell.showItemInFolder(result.filePath);return true;});
  handle('mycut:relink',async(id)=>{const result=await dialog.showOpenDialog(win,{properties:['openFile']});if(result.filePaths[0])await service.library.relink(id,result.filePaths[0]);return service.library.list();});
  handle('mycut:reveal',()=>{shell.showItemInFolder(service.root);});
  await makeWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)makeWindow();});
}).catch(error=>{dialog.showErrorBox('MyCut 無法啟動',String(error.stack||error));app.quit();});
app.on('before-quit',()=>{quitting=true;service?.close();});
app.on('window-all-closed',()=>{if(isMac&&!quitting&&(service?.jobs.isRunning||service?.speech.isRunning||service?.portable.isRunning)){dialog.showMessageBox({type:'info',message:'MyCut 仍在背景處理工作',detail:'MyCut 會在背景繼續工作。可從 Dock 重新打開視窗。'});return;}app.quit();});
