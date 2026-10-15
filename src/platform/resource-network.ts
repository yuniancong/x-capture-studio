import type {ResourceRequest,ResourceResponse} from '../media/types';
import {fetchableResource} from '../media/resources';
export function safeResourceRequest(raw:any):ResourceRequest|undefined {
  if(!raw||!fetchableResource(raw.url)||!['image','manifest','headers'].includes(raw.purpose))return;
  const limit=raw.purpose==='image'?8*1024*1024:raw.purpose==='manifest'?524288:65536;
  return {url:raw.url,purpose:raw.purpose,maxBytes:Math.max(1,Math.min(limit,Number(raw.maxBytes)||limit)),timeoutMs:Math.max(500,Math.min(10000,Number(raw.timeoutMs)||6000))};
}
/** No GM bridge is used for new resource validation: older Stay bridges do not
 * document redirect rejection reliably. Native fetch fails closed on CORS/redirect.
 * DOM-discovered addresses remain available even when validation is impossible. */
export async function nativeResource(raw:ResourceRequest,signal?:AbortSignal):Promise<ResourceResponse> {
  const request=safeResourceRequest(raw);const empty=new Uint8Array();
  if(!request)return {status:0,url:'',mime:'',bytes:empty,problem:'domain-blocked'};
  const ctrl=new AbortController();let timed=false;
  const stop=()=>ctrl.abort();if(signal?.aborted)stop();else signal?.addEventListener('abort',stop,{once:true});
  const timer=setTimeout(()=>{timed=true;ctrl.abort();},request.timeoutMs);
  const requestInit:RequestInit={credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',cache:'no-store',signal:ctrl.signal};
  try {
    let response=await fetch(request.url,{...requestInit,method:request.purpose==='headers'?'HEAD':'GET'});
    // A rejected HEAD is not proof a GET resource is unavailable. Bound the fallback.
    if(request.purpose==='headers'&&[405,501].includes(response.status))response=await fetch(request.url,{...requestInit,method:'GET',headers:{Range:'bytes=0-65535'}});
    if(response.redirected||response.url&&response.url!==request.url){await response.body?.cancel();return {status:response.status,url:request.url,mime:'',bytes:empty,problem:'redirect-blocked'};}
    const mime=response.headers.get('content-type')||'',size=Number(response.headers.get('content-length'));
    if(!response.ok){await response.body?.cancel();return {status:response.status,url:request.url,mime,bytes:empty,problem:response.status===404||response.status===410?'not-found':response.status===401||response.status===403?'forbidden':response.status===429?'rate-limit':'http-error'};}
    if(request.purpose==='headers'){await response.body?.cancel();return {status:response.status,url:request.url,mime,bytes:empty};}
    if(size>request.maxBytes){await response.body?.cancel();return {status:response.status,url:request.url,mime,bytes:empty,problem:'too-large'};}
    if(!response.body){return {status:response.status,url:request.url,mime,bytes:empty,problem:'unsupported'};}
    const reader=response.body.getReader(),chunks:Uint8Array[]=[];let received=0;
    while(true){const {value,done}=await reader.read();if(done)break;received+=value.length;if(received>request.maxBytes){await reader.cancel();return {status:response.status,url:request.url,mime,bytes:empty,problem:'too-large'};}chunks.push(value);}
    const bytes=new Uint8Array(received);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
    return {status:response.status,url:request.url,mime,bytes};
  }catch{
    return {status:0,url:request.url,mime:'',bytes:empty,problem:timed?'timeout':signal?.aborted?'cancelled':'network-or-cors'};
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);}
}
export async function decodeImageDimensions(bytes:Uint8Array,mime:string):Promise<{width:number;height:number}> {
  const a=bytes;let type='';
  if(a[0]===0xff&&a[1]===0xd8)type='image/jpeg';
  else if(a.length>24&&a[0]===137&&a[1]===80&&a[2]===78&&a[3]===71)type='image/png';
  else if(a.length>10&&String.fromCharCode(...a.slice(0,3))==='GIF')type='image/gif';
  else if(a.length>16&&String.fromCharCode(...a.slice(0,4))==='RIFF'&&String.fromCharCode(...a.slice(8,12))==='WEBP')type='image/webp';
  else if(a.length>16&&String.fromCharCode(...a.slice(4,8))==='ftyp'&&/avif|avis/.test(String.fromCharCode(...a.slice(8,32))))type='image/avif';
  if(!type)throw new Error('Not a supported bitmap');
  const blob=new Blob([bytes],{type});
  const check=(w:number,h:number)=>{if(!w||!h||w*h>80000000)throw new Error('Image pixel budget');return {width:w,height:h};};
  // Do not instantiate an enormous bitmap if its header already reveals its dimensions.
  if(type==='image/png'){const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);check(v.getUint32(16),v.getUint32(20));}
  if(type==='image/gif')check(a[6]+a[7]*256,a[8]+a[9]*256);
  if(type==='image/jpeg'){
    let offset=2;while(offset+8<a.length){if(a[offset]!==255){offset++;continue;}while(a[offset]===255)offset++;const marker=a[offset++];
      if(marker===217||marker===218)break;if(marker===1||marker>=208&&marker<=215)continue;
      const length=a[offset]*256+a[offset+1];if(length<2||offset+length>a.length)break;
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){check(a[offset+5]*256+a[offset+6],a[offset+3]*256+a[offset+4]);break;}offset+=length;
    }
  }
  if(type==='image/webp'){
    const v=new DataView(a.buffer,a.byteOffset,a.byteLength);let at=12;
    while(at+8<=a.length){const kind=String.fromCharCode(...a.slice(at,at+4)),length=v.getUint32(at+4,true),start=at+8;if(start+length>a.length)break;
      if(kind==='VP8X'&&length>=10)check(1+a[start+4]+256*a[start+5]+65536*a[start+6],1+a[start+7]+256*a[start+8]+65536*a[start+9]);
      if(kind==='VP8L'&&length>=5&&a[start]===47){const bits=v.getUint32(start+1,true);check(1+(bits&16383),1+((bits>>>14)&16383));}
      if(kind==='VP8 '&&length>=10&&a[start+3]===157&&a[start+4]===1&&a[start+5]===42)check(v.getUint16(start+6,true)&16383,v.getUint16(start+8,true)&16383);
      at=start+length+(length%2);
    }
  }
  if(type==='image/avif'){
    // ispe dimensions occur inside a bounded ISO-BMFF property box. Inspect only valid box sizes.
    const v=new DataView(a.buffer,a.byteOffset,a.byteLength);for(let at=4;at+16<a.length;at++)if(a[at]===105&&a[at+1]===115&&a[at+2]===112&&a[at+3]===101){const size=v.getUint32(at-4);if(size>=20&&at-4+size<=a.length)check(v.getUint32(at+8),v.getUint32(at+12));}
  }
  if(typeof createImageBitmap==='function'){let bitmap:ImageBitmap|undefined;try{bitmap=await createImageBitmap(blob);return check(bitmap.width,bitmap.height);}finally{bitmap?.close();}}
  const url=URL.createObjectURL(blob);try{return await new Promise((resolve,reject)=>{const im=new Image(),timer=setTimeout(()=>{im.src='';reject(new Error('Image decode timeout'));},7000);im.onload=()=>{clearTimeout(timer);try{resolve(check(im.naturalWidth,im.naturalHeight));}catch(e){reject(e);}};im.onerror=()=>{clearTimeout(timer);reject(new Error('Image decode failed'));};im.src=url;});}finally{URL.revokeObjectURL(url);}
}
