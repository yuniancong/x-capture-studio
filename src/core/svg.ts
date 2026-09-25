/** Strict SVG geometry reader. Produces absolute M/L/C/Z only, shared by Canvas
 * and the PDF writer. No HTML, CSS, scripts, href, external assets or transforms. */
export function absolutePath(input:string):string|undefined {
  if(!input||input.length>16000||/[^MmLlHhVvCcSsQqTtAaZz\d\s,.+eE-]/.test(input))return;
  const t=input.match(/[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)||[];
  let i=0,cmd='',x=0,y=0,sx=0,sy=0,cx=0,cy=0,qx=0,qy=0,prev='',out:string[]=[];
  const n=(v:number)=>String(Math.round(v*1e6)/1e6);
  const line=(a:number,b:number)=>{out.push(`L${n(a)} ${n(b)}`);x=a;y=b;};
  const curve=(a:number,b:number,c:number,d:number,e:number,f:number)=>{out.push(`C${n(a)} ${n(b)} ${n(c)} ${n(d)} ${n(e)} ${n(f)}`);cx=c;cy=d;x=e;y=f;};
  const count:Record<string,number>={M:2,L:2,H:1,V:1,C:6,S:4,Q:4,T:2,A:7};
  try { while(i<t.length){
    if(/^[A-Za-z]$/.test(t[i]))cmd=t[i++]; else if(!cmd)throw 0;
    const op=cmd.toUpperCase(),rel=cmd!==op,ox=x,oy=y;
    if(op==='Z'){out.push('Z');x=sx;y=sy;prev=op;cmd='';continue;}
    const k=count[op];if(!k||i+k>t.length)throw 0;
    const v=t.slice(i,i+k).map(Number);i+=k;if(v.some(z=>!Number.isFinite(z)||Math.abs(z)>1e6))throw 0;
    const X=(a:number)=>a+(rel?ox:0),Y=(a:number)=>a+(rel?oy:0);
    if(op==='M'){x=X(v[0]);y=Y(v[1]);sx=x;sy=y;out.push(`M${n(x)} ${n(y)}`);cmd=rel?'l':'L';}
    else if(op==='L')line(X(v[0]),Y(v[1]));
    else if(op==='H')line(X(v[0]),y);
    else if(op==='V')line(x,Y(v[0]));
    else if(op==='C')curve(X(v[0]),Y(v[1]),X(v[2]),Y(v[3]),X(v[4]),Y(v[5]));
    else if(op==='S')curve(prev==='C'||prev==='S'?2*x-cx:x,prev==='C'||prev==='S'?2*y-cy:y,X(v[0]),Y(v[1]),X(v[2]),Y(v[3]));
    else if(op==='Q'||op==='T'){
      const ax=op==='Q'?X(v[0]):prev==='Q'||prev==='T'?2*x-qx:x,ay=op==='Q'?Y(v[1]):prev==='Q'||prev==='T'?2*y-qy:y;
      const bx=X(v[op==='Q'?2:0]),by=Y(v[op==='Q'?3:1]);qx=ax;qy=ay;
      curve(x+(ax-x)*2/3,y+(ay-y)*2/3,bx+(ax-bx)*2/3,by+(ay-by)*2/3,bx,by);
    }else if(op==='A'){
      let [rx,ry,rot,large,sweep,ex,ey]=v;ex=X(ex);ey=Y(ey);rx=Math.abs(rx);ry=Math.abs(ry);
      if(!(large===0||large===1)||!(sweep===0||sweep===1))throw 0;
      if(rx===0||ry===0)line(ex,ey);
      else if(x!==ex||y!==ey){
        const phi=rot*Math.PI/180,cp=Math.cos(phi),sp=Math.sin(phi),dx=(x-ex)/2,dy=(y-ey)/2,px=cp*dx+sp*dy,py=-sp*dx+cp*dy;
        const lam=px*px/(rx*rx)+py*py/(ry*ry);if(lam>1){rx*=Math.sqrt(lam);ry*=Math.sqrt(lam);}
        const rxx=rx*rx,ryy=ry*ry,d=rxx*py*py+ryy*px*px;
        const f=(large===sweep?-1:1)*Math.sqrt(Math.max(0,(rxx*ryy-rxx*py*py-ryy*px*px)/d));
        const acx=f*rx*py/ry,acy=-f*ry*px/rx,ccx=cp*acx-sp*acy+(x+ex)/2,ccy=sp*acx+cp*acy+(y+ey)/2;
        let a=Math.atan2((py-acy)/ry,(px-acx)/rx),delta=Math.atan2((-py-acy)/ry,(-px-acx)/rx)-a;
        if(sweep&&delta<0)delta+=Math.PI*2;if(!sweep&&delta>0)delta-=Math.PI*2;
        const steps=Math.ceil(Math.abs(delta)/(Math.PI/2)),step=delta/steps;
        const point=(a:number)=>[ccx+cp*rx*Math.cos(a)-sp*ry*Math.sin(a),ccy+sp*rx*Math.cos(a)+cp*ry*Math.sin(a)];
        const derivative=(a:number)=>[-cp*rx*Math.sin(a)-sp*ry*Math.cos(a),-sp*rx*Math.sin(a)+cp*ry*Math.cos(a)];
        for(let z=0;z<steps;z++){const b=a+step,k=4/3*Math.tan(step/4),p0=point(a),p1=point(b),d0=derivative(a),d1=derivative(b);curve(p0[0]+k*d0[0],p0[1]+k*d0[1],p1[0]-k*d1[0],p1[1]-k*d1[1],p1[0],p1[1]);a=b;}
        x=ex;y=ey;
      }
    }
    prev=op;if(out.length>4096)throw 0;
  }return out.join(' '); }catch{return;}
}
export function hexColor(value:string,fallback='#1d9bf0'):string {
  if(/^#[\da-f]{6}$/i.test(value))return value;
  if(/^#[\da-f]{3}$/i.test(value))return '#'+value.slice(1).split('').map(c=>c+c).join('');
  const rgb=value.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  return rgb?'#'+rgb.slice(1).map(v=>Math.max(0,Math.min(255,Number(v))).toString(16).padStart(2,'0')).join(''):fallback;
}
