import type { Effects, Rhythm } from './effects';
import { random, wrap, TAU, alphaColor } from './effect-utils';
const quality=(e:Effects)=>e.quality==='draft'?.55:e.quality==='high'?1.5:1;
function sizeScratch(s:CanvasRenderingContext2D,W:number,H:number){if(s.canvas.width!==W)s.canvas.width=W;if(s.canvas.height!==H)s.canvas.height=H;s.resetTransform();s.globalAlpha=1;s.globalCompositeOperation='source-over';s.filter='none';s.clearRect(0,0,W,H);}

// Optical effects use a bounded scratch image, never a time-dependent simulation buffer.
export function drawOpticalEffects(ctx:CanvasRenderingContext2D,W:number,H:number,time:number,e:Effects,s:CanvasRenderingContext2D){
  const on=(id:string)=>e.enabled.includes(id as typeof e.enabled[number]),a=e.intensity,t=time*e.speed,u=Math.min(W/1920,H/1080);
  if(on('mirror')){
    sizeScratch(s,W,H);s.drawImage(ctx.canvas,0,0);ctx.save();ctx.globalAlpha=a;
    if(e.mirrorAxis==='vertical'||e.mirrorAxis==='both'){ctx.save();ctx.translate(0,H);ctx.scale(1,-1);ctx.drawImage(s.canvas,0,0,W,H/2,0,0,W,H/2);ctx.restore();}
    if(e.mirrorAxis!=='vertical'){if(e.mirrorAxis==='both'){s.clearRect(0,0,W,H);s.drawImage(ctx.canvas,0,0);}ctx.translate(W,0);ctx.scale(-1,1);ctx.drawImage(s.canvas,0,0,W/2,H,0,0,W/2,H);}ctx.restore();
  }
  if(on('kaleidoscope')){
    sizeScratch(s,W,H);s.drawImage(ctx.canvas,0,0);const sectors=e.kaleidoscopeSegments??6,angle=TAU/sectors,r=Math.hypot(W,H);
    ctx.save();ctx.globalAlpha=a;ctx.translate(W/2,H/2);
    for(let i=0;i<sectors;i++){ctx.save();ctx.rotate(i*angle);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(r,0);ctx.arc(0,0,r,0,angle+.002);ctx.closePath();ctx.clip();ctx.rotate(angle/2);if(i%2)ctx.scale(1,-1);ctx.rotate(t*.035);const zoom=r/Math.min(W,H)*1.15;ctx.scale(zoom,zoom);ctx.drawImage(s.canvas,-W/2,-H/2);ctx.restore();}ctx.restore();
  }
  if(on('bloom')){
    const bound=e.quality==='draft'?160:e.quality==='high'?640:320,sw=Math.max(1,Math.round(Math.min(1,bound/Math.max(W,H))*W)),sh=Math.max(1,Math.round(sw*H/W));
    sizeScratch(s,W,H);s.drawImage(ctx.canvas,0,0,sw,sh);const pixels=s.getImageData(0,0,sw,sh);
    for(let i=0;i<pixels.data.length;i+=4){const light=(pixels.data[i]*.2126+pixels.data[i+1]*.7152+pixels.data[i+2]*.0722)/255;pixels.data[i+3]=Math.round(Math.max(0,(light-.45)/.55)*255);}
    s.putImageData(pixels,0,0);s.save();s.globalCompositeOperation='copy';s.filter=`blur(${Math.max(1,sw/70)}px)`;s.drawImage(s.canvas,0,0,sw,sh,0,0,sw,sh);s.restore();ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=a*.8;ctx.drawImage(s.canvas,0,0,sw,sh,0,0,W,H);ctx.restore();
  }
  if(on('vhs')){
    sizeScratch(s,W,H);s.drawImage(ctx.canvas,0,0);const tick=Math.floor(t*24);ctx.save();ctx.globalAlpha=a*.25;ctx.globalCompositeOperation='screen';ctx.drawImage(s.canvas,(Math.sin(t*47)*2+3)*u,0);ctx.globalCompositeOperation='source-over';
    for(let i=0;i<3;i++){const y=random(e.seed+tick,i)*H,h=(2+random(e.seed+tick,i+7)*12)*u;ctx.globalAlpha=a*.7;ctx.drawImage(s.canvas,0,y,W,Math.min(h,H-y),(random(e.seed+tick,i+13)-.5)*28*u,y,W,Math.min(h,H-y));}
    ctx.globalAlpha=a*.13;ctx.fillStyle='#0b0920';const step=Math.max(2,4*u);for(let y=0;y<H;y+=step)ctx.fillRect(0,y,W,Math.max(1,u));
    ctx.globalAlpha=a*.1;ctx.fillStyle='#d1ecff';const y=wrap(t*.16)*H;ctx.fillRect(0,y,W,Math.max(2,12*u));ctx.restore();
  }
  if(on('raindrops')){
    sizeScratch(s,W,H);s.drawImage(ctx.canvas,0,0);const count=Math.round(45*e.density*quality(e));
    for(let i=0;i<count;i++){
      const r=(7+random(e.seed,i*8)*17)*u,x=(.03+random(e.seed,i*8+1)*.94)*W,y=(wrap(random(e.seed,i*8+2)+t*(.006+random(e.seed,i*8+3)*.025),1.2)-.1)*H;
      if(y-r<0||y+r*1.6>H||x-r<0||x+r>W)continue;
      ctx.save();ctx.globalAlpha=a*.9;ctx.beginPath();ctx.ellipse(x,y,r,r*1.45,0,0,TAU);ctx.clip();ctx.drawImage(s.canvas,x-r*.68,y-r*.68,r*1.36,r*1.36,x-r,y-r*1.45,r*2,r*2.9);
      const g=ctx.createLinearGradient(x-r,y-r,x+r,y+r);g.addColorStop(0,'#d9f1ff55');g.addColorStop(.4,'#d9f1ff00');g.addColorStop(1,'#05182880');ctx.fillStyle=g;ctx.fillRect(x-r,y-r*1.5,r*2,r*3);ctx.restore();
      ctx.save();ctx.globalAlpha=a*.5;ctx.strokeStyle='#d5eeff';ctx.lineWidth=Math.max(.35,u);ctx.beginPath();ctx.ellipse(x,y,r*.8,r*1.24,0,Math.PI*1.1,Math.PI*1.65);ctx.stroke();ctx.globalAlpha=a*.08;ctx.beginPath();ctx.moveTo(x,y-r*1.2);ctx.lineTo(x,y-r*6);ctx.stroke();ctx.restore();
    }
  }

}

