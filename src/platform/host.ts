import {nativeResource} from './resource-network';
import {FONT_URL,Host} from '../core/model';
import {allowedAsset} from '../core/urls';
import {unbase64} from '../export/binary';
import {pageProbe} from './probe';
async function nativeBytes(url:string,signal?:AbortSignal):Promise<Uint8Array>{
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),35000);const abort=()=>ctrl.abort();signal?.addEventListener('abort',abort,{once:true});
  try{const r=await fetch(url,{signal:ctrl.signal,credentials:'omit',referrerPolicy:'no-referrer',redirect:'error'});if(!r.ok)throw new Error(`资源请求失败 (${r.status})`);
    const max=url===FONT_URL?28*1024*1024:20*1024*1024;if(Number(r.headers.get('content-length'))>max)throw new Error('资源超过安全大小限制。');
    if(!r.body){const b=new Uint8Array(await r.arrayBuffer());if(b.length>max)throw new Error('资源过大。');return b;}
    const reader=r.body.getReader(),chunks:Uint8Array[]= [];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new Error('资源超过安全大小限制。');}chunks.push(value);}
    const bytes=new Uint8Array(size);let p=0;for(const c of chunks){bytes.set(c,p);p+=c.length;}return bytes;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export {nativeBytes};
function gmRequest(url:string,signal?:AbortSignal):Promise<Uint8Array>{return new Promise((resolve,reject)=>{
  const modern=typeof GM!=='undefined'?GM:undefined;const send=typeof GM_xmlhttpRequest==='function'?GM_xmlhttpRequest:modern?.xmlHttpRequest;
  if(!send){reject(new Error('脚本管理器未提供 GM_xmlhttpRequest。'));return;}
  let request:any,ended=false;
  const finish=(error?:Error,b?:Uint8Array)=>{if(ended)return;ended=true;signal?.removeEventListener('abort',cancel);error?reject(error):resolve(b!);};
  const cancel=()=>{try{request?.abort();}catch{}finish(new DOMException('已取消','AbortError'));};
  if(signal?.aborted){cancel();return;}
  signal?.addEventListener('abort',cancel,{once:true});
  request=send({url,method:'GET',anonymous:true,responseType:'arraybuffer',timeout:35000,onload:async(r:any)=>{
    try{if(r.status<200||r.status>=300)throw new Error(`资源请求失败 (${r.status})`);let b:Uint8Array;
      if(r.response instanceof ArrayBuffer)b=new Uint8Array(r.response);
      else if(ArrayBuffer.isView(r.response))b=new Uint8Array(r.response.buffer,r.response.byteOffset,r.response.byteLength);
      else if(r.response instanceof Blob)b=new Uint8Array(await r.response.arrayBuffer());
      else throw new Error('Stay 返回的二进制资源格式不受支持。');
      if(b.length>(url===FONT_URL?28:20)*1024*1024)throw new Error('资源超过安全大小限制。');finish(undefined,b);
    }catch(e){finish(e as Error);}
  },onerror:()=>finish(new Error('资源加载失败，请检查网络或 Stay 的站点权限。')),ontimeout:()=>finish(new Error('资源加载超时。')),onabort:cancel});
});}
/** A stalled mobile bridge must not prevent the studio from appearing. */
function storageRead<T>(read:()=>unknown,fallback:T):Promise<T>{return new Promise(resolve=>{
  let done=false;const finish=(v:T)=>{if(done)return;done=true;clearTimeout(timer);resolve(v);};
  const timer=setTimeout(()=>finish(fallback),2000);
  try{Promise.resolve(read()).then(v=>finish(v===undefined?fallback:v as T),()=>finish(fallback));}catch{finish(fallback);}
});}
export function createHost(kind:Host['kind']):Host{
  if(kind==='extension')return {kind,
    async observe(action,sessionId){try{return await chrome.runtime.sendMessage({type:'xc:observe',action,sessionId})||{state:'unavailable',records:[]};}catch{return {state:'unavailable',records:[]};}},
    async openObservationPermission(){try{return !!(await chrome.runtime.sendMessage({type:'xc:observe-enable'}))?.ok;}catch{return false;}},
    async getValue<T>(key:string,fallback:T){const v=await chrome.storage.local.get(key);return v[key]??fallback;},
    async setValue(key,value){await chrome.storage.local.set({[key]:value});},
    async readBytes(url,signal){if(!allowedAsset(url))throw new Error('资源域名不在允许列表。');if(signal?.aborted)throw new DOMException('已取消','AbortError');
      const res=await chrome.runtime.sendMessage({type:'xc:asset',url});if(!res?.ok)throw new Error(res?.error||'资源读取失败。');if(signal?.aborted)throw new DOMException('已取消','AbortError');return unbase64(res.data);},
    async readResource(request,signal){
      const id=typeof crypto.randomUUID==='function'?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint32Array(4)),v=>v.toString(16)).join('-');const cancel=()=>{void chrome.runtime.sendMessage({type:'xc:resource-cancel',requestId:id}).catch(()=>{});};
      if(signal?.aborted)return {status:0,url:request.url,mime:'',bytes:new Uint8Array(),problem:'cancelled'};
      signal?.addEventListener('abort',cancel,{once:true});
      try{const r=await chrome.runtime.sendMessage({type:'xc:resource',requestId:id,request});
        if(signal?.aborted)return {status:0,url:request.url,mime:'',bytes:new Uint8Array(),problem:'cancelled'};
        if(!r?.ok)return {status:0,url:request.url,mime:'',bytes:new Uint8Array(),problem:'network-or-cors'};
        return {...r.response,bytes:unbase64(r.data||'')};
      }finally{signal?.removeEventListener('abort',cancel);}
    },
    async probe(ids){const r=await chrome.runtime.sendMessage({type:'xc:probe',ids});return r?.data||[];}
  };
  return {kind,
    async getValue<T>(key:string,fallback:T){try{if(kind==='stay'){if(typeof GM_getValue==='function')return await storageRead(()=>GM_getValue!(key,fallback),fallback);if(typeof GM!=='undefined'&&GM.getValue)return await storageRead(()=>GM.getValue(key,fallback),fallback);}const v=localStorage.getItem('xc:'+key);return v?JSON.parse(v):fallback;}catch{return fallback;}},
    async setValue(key,value){if(kind==='stay'){if(typeof GM_setValue==='function'){await GM_setValue(key,value);return;}if(typeof GM!=='undefined'&&GM.setValue){await GM.setValue(key,value);return;}}localStorage.setItem('xc:'+key,JSON.stringify(value));},
    async readBytes(url,signal){if(!allowedAsset(url))throw new Error('资源域名不在允许列表。');if(kind==='stay'){try{return await gmRequest(url,signal);}catch(e){if(signal?.aborted)throw e;return nativeBytes(url,signal);}}return nativeBytes(url,signal);},
    readResource:nativeResource,
    async probe(ids){return pageProbe(ids,window);}
  };
}
