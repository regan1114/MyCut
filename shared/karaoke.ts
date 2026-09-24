import { z } from 'zod';
import type { Clip, FontInfo } from './model';
const frame=z.number().int().min(-24*60*60*60).max(24*60*60*60);
export const WordTimingSchema=z.object({text:z.string().min(1).max(3000),start:frame,end:frame}).refine(w=>w.end>w.start,'字詞結束時間必須晚於開始');
export type WordTiming=z.infer<typeof WordTimingSchema>;
export const KaraokeSchema=z.object({enabled:z.boolean().default(false),color:z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffe27a'),words:z.array(WordTimingSchema).max(3000).default([]),offset:frame.default(0),source:z.enum(['whisper','manual']).default('manual')});
export type Karaoke=z.infer<typeof KaraokeSchema>;
export const defaultKaraoke=():Karaoke=>KaraokeSchema.parse({});
export function validWordTiming(text:string,words:WordTiming[]){return words.length>0&&words.map(w=>w.text).join('')===text&&words.every((w,i)=>Number.isInteger(w.start)&&Number.isInteger(w.end)&&w.end>w.start&&(i===0||w.start>=words[i-1].end));}
export const hasKaraoke=(c:Clip)=>c.kind==='text'&&!!c.karaoke?.enabled&&validWordTiming(c.text,c.karaoke.words);
export function lyricUnits(text:string){
  // CJK graphemes are individual units; Latin words stay together, including punctuation.
  const parts=text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[^\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\s]+\s*|\s+/gu)??[];const units:string[]=[];let pending='';for(const part of parts){if(!part.trim()&&units.length)units[units.length-1]+=part;else if(!part.trim())pending+=part;else{units.push(pending+part);pending='';}}if(pending)units.push(pending);return units;
}
export function wordProgress(words:WordTiming[],frame:number){return words.map(w=>Math.max(0,Math.min(1,(frame-w.start)/(w.end-w.start))));}
export function enhancedLrc(text:string,words:WordTiming[],fps:number,start=0,offset=0){
  if(!validWordTiming(text,words))throw new Error('請先完成逐字校時');const stamp=(f:number)=>{const cs=Math.max(0,Math.round(f/fps*100));return `${String(Math.floor(cs/6000)).padStart(2,'0')}:${String(Math.floor(cs/100)%60).padStart(2,'0')}.${String(cs%100).padStart(2,'0')}`;};
  return `[${stamp(start)}]`+words.map(w=>`<${stamp(start+w.start-offset)}>${w.text.replace(/\n/g,' ')}`).join('')+`<${stamp(start+words[words.length-1].end-offset)}>`;
}

// The same glyph layout is used in browser preview and native transparent video.
// A completed word stays highlighted; the current word fills across its own acoustic time.
export function drawTextFrame(ctx:CanvasRenderingContext2D,c:Clip,W:number,H:number,fonts:FontInfo[],projectWidth:number,relativeFrame:number){
  const size=c.fontSize*W/projectWidth,lines=c.text.split('\n'),lineHeight=size*1.4,top=H/2-(lines.length-1)*lineHeight/2;
  ctx.save();ctx.clearRect(0,0,W,H);ctx.font=`400 ${size}px "${fonts.find(f=>f.id===c.fontId)?.family??'Noto Sans TC'}", "Noto Sans TC"`;if('fontVariationSettings' in ctx)(ctx as CanvasRenderingContext2D & {fontVariationSettings:string}).fontVariationSettings='"wght" 400';ctx.textBaseline='alphabetic';ctx.textAlign='left';
  if(c.textBackground){ctx.fillStyle='rgba(16,17,18,.82)';ctx.beginPath();ctx.roundRect(W*.06,top-size*.85,W*.88,lines.length*lineHeight,size*.2);ctx.fill();}
  const timed=hasKaraoke(c),progress=timed?wordProgress(c.karaoke.words,relativeFrame+c.karaoke.offset):[],spans:{from:number;to:number;progress:number}[]=[];let offset=0;
  if(timed)for(let i=0;i<c.karaoke.words.length;i++){const to=offset+c.karaoke.words[i].text.length;spans.push({from:offset,to,progress:progress[i]});offset=to;}
  let lineOffset=0;
  for(let i=0;i<lines.length;i++){
    const line=lines[i],x=(W-ctx.measureText(line).width)/2,y=top+i*lineHeight+size*.35;
    ctx.fillStyle=c.color;ctx.fillText(line,x,y);
    if(timed)for(const span of spans){const from=Math.max(0,span.from-lineOffset),to=Math.min(line.length,span.to-lineOffset);if(to<=from||span.progress<=0)continue;
      const left=ctx.measureText(line.slice(0,from)).width,right=ctx.measureText(line.slice(0,to)).width;
      ctx.save();ctx.beginPath();ctx.rect(x+left,y-size*1.1,(right-left)*span.progress,size*1.5);ctx.clip();ctx.fillStyle=c.karaoke.color;ctx.fillText(line,x,y);ctx.restore();
    }
    lineOffset+=line.length+1;
  }
  ctx.restore();
}
