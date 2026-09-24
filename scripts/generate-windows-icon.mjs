import fs from 'node:fs/promises';
import {Resvg} from '@resvg/resvg-js';
const svg=await fs.readFile('resources/icon.svg','utf8');
const sizes=[16,32,48,64,128,256];
const images=sizes.map(width=>new Resvg(svg,{fitTo:{mode:'width',value:width}}).render().asPng());
const header=Buffer.alloc(6+16*images.length);header.writeUInt16LE(1,2);header.writeUInt16LE(images.length,4);let offset=header.length;
for(let i=0;i<images.length;i++){const base=6+i*16;header[base]=header[base+1]=sizes[i]===256?0:sizes[i];header.writeUInt16LE(1,base+4);header.writeUInt16LE(32,base+6);header.writeUInt32LE(images[i].length,base+8);header.writeUInt32LE(offset,base+12);offset+=images[i].length;}
await fs.writeFile('resources/icon.ico',Buffer.concat([header,...images]));
