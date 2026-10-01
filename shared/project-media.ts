import { ProjectSchema, type Project } from './model';
import { pruneTextTracks } from './placement';

// Older projects have no bin list; retain the media referenced by their timeline.
export const projectMediaIds=(p:Project)=>[...new Set([...p.mediaIds,...p.clips.flatMap(c=>c.mediaId?[c.mediaId]:[])])];
export function addProjectMedia(p:Project,ids:string[]):Project{
  return ProjectSchema.parse({...p,mediaIds:[...new Set([...projectMediaIds(p),...ids])]});
}
export function removeProjectMedia(p:Project,id:string):Project{
  if(p.clips.some(c=>c.mediaId===id&&p.tracks.some(t=>t.id===c.trackId&&t.locked)))throw new Error('這個素材正在鎖定的軌道上使用，請先解鎖再刪除。');
  return pruneTextTracks({...p,mediaIds:projectMediaIds(p).filter(m=>m!==id),clips:p.clips.filter(c=>c.mediaId!==id)});
}
