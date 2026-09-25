import {Asset,ImageCommand} from './model';
const processed=new WeakMap<Asset,Map<number,HTMLCanvasElement>>();
/** Local, bounded backdrop softening. Shared by PNG and PDF, including WebKit without ctx.filter. */
export function imageSurface(asset:Asset,blur=0):HTMLImageElement|HTMLCanvasElement {
  if(blur<=0)return asset.image;
  let cache=processed.get(asset);if(!cache){cache=new Map();processed.set(asset,cache);}
  const key=Math.round(blur);if(cache.has(key))return cache.get(key)!;
  const ratio=Math.min(1,1600/Math.max(asset.width,asset.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(asset.width*ratio));canvas.height=Math.max(1,Math.round(asset.height*ratio));
  const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(asset.image,0,0,canvas.width,canvas.height);
  const data=ctx.getImageData(0,0,canvas.width,canvas.height),w=canvas.width,h=canvas.height,tmp=new Uint8ClampedArray(data.data.length);
  const radius=Math.max(1,Math.round(key*.6)),div=radius*2+1;
  const pass=(src:Uint8ClampedArray,dst:Uint8ClampedArray,horizontal:boolean)=>{
    const outer=horizontal?h:w,inner=horizontal?w:h;
    for(let j=0;j<outer;j++)for(let channel=0;channel<4;channel++){
      const at=(i:number)=>((horizontal?j*w+Math.max(0,Math.min(inner-1,i)):Math.max(0,Math.min(inner-1,i))*w+j)*4+channel);
      let sum=0;for(let k=-radius;k<=radius;k++)sum+=src[at(k)];
      for(let i=0;i<inner;i++){dst[at(i)]=sum/div;sum+=src[at(i+radius+1)]-src[at(i-radius)];}
    }
  };
  for(let i=0;i<3;i++){pass(data.data,tmp,true);pass(tmp,data.data,false);}ctx.putImageData(data,0,0);
  // A slider must not retain a full bitmap for every intermediate value.
  if(cache.size>=2){const first=cache.keys().next().value!;const old=cache.get(first)!;old.width=old.height=1;cache.delete(first);}
  cache.set(key,canvas);return canvas;
}
export function imagePlacement(cmd:ImageCommand,asset:Asset){
  const k=cmd.fit==='cover'?Math.max(cmd.w/asset.width,cmd.h/asset.height):Math.min(cmd.w/asset.width,cmd.h/asset.height);
  const w=asset.width*k,h=asset.height*k;
  return {x:cmd.x+(cmd.w-w)*(cmd.positionX??50)/100,y:cmd.y+(cmd.h-h)*(cmd.positionY??50)/100,w,h};
}
