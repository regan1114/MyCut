import { z } from 'zod';
import { random, wrap, TAU, alphaColor } from './effect-utils';
import { drawOpticalEffects, drawExtraEffects } from './effects-extra';
import { drawGraphicEffects, drawDecorativeEffects } from './effects-more';

export const EFFECT_IDS = ['nostalgic','sakura','rain','elven','fireflies','snow','bokeh','vignette','lightLeak','fog','aurora','ambilight','strobe','glitch','fireworks','punch','spectrum','bloom','lightSweep','leaves','dandelion','embers','stars','vhs','ripple','kaleidoscope','mirror','raindrops','bubbles','hearts','butterflies','confetti','ribbons','sunRays','starbursts','filmGrain','pixelate','halftone','letterbox','beatRays'] as const;
export type EffectId = typeof EFFECT_IDS[number];
export const effectCatalog: {id:EffectId;name:string;detail:string;group:'氛圍'|'光影'|'節奏'|'畫面'}[] = [
  {id:'nostalgic',name:'懷舊濾鏡',detail:'暖棕色調、底片刮痕與金色微塵',group:'氛圍'},
  {id:'sakura',name:'櫻花',detail:'粉色花瓣隨風飄落',group:'氛圍'},
  {id:'rain',name:'雨絲',detail:'細長雨線斜落',group:'氛圍'},
  {id:'elven',name:'精靈粒子',detail:'發光的注音符號緩緩浮起',group:'氛圍'},
  {id:'fireflies',name:'螢火蟲',detail:'忽明忽暗的金色光點',group:'氛圍'},
  {id:'snow',name:'飄雪',detail:'輕柔的白色雪花',group:'氛圍'},
  {id:'bokeh',name:'散景',detail:'遠近交錯的柔光光斑',group:'光影'},
  {id:'vignette',name:'暗角',detail:'收暗四周，聚焦畫面中央',group:'光影'},
  {id:'lightLeak',name:'漏光',detail:'週期掠過的暖色光帶',group:'光影'},
  {id:'fog',name:'霧氣',detail:'畫面下方緩慢流動的薄霧',group:'光影'},
  {id:'aurora',name:'極光',detail:'青紫交織的流動光幕',group:'光影'},
  {id:'ambilight',name:'環境光暈',detail:'隨音樂強弱呼吸的邊緣光暈',group:'光影'},
  {id:'strobe',name:'節奏閃光',detail:'音樂重拍觸發柔和閃光',group:'節奏'},
  {id:'glitch',name:'節奏色偏',detail:'重拍時紅青色通道錯位',group:'節奏'},
  {id:'fireworks',name:'節奏煙火',detail:'重拍觸發煙火與彩帶',group:'節奏'},
  {id:'punch',name:'節奏震動',detail:'重拍觸發短促震動與推近',group:'節奏'},
  {id:'spectrum',name:'音樂頻譜',detail:'真實頻率分析：直條、環形、波形',group:'節奏'},
  {id:'bloom',name:'柔光 Bloom',detail:'讓亮部散出柔和光芒',group:'光影'},
  {id:'lightSweep',name:'光線掃過',detail:'一道光緩緩掠過畫面',group:'光影'},
  {id:'leaves',name:'落葉',detail:'暖色葉片隨風翻轉飄落',group:'氛圍'},
  {id:'dandelion',name:'蒲公英',detail:'輕盈的白色絨毛在風中飄散',group:'氛圍'},
  {id:'embers',name:'火星／餘燼',detail:'橘紅色火星向上飄起',group:'氛圍'},
  {id:'stars',name:'星空／流星',detail:'閃爍星點與週期劃過的流星',group:'氛圍'},
  {id:'vhs',name:'VHS 錄影帶',detail:'掃描線、磁帶抖動與色彩滲漏',group:'畫面'},
  {id:'ripple',name:'節奏波紋',detail:'重拍向外擴散光圈',group:'節奏'},
  {id:'kaleidoscope',name:'萬花筒',detail:'緩慢旋轉的對稱圖案',group:'畫面'},
  {id:'mirror',name:'鏡像',detail:'左右、上下或四向反射',group:'畫面'},
  {id:'raindrops',name:'雨滴玻璃',detail:'滑落的雨珠與局部光學折射',group:'畫面'},
  {id:'bubbles',name:'泡泡',detail:'透明泡泡緩緩上升，帶有柔和反光',group:'氛圍'},
  {id:'hearts',name:'漂浮愛心',detail:'輕盈愛心向上飄散',group:'氛圍'},
  {id:'butterflies',name:'蝴蝶',detail:'彩色蝴蝶振翅穿過畫面',group:'氛圍'},
  {id:'confetti',name:'彩色紙花',detail:'持續飄落與翻轉的慶祝紙花',group:'氛圍'},
  {id:'ribbons',name:'流動絲帶',detail:'柔和彩帶以波浪流動',group:'光影'},
  {id:'sunRays',name:'晨光射線',detail:'從上方斜灑下的溫暖光束',group:'光影'},
  {id:'starbursts',name:'十字星芒',detail:'明亮十字光斑緩緩閃耀',group:'光影'},
  {id:'filmGrain',name:'底片顆粒',detail:'細緻黑白顆粒，帶出底片質感',group:'畫面'},
  {id:'pixelate',name:'像素風',detail:'將畫面轉為復古像素色塊，密度調整色塊大小',group:'畫面'},
  {id:'halftone',name:'漫畫網點',detail:'依畫面明暗形成漫畫印刷網點',group:'畫面'},
  {id:'letterbox',name:'電影黑邊',detail:'上下黑色遮幅，保留中央畫面',group:'畫面'},
  {id:'beatRays',name:'節奏放射線',detail:'音樂重拍觸發向外延伸的光線',group:'節奏'},
];
export const EffectsSchema = z.object({
  enabled:z.array(z.enum(EFFECT_IDS)).max(EFFECT_IDS.length).default([]).transform(v=>[...new Set(v)]),
  intensity:z.number().min(0).max(1).default(.7), speed:z.number().min(.25).max(2).default(1),
  density:z.number().min(.25).max(2).default(1), color:z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#a5e6cf'),
  quality:z.enum(['draft','standard','high']).default('standard'),
  spectrum:z.object({mode:z.enum(['bars','circle','waveform']).default('bars'),x:z.number().min(0).max(1).default(.5),y:z.number().min(0).max(1).default(.8),scale:z.number().min(.2).max(1.5).default(.8)}).default({}),
  mirrorAxis:z.enum(['horizontal','vertical','both']).default('horizontal'),
  kaleidoscopeSegments:z.union([z.literal(4),z.literal(6),z.literal(8),z.literal(12)]).default(6),
  seed:z.number().int().min(0).max(0xffffffff).default(42),
});
export type Effects = z.infer<typeof EffectsSchema>;
export const defaultEffects = ():Effects => EffectsSchema.parse({});
export const hasEffects = (effects?:Effects) => !!effects?.enabled.length && effects.intensity>0;
export const needsRhythm = (effects?:Effects) => effects?.enabled.some(id=>['strobe','glitch','fireworks','punch','ambilight','spectrum','ripple','beatRays'].includes(id)) ?? false;
export type Rhythm = {energy:number;pulse:number;bands?:number[];waveform?:number[];events:{time:number;strength:number;key:number}[]};
export const silentRhythm:Rhythm = {energy:0,pulse:0,events:[]};

