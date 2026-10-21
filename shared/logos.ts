import { makeClip, uid, endFrame, type Clip, type Media, type Project } from './model';
import { insertTimedClips } from './placement';
export type LogoPosition='top-left'|'top-right'|'bottom-left'|'bottom-right'|'custom';
export function logoPlacement(p:Pick<Project,'width'|'height'>,m:Pick<Media,'width'|'height'>,position:Exclude<LogoPosition,'custom'>,scale:number){
 const fit=Math.min(p.width/Math.max(1,m.width),p.height/Math.max(1,m.height));
 const x=Math.max(0,.5-.03-m.width*fit*scale/p.width/2),y=Math.max(0,.5-.03-m.height*fit*scale/p.height/2);
 return {x:position.endsWith('left')?-x:x,y:position.startsWith('top')?-y:y,scale};
}
export function logoPosition(p:Project,m:Media,c:Pick<Clip,'x'|'y'|'scale'>):LogoPosition{
 for(const position of ['top-left','top-right','bottom-left','bottom-right'] as const){const target=logoPlacement(p,m,position,c.scale);if(Math.abs(c.x-target.x)<.00001&&Math.abs(c.y-target.y)<.00001)return position;}
 return 'custom';
}
export function addLogo(p:Project,m:Media,transform:Pick<Clip,'x'|'y'|'scale'>){
 if(m.kind!=='image'||m.missing||!p.logoMediaIds.includes(m.id))throw new Error('請先匯入可讀取的 Logo 圖片');
 let track=p.tracks.find(t=>t.name==='Logo'&&t.kind==='video'&&!t.locked&&!t.hidden);
 if(!track){if(p.tracks.length>=32)throw new Error('已達 32 條軌道上限，請先整理軌道');track={id:uid(),name:'Logo',kind:'video',hidden:false,muted:false,locked:false};}
 const c=makeClip({kind:'image',logo:true,mediaId:m.id,trackId:track.id,start:0,duration:endFrame(p)||p.fps*5,name:`Logo · ${m.name}`,...transform});
 return {project:insertTimedClips({...p,tracks:[track,...p.tracks.filter(t=>t.id!==track.id)]},[c]),clipId:c.id};
}
