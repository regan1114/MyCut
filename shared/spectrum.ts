export const SPECTRUM_BANDS=32;
export const WAVE_SAMPLES=32;
// 8 kHz mono analysis, 512-point Hann FFT, logarithmic 40–4000 Hz bands.
// Only this fixed ring buffer is retained, independent of source duration.
export class SpectrumAnalyser {
  private ring=new Float64Array(512);private cursor=0;private real=new Float64Array(512);private imaginary=new Float64Array(512);
  private window=Float64Array.from({length:512},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/511));
  push(value:number){this.ring[this.cursor]=value;this.cursor=(this.cursor+1)%512;}
  spectrum(){const re=this.real,im=this.imaginary;for(let i=0;i<512;i++){let reversed=0,x=i;for(let bit=0;bit<9;bit++){reversed=(reversed<<1)|(x&1);x>>>=1;}re[reversed]=this.ring[(this.cursor+i)%512]*this.window[i];im[reversed]=0;}
    for(let size=2;size<=512;size*=2){const half=size/2,step=-2*Math.PI/size;for(let k=0;k<half;k++){const wr=Math.cos(k*step),wi=Math.sin(k*step);for(let start=k;start<512;start+=size){const other=start+half,tr=wr*re[other]-wi*im[other],ti=wr*im[other]+wi*re[other];re[other]=re[start]-tr;im[other]=im[start]-ti;re[start]+=tr;im[start]+=ti;}}}
    const bands=new Uint8Array(SPECTRUM_BANDS);for(let i=0;i<bands.length;i++){const lo=Math.max(1,Math.floor(40*Math.pow(100,i/32)*512/8000)),hi=Math.min(256,Math.max(lo+1,Math.ceil(40*Math.pow(100,(i+1)/32)*512/8000)));let peak=0;for(let bin=lo;bin<hi;bin++)peak=Math.max(peak,Math.hypot(re[bin],im[bin])/128);bands[i]=Math.round(Math.max(0,Math.min(1,(20*Math.log10(Math.max(1e-8,peak))+65)/65))*255);}return bands;
  }
  waveform(){const result=new Uint8Array(WAVE_SAMPLES);for(let i=0;i<WAVE_SAMPLES;i++){let sum=0;for(let j=0;j<5;j++)sum+=this.ring[(this.cursor+512-160+i*5+j)%512];result[i]=Math.round(128+Math.max(-1,Math.min(1,sum/5*2))*127);}return result;}
}
