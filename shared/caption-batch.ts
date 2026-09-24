import { ProjectSchema, type Clip, type Project } from './model';

export type CaptionBatchOptions={find:string;replace:string;punctuation:'keep'|'remove'|'traditional';lineLength:number;style?:Pick<Clip,'fontId'|'fontSize'|'color'|'textBackground'>};
const segmenter=new Intl.Segmenter('zh-TW',{granularity:'grapheme'});
export function wrapCaption(text:string,limit:number){
  if(!limit)return text;
  return text.split('\n').flatMap(line=>{
    const characters=Array.from(segmenter.segment(line),s=>s.segment),lines:string[]=[];
    while(characters.length>limit){let at=limit;for(let i=limit;i>Math.floor(limit*.5);i--)if(/\s/.test(characters[i])){at=i;break;}lines.push(characters.splice(0,at).join('').trimEnd());while(characters[0]===' ')characters.shift();}
    lines.push(characters.join(''));return lines;
  }).join('\n');
}
export function applyCaptionBatch(p:Project,ids:readonly string[],options:CaptionBatchOptions):Project {
  if(!Number.isInteger(options.lineLength)||options.lineLength<0||options.lineLength>80)throw new Error('每行字數需為 0 至 80 的整數。');
  const selected=new Set(ids);const punctuation:Record<string,string>={',':'，','.':'。','?':'？','!':'！',':':'：',';':'；','(':'（',')':'）'};
  return ProjectSchema.parse({...p,clips:p.clips.map(c=>{
    if(c.kind!=='text'||!selected.has(c.id)||p.tracks.find(t=>t.id===c.trackId)?.locked)return c;
    let text=c.text;if(options.find)text=text.split(options.find).join(options.replace);
    if(options.punctuation==='remove')text=text.replace(/\p{P}/gu,'');
    if(options.punctuation==='traditional')text=text.replace(/[,\.?!:;()]/g,v=>punctuation[v]);
    text=wrapCaption(text,options.lineLength);
    if(!text.trim())throw new Error(`「${c.name}」套用後沒有文字，請調整取代條件。`);
    return {...c,...options.style,text,...(text!==c.text?{name:text.replace(/\n/g,' ').slice(0,30),karaoke:{...c.karaoke,enabled:false,words:[],offset:0}}:{})};
  })});
}
/** Only same-track overlaps are flagged; intentional bilingual tracks are independent. */
export function captionOverlaps(clips:Clip[]):Set<string>{
  const conflicts=new Set<string>(),furthest=new Map<string,Clip>();
  for(const c of clips.filter(c=>c.kind==='text').sort((a,b)=>a.start-b.start)){const prev=furthest.get(c.trackId);if(prev&&prev.start+prev.duration>c.start){conflicts.add(prev.id);conflicts.add(c.id);}if(!prev||prev.start+prev.duration<c.start+c.duration)furthest.set(c.trackId,c);}
  return conflicts;
}
