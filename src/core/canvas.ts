import {AssetMap,Command,Scene} from './model';
import {fontCSS} from './layout';
import {imageSurface,imagePlacement} from './image';
export function rounded(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number){
  r=Math.max(0,Math.min(r,w/2,h/2));ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
}
export function bounds(cmd:Command):{y:number;h:number}{if(cmd.type==='text')return {y:cmd.y-cmd.ascent,h:cmd.fontSize*1.6};if(cmd.type==='line')return{y:Math.min(cmd.y,cmd.y2)-3,h:Math.abs(cmd.y2-cmd.y)+6};if(cmd.type==='path')return{y:cmd.y,h:cmd.size};return {y:cmd.y,h:cmd.h};}
export function drawScene(ctx:CanvasRenderingContext2D,scene:Scene,assets:AssetMap,scale=1,offsetY=0,sliceHeight=scene.height){
  ctx.save();ctx.scale(scale,scale);ctx.translate(0,-offsetY);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  for(const cmd of scene.commands){const b=bounds(cmd);if(b.y+b.h<offsetY-2||b.y>offsetY+sliceHeight+2)continue;ctx.save();
    if(cmd.type==='rect'){ctx.globalAlpha=cmd.alpha??1;rounded(ctx,cmd.x,cmd.y,cmd.w,cmd.h,cmd.r);ctx.fillStyle=cmd.fill;ctx.fill();if(cmd.stroke){ctx.strokeStyle=cmd.stroke;ctx.lineWidth=cmd.lineWidth||1;ctx.stroke();}}
    else if(cmd.type==='gradient'){const rad=(cmd.angle-90)*Math.PI/180,cx=cmd.x+cmd.w/2,cy=cmd.y+cmd.h/2,extent=Math.abs(Math.cos(rad))*cmd.w/2+Math.abs(Math.sin(rad))*cmd.h/2;const g=ctx.createLinearGradient(cx-Math.cos(rad)*extent,cy-Math.sin(rad)*extent,cx+Math.cos(rad)*extent,cy+Math.sin(rad)*extent);g.addColorStop(0,cmd.c1);g.addColorStop(1,cmd.c2);ctx.fillStyle=g;ctx.fillRect(cmd.x,cmd.y,cmd.w,cmd.h);}
    else if(cmd.type==='text'){ctx.font=fontCSS(cmd.fontSize,cmd.weight,cmd.italic,cmd.family);ctx.fillStyle=cmd.color;ctx.textBaseline='alphabetic';ctx.fillText(cmd.text,cmd.x,cmd.y);ctx.strokeStyle=cmd.color;ctx.lineWidth=Math.max(.7,cmd.fontSize/18);if(cmd.underline){ctx.beginPath();ctx.moveTo(cmd.x,cmd.y+2);ctx.lineTo(cmd.x+cmd.width,cmd.y+2);ctx.stroke();}if(cmd.strike){ctx.beginPath();ctx.moveTo(cmd.x,cmd.y-cmd.fontSize*.3);ctx.lineTo(cmd.x+cmd.width,cmd.y-cmd.fontSize*.3);ctx.stroke();}}
    else if(cmd.type==='line'){ctx.beginPath();ctx.moveTo(cmd.x,cmd.y);ctx.lineTo(cmd.x2,cmd.y2);ctx.strokeStyle=cmd.color;ctx.lineWidth=cmd.width;ctx.stroke();}
    else if(cmd.type==='path'){const vb=cmd.viewBox||[0,0,24,24];ctx.translate(cmd.x,cmd.y);ctx.scale(cmd.size/vb[2],cmd.size/vb[3]);ctx.translate(-vb[0],-vb[1]);ctx.strokeStyle=cmd.color;ctx.fillStyle=cmd.color;ctx.lineWidth=1.7;ctx.lineCap='round';ctx.lineJoin='round';const path=new Path2D(cmd.path);cmd.fill?ctx.fill(path,cmd.fillRule||'nonzero'):ctx.stroke(path);}
    else if(cmd.type==='image'){const a=assets.get(cmd.src);if(a){rounded(ctx,cmd.x,cmd.y,cmd.w,cmd.h,cmd.r);ctx.clip();const p=imagePlacement(cmd,a);ctx.drawImage(imageSurface(a,cmd.blur),p.x,p.y,p.w,p.h);}}
    ctx.restore();
  }ctx.restore();
}
export function canvasBlob(canvas:HTMLCanvasElement,type='image/png',quality?:number):Promise<Blob>{return new Promise((res,rej)=>{try{canvas.toBlob(b=>b?res(b):rej(new Error('浏览器未能编码图像，请降低倍率后重试。')),type,quality);}catch(e){rej(e);}});}
/** Bounds are an app safety budget, not a claim about a specific Apple device. */
export function exportBudget(width:number,height:number,scale:number,mobile:boolean){
  const w=Math.ceil(width*scale),h=Math.ceil(height*scale),pixels=w*h,max=mobile?24000000:90000000,side=mobile?30000:60000;
  return {width:w,height:h,pixels,rawMB:Math.ceil(pixels*4/1024/1024),ok:pixels<=max&&w<=side&&h<=side,maxPixels:max,maxSide:side};
}
