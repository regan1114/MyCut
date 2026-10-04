import { newProject } from '../../shared/model';

/** An explicit extra visual lane for layering and legacy-project scenarios. */
export function projectWithOverlay(){
  const p=newProject();p.tracks.splice(1,0,{id:'overlay',name:'疊加畫面',kind:'video',muted:false,hidden:false,locked:false});return p;
}
