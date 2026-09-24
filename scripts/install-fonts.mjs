import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const families = [
 ['notosanstc','思源黑體 TC','繁體中文','黑體'], ['notoseriftc','思源宋體 TC','繁體中文','宋體'],
 ['lxgwwenkaitc','霞鶩文楷 TC','繁體中文','手寫'], ['huninn','jf open 粉圓','繁體中文','圓體'],
 ['iansui','芫荽','繁體中文','手寫'], ['chocolateclassicalsans','可可黑體','繁體中文','黑體'],
 ['chironheihk','昭源黑體','繁體中文','黑體'], ['chironsunghk','昭源宋體','繁體中文','宋體'],
 ['chirongoroundtc','昭源環方','繁體中文','圓體'], ['chenyuluoyan','辰宇落雁體','繁體中文','手寫'],
 ['inter','Inter','Latin','無襯線'], ['roboto','Roboto','Latin','無襯線'], ['opensans','Open Sans','Latin','無襯線'],
 ['montserrat','Montserrat','Latin','無襯線'], ['poppins','Poppins','Latin','幾何'], ['lato','Lato','Latin','無襯線'],
 ['oswald','Oswald','Latin','標題'], ['raleway','Raleway','Latin','無襯線'], ['playfairdisplay','Playfair Display','Latin','襯線'],
 ['merriweather','Merriweather','Latin','襯線'], ['bebasneue','Bebas Neue','Latin','標題'], ['caveat','Caveat','Latin','手寫'],
 ['pacifico','Pacifico','Latin','手寫'], ['spacegrotesk','Space Grotesk','Latin','幾何'],
 ['dmsans','DM Sans','Latin','無襯線'], ['manrope','Manrope','Latin','無襯線'],
 ['outfit','Outfit','Latin','幾何'], ['plusjakartasans','Plus Jakarta Sans','Latin','幾何'],
 ['nunito','Nunito','Latin','圓體'], ['quicksand','Quicksand','Latin','圓體'],
 ['barlow','Barlow','Latin','無襯線'], ['worksans','Work Sans','Latin','無襯線'],
 ['librebaskerville','Libre Baskerville','Latin','襯線'], ['lora','Lora','Latin','襯線'],
 ['cormorantgaramond','Cormorant Garamond','Latin','襯線'], ['anton','Anton','Latin','標題'],
 ['righteous','Righteous','Latin','標題'], ['patrickhand','Patrick Hand','Latin','手寫'],
 ['dancingscript','Dancing Script','Latin','手寫'], ['jetbrainsmono','JetBrains Mono','Latin','等寬'],
];
const root=path.resolve('public/fonts'); await mkdir(root,{recursive:true}); const manifest=[];
const installed=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8').catch(e=>{if(e.code==='ENOENT')return '[]';throw e;}));
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
function download(url,dest) { execFileSync('curl',['--fail','--location','--silent','--show-error','--retry','3',url,'-o',dest],{maxBuffer:2*1024*1024}); }
for(const [id,label,language,category] of families){
 const cached=installed.find(f=>f.id===id);
 if(cached&&!process.argv.includes('--refresh')){
  const bytes=await readFile(path.join(root,cached.file)).catch(()=>null),license=await readFile(path.join(root,cached.license),'utf8').catch(()=>null);
  if(bytes&&hash(bytes)===cached.sha256&&license?.includes('SIL OPEN FONT LICENSE')){manifest.push({...cached,label,language,category});console.log(`✓ ${label} (verified local copy)`);continue;}
 }
 const dir=path.join(root,id);await mkdir(dir,{recursive:true});const base=`https://raw.githubusercontent.com/google/fonts/main/ofl/${id}`;
 let file,family,source;
 if(id==='chenyuluoyan'){
  const upstream='https://raw.githubusercontent.com/Chenyu-otf/chenyuluoyan_thin/main';
  file='ChenYuluoyan-2.0-Thin.ttf';family='ChenYuluoyan 2.0';source='https://github.com/Chenyu-otf/chenyuluoyan_thin';
  download(`${upstream}/${file}`,path.join(dir,file));download(`${upstream}/license.txt`,path.join(dir,'OFL.txt'));download(`${upstream}/README.md`,path.join(dir,'README.md'));
 }else{
 download(`${base}/METADATA.pb`,path.join(dir,'METADATA.pb'));const metadata=await readFile(path.join(dir,'METADATA.pb'),'utf8');
 if(!metadata.includes('license: "OFL"')) throw new Error(`${id}: expected OFL`);
 const blocks=[...metadata.matchAll(/fonts \{([\s\S]*?)\}/g)].map(m=>m[1]);
 const block=blocks.find(b=>b.includes('style: "normal"')&&b.includes('weight: 400'))??blocks[0];
 file=block.match(/filename: "([^"]+)"/)[1];family=metadata.match(/^name: "([^"]+)"/)[1];source=`https://github.com/google/fonts/tree/main/ofl/${id}`;
 download(`${base}/${encodeURIComponent(file)}`,path.join(dir,file));download(`${base}/OFL.txt`,path.join(dir,'OFL.txt'));
 }
 const license=await readFile(path.join(dir,'OFL.txt'),'utf8');if(!license.includes('SIL OPEN FONT LICENSE'))throw new Error(`${id}: invalid license`);
 manifest.push({id,family,label,language,category,file:`${id}/${file}`,license:`${id}/OFL.txt`,source,sha256:hash(await readFile(path.join(dir,file)))});
 console.log(`✓ ${label}`);
}
await writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
await writeFile(path.join(root,'fonts.css'),manifest.map(f=>`@font-face{font-family:'${f.family}';src:url('/fonts/${f.file}') format('truetype');font-weight:100 900;font-style:normal;font-display:swap;}`).join('\n')+'\n');
console.log(`${manifest.length} fonts installed with original OFL licenses and SHA-256 records.`);