// Fixed seeds and absolute project time make seeking and resumed exports repeatable.
const zhuyin='ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙㄧㄨㄩㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ';


/** Canvas 2D only: shared by Chromium preview and native Skia export. Source must be a separate canvas. */
export function renderEffects(ctx:CanvasRenderingContext2D,source:CanvasImageSource,W:number,H:number,time:number,e:Effects,rhythm:Rhythm=silentRhythm,scratch?:CanvasRenderingContext2D) {
  if(!hasEffects(e))return;
  const enabled=new Set(e.enabled),on=(id:EffectId)=>enabled.has(id),a=e.intensity,t=time*e.speed,u=Math.min(W/1920,H/1080);
  const rand=(i:number)=>random(e.seed,i),count=(base:number)=>Math.round(base*e.density);
  const glow=(x:number,y:number,r:number,color:string,opacity:number)=>{
    const g=ctx.createRadialGradient(x,y,0,x,y,Math.max(.1,r));g.addColorStop(0,alphaColor(color,opacity));g.addColorStop(.35,alphaColor(color,opacity*.3));g.addColorStop(1,alphaColor(color,0));ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
  };
  ctx.save();
  ctx.clearRect(0,0,W,H);
  ctx.save();
  if(on('punch')){const pulse=rhythm.pulse*a;ctx.translate(W/2+Math.sin(time*117)*9*u*pulse,H/2+Math.cos(time*93)*9*u*pulse);ctx.scale(1+.035*pulse,1+.035*pulse);ctx.translate(-W/2,-H/2);}
  if(on('nostalgic'))ctx.filter=`sepia(${.5*a}) contrast(${1+.1*a}) brightness(${1-.1*a})`;
  ctx.drawImage(source,0,0,W,H);ctx.restore();
  if(scratch){drawOpticalEffects(ctx,W,H,time,e,scratch);drawGraphicEffects(ctx,W,H,e,scratch);}
  if(on('glitch')&&rhythm.pulse>.01&&scratch){
    const offset=(2+10*a)*u*rhythm.pulse;
    ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=rhythm.pulse*a*.5;
    for(const [color,shift] of [['rgba(255,40,40,.9)',-offset],['rgba(40,255,255,.9)',offset]] as const){
      scratch.save();scratch.clearRect(0,0,W,H);scratch.drawImage(source,0,0,W,H);scratch.globalCompositeOperation='source-atop';scratch.fillStyle=color;scratch.fillRect(0,0,W,H);scratch.restore();
      ctx.drawImage(scratch.canvas,shift,0,W,H);
    }
    ctx.restore();
  }
  if(on('nostalgic')){
    ctx.fillStyle=`rgba(150,70,0,${.12*a})`;ctx.fillRect(0,0,W,H);
    const tick=Math.floor(t*12);ctx.lineWidth=Math.max(.3,u);
    for(let i=0;i<3;i++){const r=random(e.seed+tick,i);if(r>.64){ctx.strokeStyle=`rgba(255,240,220,${.10*a*r})`;ctx.beginPath();ctx.moveTo(r*W,0);ctx.lineTo(r*W,H);ctx.stroke();}}
    ctx.globalCompositeOperation='lighter';
    for(let i=0;i<count(52);i++){const x=wrap(rand(i*7)+Math.sin(t*.2+i)*.012)*W,y=(1-wrap(rand(i*7+1)+t*(.008+rand(i*7+2)*.024)))*H;ctx.globalAlpha=a*(.15+.4*Math.abs(Math.sin(t*2+i)));ctx.fillStyle='#fbbf24';ctx.beginPath();ctx.arc(x,y,(.6+rand(i*7+3)*2.4)*u,0,TAU);ctx.fill();}ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  }
  if(on('fog')){ctx.save();ctx.globalCompositeOperation='screen';for(let i=0;i<3;i++){ctx.save();ctx.translate((.15+i*.35+Math.sin(t*.08+i)*.12)*W,(.8+Math.sin(t*.06+i)*.08)*H);ctx.scale(1,.28);glow(0,0,W*(.35+rand(i)*.1),'#dde6f5',a*.22);ctx.restore();}ctx.restore();}
  if(on('aurora')){ctx.save();ctx.globalCompositeOperation='screen';const colors=['#67e8f9','#a78bfa','#34d399','#818cf8'];for(let i=0;i<4;i++){
    const g=ctx.createLinearGradient(0,0,0,H*.65);g.addColorStop(0,'transparent');g.addColorStop(.25,alphaColor(colors[i],a*.28));g.addColorStop(1,'transparent');ctx.strokeStyle=g;ctx.lineWidth=(45+rand(i)*35)*u;ctx.beginPath();for(let j=0;j<=60;j++){const y=j/60*H*.65,x=W*(.12+i*.25)+Math.sin(y/H*7+t*.22+i*1.7)*W*.1; if(!j)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();}ctx.restore();}
  if(on('lightLeak')){const phase=wrap(t,8)/4;if(phase<1){ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=Math.sin(phase*Math.PI)*a*.55;ctx.translate((-W*.45+phase*W*1.9),H/2);ctx.rotate(-.3);const g=ctx.createLinearGradient(-W*.22,0,W*.22,0);g.addColorStop(0,'transparent');g.addColorStop(.3,'#ff793f');g.addColorStop(.5,'#ffefba');g.addColorStop(.7,'#ff9a5c');g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(-W*.22,-H,W*.44,H*2);ctx.restore();}}
  if(on('bokeh')){ctx.save();ctx.globalCompositeOperation='screen';for(let i=0;i<count(22);i++){const depth=rand(i*8),x=wrap(rand(i*8+1)-t*(.007+depth*.018),1.4)*W-W*.2,y=(rand(i*8+2)+Math.sin(t*.2+i)*.04)*H;const radius=(depth<.2?6:depth<.85?60+depth*100:280+depth*140)*u;glow(x,y,radius,depth<.2?'#ffffff':e.color,a*(depth>.85?.09:depth<.2?.8:.3));}ctx.restore();}
  if(on('rain')){ctx.save();ctx.strokeStyle='#c8dcff';ctx.lineWidth=1.5*u;ctx.lineCap='round';for(let i=0;i<count(130);i++){const speed=.75+rand(i*5)*.6;const y=wrap(rand(i*5+1)+t*speed,1.2)*H-H*.1,x=wrap(rand(i*5+2)-t*.035,1.1)*W;const len=(20+rand(i*5+3)*30)*u;ctx.globalAlpha=a*(.2+rand(i*5+4)*.3);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-len*.055,y+len);ctx.stroke();}ctx.restore();}
  if(on('snow')){ctx.save();ctx.fillStyle='white';for(let i=0;i<count(100);i++){const y=wrap(rand(i*6)+t*(.028+rand(i*6+1)*.065),1.1)*H-H*.05,x=wrap(rand(i*6+2)+Math.sin(t*.3+i)*.03)*W;ctx.globalAlpha=a*(.4+rand(i*6+3)*.5);ctx.beginPath();ctx.arc(x,y,(1+rand(i*6+4)*2.5)*u,0,TAU);ctx.fill();}ctx.restore();}
  if(on('fireflies')){ctx.save();ctx.globalCompositeOperation='screen';for(let i=0;i<count(40);i++){const x=(rand(i*6)+Math.sin(t*.35+i)*.035)*W,y=(.25+rand(i*6+1)*.65+Math.cos(t*.26+i)*.025)*H,alpha=(.35+.65*(Math.sin(t*(.8+rand(i*6+2))+i)+1)/2)*a;glow(x,y,(6+rand(i*6+3)*8)*u,'#fff4be',alpha);ctx.fillStyle=alphaColor('#fff9e0',alpha);ctx.beginPath();ctx.arc(x,y,1.3*u,0,TAU);ctx.fill();}ctx.restore();}
  if(on('elven')){ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.shadowColor=e.color;ctx.shadowBlur=15*u;ctx.fillStyle='#edfff9';for(let i=0;i<count(10);i++){const cycle=wrap(t*.11+rand(i*7)),x=W*(.22+rand(i*7+1)*.56)+Math.sin(t*.5+i)*12*u,y=H*(.9-cycle*.45);ctx.globalAlpha=Math.sin(cycle*Math.PI)*a*.85;ctx.font=`400 ${(30+rand(i*7+2)*30)*u}px "Noto Sans TC"`;const char=Math.floor(rand(i*7+3)*zhuyin.length);ctx.fillText(zhuyin[char]+(rand(i*7+4)>.5?zhuyin[(char+7)%zhuyin.length]:''),x,y);}ctx.restore();}
  if(on('sakura')){ctx.save();for(let i=0;i<count(65);i++){
    const velocity=.06+rand(i*9)*.1,phase=wrap(rand(i*9+1)+t*velocity),x=W*(1.08-phase*1.16),y=wrap(rand(i*9+2)+t*(.024+rand(i*9+3)*.035)+Math.sin(t*.5+i)*.014,1.1)*H-H*.05,size=(4+rand(i*9+4)*8)*u;
    ctx.save();ctx.globalAlpha=a*(.5+rand(i*9+5)*.5);ctx.translate(x,y);ctx.rotate(rand(i*9+6)*TAU+t*(rand(i*9+7)-.5)*3);ctx.scale(.45+.55*Math.abs(Math.sin(t*.8+i)),1);ctx.fillStyle=rand(i*9+8)>.4?'#ffb7c5':'#ffcce6';ctx.beginPath();ctx.moveTo(0,-size);ctx.bezierCurveTo(size,-size,size,size,0,size*1.5);ctx.bezierCurveTo(-size,size,-size,-size,0,-size);ctx.fill();ctx.restore();}ctx.restore();}
  if(on('fireworks')){ctx.save();const palette=['#ffffff','#ffd166','#ff6b6b','#4ecdc4','#c792ea','#ff9f43'];for(const event of rhythm.events){const age=(time-event.time)*e.speed;if(age<0||age>1.8)continue;const seed=e.seed+event.key;const ox=W*(.15+random(seed,1)*.7),oy=H*(.2+random(seed,2)*.4);
    for(let i=0;i<count(48);i++){const angle=random(seed,i*6+3)*TAU,speed=(180+random(seed,i*6+4)*540)*u,x=ox+Math.cos(angle)*speed*age,y=oy+Math.sin(angle)*speed*age+216*u*age*age;ctx.save();ctx.translate(x,y);ctx.rotate(random(seed,i*6+5)*TAU+age*6);ctx.globalAlpha=Math.max(0,1-age/1.8)*event.strength*a;ctx.fillStyle=palette[i%palette.length];if(random(seed,i*6+6)>.55)ctx.fillRect(-3*u,-2*u,6*u,4*u);else{ctx.beginPath();ctx.arc(0,0,2.5*u,0,TAU);ctx.fill();}ctx.restore();}}ctx.restore();}
  if(on('ambilight')){ctx.save();ctx.globalCompositeOperation='screen';const opacity=a*(.16+(1+Math.sin(t*.6))*.06+rhythm.energy*.18+rhythm.pulse*.2);const edge=Math.min(W,H)*.22;for(const [x1,y1,x2,y2] of [[0,0,edge,0],[W,0,W-edge,0],[0,0,0,edge],[0,H,0,H-edge]]){const g=ctx.createLinearGradient(x1,y1,x2,y2);g.addColorStop(0,alphaColor(e.color,opacity));g.addColorStop(1,alphaColor(e.color,0));ctx.fillStyle=g;if(y1===y2)ctx.fillRect(Math.min(x1,x2),0,edge,H);else ctx.fillRect(0,Math.min(y1,y2),W,edge);}ctx.restore();}
  drawExtraEffects(ctx,source,W,H,time,e,rhythm,scratch);
  if(on('vignette')){const g=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*.18,W/2,H/2,Math.hypot(W,H)*.55);g.addColorStop(0,'transparent');g.addColorStop(1,`rgba(${on('nostalgic')?'30,16,5':'0,0,0'},${Math.min(.9,a*(.65+rhythm.energy*.15))})`);ctx.fillStyle=g;ctx.fillRect(0,0,W,H);}
  if(on('strobe')&&rhythm.pulse>.01){ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=rhythm.pulse*a*.35;ctx.fillStyle=e.color;ctx.fillRect(0,0,W,H);ctx.restore();}
  drawDecorativeEffects(ctx,W,H,time,e,rhythm);
  ctx.restore();
}
