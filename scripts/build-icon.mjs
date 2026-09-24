import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs/promises';
await fs.mkdir('resources',{recursive:true});
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect x="24" y="24" width="976" height="976" rx="218" fill="#202020"/><rect x="86" y="86" width="852" height="852" rx="180" fill="#f5f5f5"/><g fill="none" stroke="#141414" stroke-width="58" stroke-linecap="round" stroke-linejoin="round"><circle cx="338" cy="345" r="84"/><circle cx="338" cy="679" r="84"/><path d="M399 405 736 756M399 619 743 267"/></g><circle cx="510" cy="516" r="26" fill="#f5f5f5"/></svg>';
await fs.writeFile('resources/icon.svg',svg);await fs.writeFile('resources/icon-1024.png',new Resvg(svg).render().asPng());
const chunks=[];
for(const [size,type] of [[16,'icp4'],[32,'icp5'],[64,'icp6'],[128,'ic07'],[256,'ic08'],[512,'ic09'],[1024,'ic10']]){
 const png=new Resvg(svg,{fitTo:{mode:'width',value:size}}).render().asPng();const header=Buffer.alloc(8);header.write(type,0,4,'ascii');header.writeUInt32BE(png.length+8,4);chunks.push(header,png);
}
const payload=Buffer.concat(chunks);const header=Buffer.alloc(8);header.write('icns',0,4,'ascii');header.writeUInt32BE(payload.length+8,4);await fs.writeFile('resources/icon.icns',Buffer.concat([header,payload]));