export function drawExtraEffects(ctx:CanvasRenderingContext2D,_source:CanvasImageSource,W:number,H:number,time:number,e:Effects,rhythm:Rhythm,_scratch?:CanvasRenderingContext2D){
  const on=(id:string)=>e.enabled.includes(id as typeof e.enabled[number]),a=e.intensity,t=time*e.speed,u=Math.min(W/1920,H/1080),rand=(i:number)=>random(e.seed+901,i);
  const count=(base:number)=>Math.round(base*e.density*quality(e));ctx.save();
  if(on('leaves'))for(let i=0;i<count(42);i++){
    const phase=wrap(rand(i*8)+t*(.035+rand(i*8+1)*.05)),x=(wrap(rand(i*8+2)-phase*.35+Math.sin(t*.5+i)*.02,1.2)-.1)*W,y=(phase*1.2-.1)*H,r=(9+rand(i*8+3)*16)*u;
    ctx.save();ctx.translate(x,y);ctx.rotate(rand(i*8+4)*TAU+t*(rand(i*8+5)-.5));ctx.scale(.35+.65*Math.abs(Math.sin(t+i)),1);ctx.globalAlpha=a*(.55+rand(i*8+6)*.4);ctx.fillStyle=['#df9a3f','#b96431','#dbbc65'][i%3];ctx.beginPath();ctx.moveTo(0,-r);ctx.bezierCurveTo(r*1.4,-r*.4,r*.7,r*.7,0,r);ctx.bezierCurveTo(-r*.7,r*.7,-r*1.4,-r*.4,0,-r);ctx.fill();ctx.strokeStyle='#5e3b2580';ctx.lineWidth=Math.max(.4,u);ctx.beginPath();ctx.moveTo(0,-r*.8);ctx.lineTo(0,r*1.3);ctx.stroke();ctx.restore();
  }
  if(on('dandelion'))for(let i=0;i<count(35);i++){
    const x=(wrap(rand(i*5)+t*.035,1.2)-.1)*W,y=(.1+rand(i*5+1)*.8+Math.sin(t*.25+i)*.035)*H,r=(7+rand(i*5+2)*12)*u;ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(t*.3+i)*.5);ctx.globalAlpha=a*(.4+rand(i*5+3)*.55);ctx.strokeStyle='#f6f5de';ctx.lineWidth=Math.max(.35,u*.7);ctx.beginPath();ctx.moveTo(0,r);ctx.lineTo(0,-r*.3);for(let j=0;j<9;j++){const theta=Math.PI+j/8*Math.PI;ctx.moveTo(0,-r*.3);ctx.lineTo(Math.cos(theta)*r,Math.sin(theta)*r-r*.3);}ctx.stroke();ctx.restore();
  }
  if(on('embers')){ctx.globalCompositeOperation='screen';for(let i=0;i<count(90);i++){const phase=wrap(rand(i*5)+t*(.08+rand(i*5+1)*.12)),x=(rand(i*5+2)+Math.sin(t*.7+i)*.045)*W,y=(1-phase)*H,r=(1+rand(i*5+3)*3.5)*u;ctx.globalAlpha=a*Math.sin(phase*Math.PI);ctx.strokeStyle=i%3?'#ff9e42':'#ffe5a2';ctx.lineWidth=Math.max(.6,r);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-r*.3,y+r*(1+rand(i*5+4)*3));ctx.stroke();}ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';}
  if(on('stars')){ctx.save();ctx.globalCompositeOperation='screen';ctx.fillStyle='#e4efff';for(let i=0;i<count(130);i++){const x=rand(i*5)*W,y=rand(i*5+1)*H,r=(.5+rand(i*5+2)*1.8)*u;ctx.globalAlpha=a*(.2+.8*(Math.sin(t*(.4+rand(i*5+3))+i)+1)/2);ctx.beginPath();ctx.arc(x,y,Math.max(.2,r),0,TAU);ctx.fill();if(i%12===0){ctx.fillRect(x-r*3,y-.3*u,r*6,.6*u);ctx.fillRect(x-.3*u,y-r*3,.6*u,r*6);}}
    const cycle=Math.floor(t/6),phase=wrap(t,6);if(phase<1.3){const progress=phase/1.3,x=(.1+random(e.seed+cycle,1)*.55+progress*.45)*W,y=(.03+progress*.38)*H,length=W*.17;ctx.globalAlpha=a*Math.sin(progress*Math.PI);const g=ctx.createLinearGradient(x-length,y-length*.5,x,y);g.addColorStop(0,'#d4e8ff00');g.addColorStop(1,'#f0f8ff');ctx.strokeStyle=g;ctx.lineWidth=2*u;ctx.beginPath();ctx.moveTo(x-length,y-length*.5);ctx.lineTo(x,y);ctx.stroke();}ctx.restore();}
  if(on('lightSweep')){const phase=wrap(t,5)/5;ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=a*.65*Math.sin(phase*Math.PI);ctx.translate((-W*.3+phase*W*1.6),H/2);ctx.rotate(.28);const width=W*.10,g=ctx.createLinearGradient(-width,0,width,0);g.addColorStop(0,'#ffffff00');g.addColorStop(.45,alphaColor(e.color,.45));g.addColorStop(.5,'#ffffffcc');g.addColorStop(.55,alphaColor(e.color,.45));g.addColorStop(1,'#ffffff00');ctx.fillStyle=g;ctx.fillRect(-width,-H,width*2,H*2);ctx.restore();}
  if(on('ripple')){ctx.save();ctx.globalCompositeOperation='screen';for(const event of rhythm.events){const age=(time-event.time)*e.speed;if(age<0||age>1.8)continue;ctx.globalAlpha=a*event.strength*(1-age/1.8)*.8;ctx.strokeStyle=e.color;ctx.lineWidth=(2+4*(1-age/1.8))*u;ctx.beginPath();ctx.arc(W/2,H/2,Math.max(1,age*Math.hypot(W,H)*.4),0,TAU);ctx.stroke();}ctx.restore();}
  if(on('spectrum')){
    const settings=e.spectrum??{mode:'bars',x:.5,y:.8,scale:.8},bands=rhythm.bands??[],wave=rhythm.waveform??[],x=settings.x*W,y=settings.y*H,width=W*settings.scale,height=Math.min(W,H)*.25*settings.scale;
    ctx.save();ctx.globalAlpha=a;ctx.fillStyle=e.color;ctx.strokeStyle=e.color;ctx.lineWidth=Math.max(1,2*u);
    if(settings.mode==='waveform'&&wave.some(v=>Math.abs(v)>.002)){ctx.beginPath();wave.forEach((v,i)=>{const px=x-width/2+i/Math.max(1,wave.length-1)*width,py=y-v*height;i?ctx.lineTo(px,py):ctx.moveTo(px,py);});ctx.stroke();}
    else if(settings.mode==='circle'&&bands.some(v=>v>.002)){const radius=Math.min(W,H)*.19*settings.scale;for(let i=0;i<bands.length*2;i++){const level=bands[i<bands.length?i:bands.length*2-i-1]??0;if(level<=.002)continue;const theta=i/(bands.length*2)*TAU-Math.PI/2;ctx.lineWidth=Math.max(1,3*u);ctx.beginPath();ctx.moveTo(x+Math.cos(theta)*radius,y+Math.sin(theta)*radius);ctx.lineTo(x+Math.cos(theta)*(radius+height*level),y+Math.sin(theta)*(radius+height*level));ctx.stroke();}}
    else if(settings.mode==='bars'){const step=width/Math.max(1,bands.length);for(let i=0;i<bands.length;i++){const h=height*bands[i];if(h>.1)ctx.fillRect(x-width/2+i*step,y-h,step*.65,h);}}
    ctx.restore();
  }
  ctx.restore();
}
