import type { Project } from './model';
import type { Rhythm } from './effects';
import { SPECTRUM_BANDS, WAVE_SAMPLES } from './spectrum';

export const RHYTHM_RATE=50;
export type AudioFeatures={energy:Uint8Array;beats:number[];bands?:Uint8Array;waveform?:Uint8Array};
export type AudioFeaturesJson={rate:number;energy:string;beats:number[];bands?:string;waveform?:string};
export function lowerBound(values:number[],target:number){let a=0,b=values.length;while(a<b){const m=(a+b)>>>1;if(values[m]<target)a=m+1;else b=m;}return a;}

// Analysis uses actual media time; trims, playback speed, fades and track mute all matter.
export function sampleRhythm(p:Project,time:number,features:ReadonlyMap<string,AudioFeatures>,effectSpeed=p.effects?.speed??1):Rhythm{
  const result:Rhythm={energy:0,pulse:0,events:[],bands:Array(SPECTRUM_BANDS).fill(0),waveform:Array(WAVE_SAMPLES).fill(0)};const tracks=new Map(p.tracks.map(t=>[t.id,t]));
  const lookback=1.8/effectSpeed;
  for(const c of p.clips){
    const track=tracks.get(c.trackId),data=c.mediaId?features.get(c.mediaId):undefined;
    if(!data||!track||track.hidden||track.muted||c.volume<=0||!['video','audio'].includes(c.kind))continue;
    const start=c.start/p.fps,end=(c.start+c.duration)/p.fps;
    if(time<start||time-lookback>=end)continue;
    const gainAt=(at:number)=>{const relative=at*p.fps-c.start;return c.volume*(c.audioFadeIn?Math.min(1,Math.max(0,relative/c.audioFadeIn)):1)*(c.audioFadeOut?Math.min(1,Math.max(0,(c.duration-relative)/c.audioFadeOut)):1);};
    const sourceTime=c.sourceIn+(time-start)*c.speed;
    if(time<end){
      const point=sourceTime*RHYTHM_RATE,index=Math.floor(point),mix=point-index,gain=gainAt(time);
      result.energy+=((data.energy[index]??0)/255)*gain;
      for(let b=0;b<SPECTRUM_BANDS;b++)result.bands![b]+=(((data.bands?.[index*SPECTRUM_BANDS+b]??0)*(1-mix)+(data.bands?.[(index+1)*SPECTRUM_BANDS+b]??0)*mix)/255)*gain;
      for(let b=0;b<WAVE_SAMPLES;b++)result.waveform![b]+=((data.waveform?.[index*WAVE_SAMPLES+b]??128)-128)/127*gain;
    }
    const first=Math.max(c.sourceIn,c.sourceIn+(Math.max(start,time-lookback)-start)*c.speed);
    for(let i=lowerBound(data.beats,first);i<data.beats.length&&data.beats[i]<=sourceTime;i++){
      const eventTime=start+(data.beats[i]-c.sourceIn)/c.speed;
      if(eventTime>=end)break;
      const strength=Math.min(1,(data.energy[Math.floor(data.beats[i]*RHYTHM_RATE)]??0)/100)*Math.min(1,gainAt(eventTime));
      if(strength<=.01)continue;
      result.events.push({time:eventTime,strength,key:Math.round(eventTime*1000)+i});
      result.pulse=Math.max(result.pulse,Math.exp(-(time-eventTime)*8)*strength);
    }
  }
  result.bands=result.bands!.map(v=>Math.min(1,v));result.waveform=result.waveform!.map(v=>Math.max(-1,Math.min(1,v)));
  result.energy=Math.min(1,result.energy);result.events=result.events.sort((a,b)=>a.time-b.time).slice(-64);return result;
}
