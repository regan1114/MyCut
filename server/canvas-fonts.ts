import path from 'node:path';
import { GlobalFonts } from '@napi-rs/canvas';
import type { FontInfo } from '../shared/model';
const loaded=new Set<string>();
export function registerCanvasFonts(fonts:FontInfo[],root:string,selected='notosanstc'){
 for(const font of fonts.filter(f=>f.id===selected||f.id==='notosanstc')){if(font.missing)continue;if(font.custom){if(!GlobalFonts.has(font.family))throw new Error(`找不到自訂字型：${font.label}`);continue;}const file=path.join(root,font.file);if(!loaded.has(file)){if(!GlobalFonts.registerFromPath(file,font.family))throw new Error(`無法載入字型：${font.label}`);loaded.add(file);}}
}
