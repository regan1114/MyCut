export function random(seed:number,index:number){let n=(seed^Math.imul(index+1,0x9e3779b9))>>>0;n=Math.imul(n^(n>>>16),0x21f0aaad);n=Math.imul(n^(n>>>15),0x735a2d97);return ((n^(n>>>15))>>>0)/4294967296;}
export const wrap=(x:number,range=1)=>((x%range)+range)%range;
export const TAU=Math.PI*2;
export const alphaColor=(hex:string,alpha:number)=>`${hex}${Math.round(Math.max(0,Math.min(1,alpha))*255).toString(16).padStart(2,'0')}`;
