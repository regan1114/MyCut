import { createCanvas } from '@napi-rs/canvas';
import type { Clip, FontInfo } from '../shared/model';
import { drawTextFrame } from '../shared/karaoke';
import { registerCanvasFonts } from './canvas-fonts';

// Share preview/karaoke text layout, including per-glyph CJK fallback. The PNG
// is cached by renderSegment and reused across long-video segments.
export function renderTextPng(clip:Clip,width:number,height:number,fonts:FontInfo[],fontRoot:string,projectWidth:number){
  registerCanvasFonts(fonts,fontRoot,clip.fontId);
  const canvas=createCanvas(width,height);
  try{
    drawTextFrame(canvas.getContext('2d') as unknown as CanvasRenderingContext2D,clip,width,height,fonts,projectWidth,0);
    return canvas.toBuffer('image/png');
  }finally{canvas.width=1;canvas.height=1;}
}
