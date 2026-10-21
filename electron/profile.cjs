const fs=require('node:fs');
const path=require('node:path');
// Reuse the legacy profile in place: its media records contain absolute paths.
function profilePath(appData,current,{isolated=false}={}){
 if(isolated)return current;
 const legacy=path.join(appData,'MyCut');
 return !fs.existsSync(path.join(current,'workspace','projects'))&&fs.existsSync(path.join(legacy,'workspace','projects'))?legacy:current;
}
module.exports={profilePath};
