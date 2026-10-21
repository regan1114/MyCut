import {z} from 'zod';
import {makeClip,splitClip,uid,ProjectSchema,type Project,type Clip,type Media} from './model';
import {appendClips} from './placement';
export const AiConfigSchema=z.object({mode:z.enum(['api','cli']),endpoint:z.string().max(2000).default(''),model:z.string().max(200).default(''),apiKey:z.string().max(4000).default(''),executable:z.string().max(2000).default(''),args:z.array(z.string().max(8000)).max(40).default([])});
export type AiConfig=z.infer<typeof AiConfigSchema>;
export const AiPlanSchema=z.object({segments:z.array(z.object({start:z.number().finite().min(0),end:z.number().finite().positive(),reason:z.string().max(500).default('')})).min(1).max(20)});
export type AiPlan=z.infer<typeof AiPlanSchema>;
export function validatePlan(value:unknown,from:number,to:number){const plan=AiPlanSchema.parse(value);let end=from;for(const s of plan.segments){if(s.start<end-.00001||s.end<=s.start||s.end>to+.00001)throw new Error('AI 回傳的片段重疊或超出影片範圍，請重新產生');end=s.end;}return plan;}
export function parsePlan(text:string,from:number,to:number){let value=JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));if(typeof value.response==='string')value=JSON.parse(value.response.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));return validatePlan(value,from,to);}
export function applyAiPlan(p:Project,m:Media,plan:AiPlan,original?:Clip){
 if(m.kind!=='video'||m.missing)throw new Error('AI 剪輯只能使用可讀取的影片');
 const c=original?p.clips.find(c=>c.id===original.id):undefined;
 if(original&&(!c||JSON.stringify(c)!==JSON.stringify(original)))throw new Error('影片片段已變更，請重新產生 AI 剪輯');
 if(c&&(p.tracks.find(t=>t.id===c.trackId)?.locked||c.linkId||c.groupId))throw new Error('請先解鎖軌道並解除片段群組／音畫連動');
 const track=c?p.tracks.find(t=>t.id===c.trackId):p.tracks.find(t=>t.kind==='video'&&!t.locked);if(!track)throw new Error('請先建立或解鎖影片軌道');
 const base=c??makeClip({kind:'video',mediaId:m.id,trackId:track.id,start:0,duration:Math.max(1,Math.floor(m.duration*p.fps)),name:m.name});
 validatePlan(plan,base.sourceIn,Math.min(m.duration,base.sourceIn+base.duration/p.fps*base.speed));let cursor=base.start;
 const clips=plan.segments.map(s=>{const from=Math.max(0,Math.round((s.start-base.sourceIn)/base.speed*p.fps)),to=Math.min(base.duration,Math.round((s.end-base.sourceIn)/base.speed*p.fps));if(to<=from)throw new Error('AI 片段短於一個影格，請重新產生');let part=from?splitClip(base,base.start+from,p.fps)[1]:base;part=splitClip(part,base.start+to,p.fps)[0];const result={...part,id:uid(),start:cursor,name:`AI · ${m.name}`,groupId:undefined,linkId:undefined};cursor+=result.duration;return result;});
 return ProjectSchema.parse(c?{...p,clips:[...p.clips.filter(item=>item.id!==c.id),...clips]}:appendClips(p,clips));
}
