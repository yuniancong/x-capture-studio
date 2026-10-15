import type {Capture,Media} from '../core/model';
import type {ResourceVariant,ResourceResponse,ResourceTransport,ResourceRequest,ManifestResult} from './types';
import {existingVariants,imageCandidates,preferredImage,mergeVariants,mergeTracks,fetchableResource,sensitiveURL,visitMedia,variantKey} from './resources';
import {parseHLS} from './hls';
import {parseDASH} from './dash';
import {parseVMAP} from './vmap';
import {decodeImageDimensions} from '../platform/resource-network';
export interface ResolveLimits {maxRequests:number;maxBytes:number;maxDepth:number;timeoutMs:number;maxMs:number;}
export const RESOLVE_LIMITS:ResolveLimits={maxRequests:32,maxBytes:24*1024*1024,maxDepth:2,timeoutMs:6000,maxMs:28000};
interface Session {signal:AbortSignal;requests:number;bytes:number;reserved:number;limited:boolean;allowSensitive:boolean;}
type ImageCheck={response:Omit<ResourceResponse,'bytes'>;size?:{width:number;height:number}};
/** All lookups are bounded, optional and user-triggered. No segment/key downloads. */
export class MediaResolver {
  private images=new Map<string,{time:number;value:ImageCheck}>();
  private playlists=new Map<string,{time:number;value:ManifestResult}>();
  readonly limits:ResolveLimits;
  constructor(private transport:ResourceTransport,private decode=decodeImageDimensions,limits:Partial<ResolveLimits>={}){this.limits={...RESOLVE_LIMITS,...limits};}
  clear(){this.images.clear();this.playlists.clear();}
  private async request(url:string,purpose:ResourceRequest['purpose'],s:Session):Promise<ResourceResponse> {
    const denied=(problem:ResourceResponse['problem']):ResourceResponse=>({status:0,url,mime:'',bytes:new Uint8Array(),problem});
    if(s.signal.aborted)return denied('cancelled');if(!fetchableResource(url))return denied('domain-blocked');if(sensitiveURL(url)&&!s.allowSensitive)return denied('sensitive');
    if(s.requests>=this.limits.maxRequests||s.bytes+s.reserved>=this.limits.maxBytes){s.limited=true;return denied('budget');}
    s.requests++;const maxBytes=Math.min(this.limits.maxBytes-s.bytes-s.reserved,purpose==='image'?8*1024*1024:purpose==='manifest'?524288:65536);
    s.reserved+=maxBytes;
    const ctrl=new AbortController();let finish!:(r:ResourceResponse)=>void,settled=false;
    const waiting=new Promise<ResourceResponse>(resolve=>{finish=r=>{if(!settled){settled=true;resolve(r);}};});
    const stop=()=>{ctrl.abort();finish(denied('cancelled'));};s.signal.addEventListener('abort',stop,{once:true});
    const timer=setTimeout(()=>{ctrl.abort();finish(denied('timeout'));},this.limits.timeoutMs);
    try{
      if(s.signal.aborted)stop();else Promise.resolve().then(()=>this.transport({url,purpose,maxBytes,timeoutMs:this.limits.timeoutMs},ctrl.signal)).then(finish,()=>finish(denied(ctrl.signal.aborted?'cancelled':'network-or-cors')));
      const r=await waiting;s.bytes+=r.bytes.length;
      if(r.bytes.length>maxBytes)return denied('too-large');if(r.url!==url)return denied('redirect-blocked');return r;
    }finally{clearTimeout(timer);s.signal.removeEventListener('abort',stop);s.reserved-=maxBytes;}
  }
  private failure(v:ResourceVariant,r:ResourceResponse):ResourceVariant {
    const problem=r.problem||(r.status===404||r.status===410?'not-found':r.status===403||r.status===401?'forbidden':r.status===429?'rate-limit':'http-error');
    // CORS errors and inaccessible verification bridges are not invalidation evidence.
    return {...v,state:problem==='not-found'?'unavailable':problem==='domain-blocked'||problem==='sensitive'?'blocked':'unverified',checkedAt:new Date().toISOString(),httpStatus:r.status||undefined,problem};
  }
  private async image(m:Media,s:Session):Promise<void> {
    const candidates=imageCandidates(m);m.variants=mergeVariants(m.variants,candidates);let best:ResourceVariant|undefined;
    for(const v of candidates){
      if(s.signal.aborted||s.limited)break;
      if(v.kind!=='image')continue;
      // A successful orig response is not automatically larger than declared/observed alternatives.
      if(best&&!(v.source!=='image-rule'&&(v.width||v.descriptorWidth||0)>(best.width||0)))continue;
      const cached=this.images.get(v.url);let c:ImageCheck;
      if(cached&&Date.now()-cached.time<120000)c=cached.value;
      else{
        const r=await this.request(v.url,'image',s);c={response:{status:r.status,url:r.url,mime:r.mime,problem:r.problem}};
        if(!r.problem&&r.status>=200&&r.status<300){try{c.size=await this.decode(r.bytes,r.mime);}catch{c.response.problem='invalid-content';}}
        if(!['cancelled','budget','sensitive','domain-blocked'].includes(c.response.problem||'')){if(this.images.size>=64)this.images.delete(this.images.keys().next().value!);this.images.set(v.url,{time:Date.now(),value:c});}
      }
      const check=c.size?{...v,...c.size,state:'verified' as const,verifiedBy:'image-decode' as const,checkedAt:new Date().toISOString(),httpStatus:c.response.status,problem:undefined}:this.failure(v,{...c.response,bytes:new Uint8Array()});
      m.variants=mergeVariants(m.variants,[check]);
      if(c.size){if(!best||c.size.width*c.size.height>(best.width||0)*(best.height||0))best=check;continue;}
      if(['budget','cancelled'].includes(c.response.problem||''))break;
    }
    if(best){
      // The current image may already have a measured, larger bitmap than a CDN candidate.
      const measured=existingVariants(m).filter(v=>v.kind==='image'&&v.source==='dom'&&v.width&&v.height&&v.state!=='unavailable');
      const better=measured.find(v=>v.width!*v.height!>best!.width!*best!.height!);m.selectedImageUrl=(better||best).url;
      m.resourceNotes=[best.name==='orig'?'已验证原尺寸请求返回图片；不保证超过平台保留的原始质量。':'已选择验证成功的可用图片；原尺寸不可用时降级。'];
    }else{
      const observed=preferredImage(m);m.selectedImageUrl=observed?.url;
      m.resourceNotes=['高清验证未完成，保留页面已提供的图片链接；不宣称原尺寸已取得。'];m.resolutionStatus='partial';
    }
  }
  private async streams(m:Media,s:Session):Promise<void> {
    m.variants=existingVariants(m);const queue=m.variants.filter(v=>['hls','dash','vmap'].includes(v.kind)&&!v.representationId).map(v=>({v,depth:0,vars:{} as Record<string,string>}));
    const visited=new Set<string>();let failed=!m.variants.some(v=>['file','hls','dash','vmap'].includes(v.kind));
    while(queue.length&&!s.signal.aborted&&!s.limited){
      const item=queue.shift()!,v=item.v;if(visited.has(v.url))continue;visited.add(v.url);
      if(item.depth>this.limits.maxDepth){failed=true;continue;}
      if(v.encrypted||v.drm){failed=true;continue;}
      const key=v.kind+'|'+v.url+'|'+(v.role||'video')+'|'+JSON.stringify(item.vars);const cached=this.playlists.get(key);let parsed:ManifestResult|undefined;
      if(cached&&Date.now()-cached.time<(cached.value.info.live?15000:120000))parsed=cached.value;
      else{
        const r=await this.request(v.url,'manifest',s);
        if(r.problem||r.status<200||r.status>=300){m.variants=mergeVariants(m.variants,[this.failure(v,r)]);failed=true;continue;}
        try{
          const text=new TextDecoder('utf-8',{fatal:true}).decode(r.bytes);
          parsed=v.kind==='hls'?parseHLS(text,v.url,item.vars,v.role==='audio'||v.role==='subtitle'?v.role:undefined):v.kind==='dash'?parseDASH(text,v.url):parseVMAP(text,v.url);
          if(this.playlists.size>=32)this.playlists.delete(this.playlists.keys().next().value!);this.playlists.set(key,{time:Date.now(),value:parsed});
        }catch{m.variants=mergeVariants(m.variants,[this.failure(v,{...r,problem:'invalid-content'})]);failed=true;continue;}
      }
      // Repeated resolution uses fresh values; do not mutate cached parse records.
      const variants=parsed.variants.map(x=>({...x,parentUrl:x.url===v.url?v.parentUrl:x.parentUrl,sensitive:x.sensitive||v.sensitive}));
      m.variants=mergeVariants(m.variants,variants);
      // Root identity (parent/groups) must get the same successful check, not stay as duplicate observed.
      m.variants=mergeVariants(m.variants,[{...v,...(parsed.info.type==='hls-master'?{width:undefined,height:undefined,dimensionSource:undefined}:{}),state:'verified',verifiedBy:'manifest-parse',checkedAt:new Date().toISOString(),playlist:parsed.info.type==='hls-master'?'master':v.kind==='hls'?'media':undefined,live:parsed.info.live,encrypted:parsed.info.encrypted,drm:parsed.info.drm}]);
      m.tracks=mergeTracks(m.tracks,parsed.tracks.map(t=>({...t,sensitive:t.sensitive||v.sensitive}))).map(t=>t.url===v.url?{...t,state:'verified',evidence:t.evidence==='cue-confirmed'?'cue-confirmed':'resource-validated',encrypted:t.encrypted||parsed!.info.encrypted}:t);
      const infos=new Map((m.manifests||[]).map(i=>[i.url,i]));infos.set(parsed.info.url,parsed.info);m.manifests=[...infos.values()].slice(0,64);
      if(parsed.info.encrypted)continue;
      const next=variants.filter(x=>['hls','dash','vmap'].includes(x.kind)&&x.url!==v.url&&!x.representationId&&x.role!=='iframe');
      // Video children, subtitle playlists and audio playlists all have a bounded chance to be inspected.
      next.sort((a,b)=>Number(b.role==='subtitle')-Number(a.role==='subtitle')||Number(b.role==='audio')-Number(a.role==='audio')||(b.height||0)-(a.height||0));
      for(const child of next)if(!visited.has(child.url))queue.push({v:child,depth:item.depth+1,vars:parsed.variables||{}});
    }
    if(queue.length)failed=true;
    // Check direct files using headers only; no video or subtitle body download.
    for(const v of m.variants.filter(v=>v.kind==='file'&&!v.segmented).slice(0,3)){
      if(s.signal.aborted||s.limited)break;
      const r=await this.request(v.url,'headers',s);
      if(r.problem||r.status<200||r.status>=300){m.variants=mergeVariants(m.variants,[this.failure(v,r)]);failed=true;}
      else if(!/^video\/|^application\/octet-stream/i.test(r.mime)){m.variants=mergeVariants(m.variants,[this.failure(v,{...r,problem:'invalid-content'})]);failed=true;}
      else m.variants=mergeVariants(m.variants,[{...v,state:'verified',verifiedBy:'headers',checkedAt:new Date().toISOString(),httpStatus:r.status}]);
    }
    m.resolutionStatus=failed?'partial':'complete';
  }
  async resolveOne(m:Media,signal?:AbortSignal,allowSensitive=false):Promise<void> {
    const ctrl=new AbortController(),stop=()=>ctrl.abort();if(signal?.aborted)stop();else signal?.addEventListener('abort',stop,{once:true});
    const timer=setTimeout(stop,this.limits.maxMs),s:Session={signal:ctrl.signal,requests:0,bytes:0,reserved:0,limited:false,allowSensitive};
    try{m.resolutionStatus='pending';if(m.kind==='image')await this.image(m,s);else await this.streams(m,s);m.resolutionStatus=s.limited||ctrl.signal.aborted?'partial':(m.resolutionStatus as string)==='partial'?'partial':'complete';}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);}
  }
  async resolveCapture(c:Capture,selected:Set<string>,signal?:AbortSignal,allowSensitive=false,quotes=true,onProgress?:(done:number,total:number)=>void):Promise<{requests:number;bytes:number;partial:boolean}> {
    const ctrl=new AbortController(),stop=()=>ctrl.abort();if(signal?.aborted)stop();else signal?.addEventListener('abort',stop,{once:true});const timer=setTimeout(stop,this.limits.maxMs);
    const s:Session={signal:ctrl.signal,requests:0,bytes:0,reserved:0,limited:false,allowSensitive},items:Media[]=[];
    visitMedia(c,selected,m=>{m.variants=existingVariants(m);items.push(m);},quotes);let cursor=0,done=0;
    const worker=async()=>{while(cursor<items.length){const m=items[cursor++];if(ctrl.signal.aborted||s.limited)break;m.resolutionStatus='pending';
      try{if(m.kind==='image')await this.image(m,s);else await this.streams(m,s);if(m.resolutionStatus==='pending')m.resolutionStatus='complete';}
      catch{m.resolutionStatus='partial';}done++;onProgress?.(done,items.length);
    }};
    try{await Promise.all([worker(),worker()]);return {requests:s.requests,bytes:s.bytes,partial:s.limited||ctrl.signal.aborted||done<items.length||items.some(m=>m.resolutionStatus==='partial')};}
    finally{for(const m of items)if(m.resolutionStatus==='pending')m.resolutionStatus='partial';clearTimeout(timer);signal?.removeEventListener('abort',stop);}
  }
}
