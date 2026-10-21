import {z} from 'zod';
import {ProjectSchema} from './model';
export const SelectionExportSchema=z.object({id:z.string().uuid(),project:ProjectSchema,clipIds:z.array(z.string().uuid()).min(1).max(100)});
export type SelectionExportRequest=z.infer<typeof SelectionExportSchema>;
export function selectedExportClips(value:unknown){
 const request=SelectionExportSchema.parse(value),ids=new Set(request.clipIds);
 const clips=request.project.clips.filter(c=>ids.has(c.id));
 if(clips.length!==ids.size||clips.some(c=>!['video','image','audio'].includes(c.kind)||!c.mediaId))throw new Error('只能匯出選取的影片、圖片或聲音區塊');
 return {...request,clips:clips.sort((a,b)=>a.start-b.start)};
}
