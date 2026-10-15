import type {Capture,Media} from '../core/model';
import type {ResourceVariant} from './types';
import {resourceURL,variant,existingVariants,mergeVariants,mergeTracks,visitMedia,mediaFormat} from './resources';

export interface ObservedResource {
  url:string; mime?:string; status?:number; frameId:number; source:'network'|'performance';
  observedAt:number; requestType?:string; problem?:'request-error';
}
export interface ObservationContext {tabId:number;documentId:string;page:string;sessionId:string;}
export type ObservationState='active'|'expired'|'stopped'|'permission-required'|'unsupported'|'scope-changed'|'unavailable';
export interface ObservationResult {state:ObservationState;records:ObservedResource[];expiresAt?:number;limited?:boolean;segments?:number;}
export interface ObservationSession extends ObservationContext {
  startedAt:number;expiresAt:number;records:ObservedResource[];limited:boolean;segments:number;
}
export const OBSERVATION_LIMITS={durationMs:30000,maxSessions:8,maxRecords:96,maxURLLength:4096};

export function xPageKey(value:unknown):string|undefined {
  if(typeof value!=='string')return;
  try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||! /^(?:www\.|mobile\.)?(?:x\.com|twitter\.com)$/.test(u.hostname))return;
    return u.origin+u.pathname;
  }catch{return;}
}
/** A small approved media endpoint set, not a browser-history collector. */
export function observedMediaURL(value:unknown):string|undefined {
  if(typeof value!=='string'||value.length>OBSERVATION_LIMITS.maxURLLength)return;
  const url=resourceURL(value);if(!url)return;const u=new URL(url);
  if(u.protocol!=='https:'||u.port||u.hostname!=='video.twimg.com')return;
  return url;
}
function contextOK(v:ObservationContext):boolean {
  return Number.isInteger(v.tabId)&&v.tabId>=0&&!!xPageKey(v.page)&&
    typeof v.documentId==='string'&&v.documentId.length>0&&v.documentId.length<=160&&
    /^[A-Za-z0-9_-]{8,100}$/.test(v.sessionId);
}
export function acceptedVariant(url:string,mime=''):ResourceVariant|undefined {
  const v=variant({url,mime},'network');
  return v&&['file','hls','dash','audio','subtitle','vmap','segment'].includes(v.kind)?v:undefined;
}
export interface MediaEvent {tabId:number;frameId:number;documentId?:string;initiator?:string;url:string;type:string;requestId?:string;mime?:string;statusCode?:number;error?:boolean;}
/** Pure, bounded session policy. Chrome integration below it never persists arbitrary event objects. */
export class ObservationLedger {
  private sessions=new Map<number,ObservationSession>();
  constructor(saved:unknown=[],now=Date.now()) {
    if(!Array.isArray(saved))return;
    for(const raw of saved.slice(0,OBSERVATION_LIMITS.maxSessions)){
      if(!raw||!contextOK(raw)||!Number.isFinite(raw.startedAt)||!Number.isFinite(raw.expiresAt)||raw.expiresAt<=now||
         raw.expiresAt-raw.startedAt>OBSERVATION_LIMITS.durationMs||raw.startedAt>now)continue;
      const session:ObservationSession={tabId:raw.tabId,documentId:raw.documentId,page:xPageKey(raw.page)!,sessionId:raw.sessionId,
        startedAt:raw.startedAt,expiresAt:raw.expiresAt,records:[],limited:raw.limited===true,segments:Math.min(9999,Math.max(0,Number(raw.segments)||0))};
      for(const r of (Array.isArray(raw.records)?raw.records:[]).slice(0,OBSERVATION_LIMITS.maxRecords)){
        const url=observedMediaURL(r?.url);if(!url||!acceptedVariant(url,r.mime)||!Number.isFinite(r.observedAt)||r.observedAt<session.startedAt||r.observedAt>now)continue;
        session.records.push({url,mime:typeof r.mime==='string'?r.mime.slice(0,120):undefined,status:Number.isInteger(r.status)?r.status:undefined,
          frameId:0,source:'network',observedAt:r.observedAt,requestType:['media','xmlhttprequest','other'].includes(r.requestType)?r.requestType:undefined,
          problem:r.problem==='request-error'?'request-error':undefined});
      }
      this.sessions.set(raw.tabId,session);
    }
  }
  prune(now=Date.now()):void {for(const [id,s]of this.sessions)if(s.expiresAt<=now)this.sessions.delete(id);}
  begin(c:ObservationContext,now=Date.now()):boolean {
    this.prune(now);if(!contextOK(c)||this.sessions.size>=OBSERVATION_LIMITS.maxSessions&&!this.sessions.has(c.tabId))return false;
    this.sessions.set(c.tabId,{...c,page:xPageKey(c.page)!,startedAt:now,expiresAt:now+OBSERVATION_LIMITS.durationMs,records:[],limited:false,segments:0});return true;
  }
  allows(e:MediaEvent,now=Date.now()):boolean {
    this.prune(now);const s=this.sessions.get(e.tabId);
    // Only top-document X requests. Foreign and opaque initiators fail closed.
    if(!s||now<s.startedAt||e.frameId!==0||!xPageKey(e.initiator)||new URL(e.initiator!).origin!==new URL(s.page).origin||
      e.documentId&&e.documentId!==s.documentId||!['media','xmlhttprequest','other'].includes(e.type)||!observedMediaURL(e.url))return false;
    return true;
  }
  record(e:MediaEvent,now=Date.now()):boolean {
    if(!this.allows(e,now))return false;const s=this.sessions.get(e.tabId)!;
    const url=observedMediaURL(e.url)!,v=acceptedVariant(url,e.mime);if(!v)return false;
    if(v.kind==='segment'){s.segments=Math.min(9999,s.segments+1);return false;}
    const old=s.records.find(r=>r.url===url);
    if(!old&&s.records.length>=OBSERVATION_LIMITS.maxRecords){s.limited=true;return false;}
    const r:ObservedResource={url,source:'network',frameId:e.frameId,observedAt:old?.observedAt??now,
      mime:e.mime?.split(';')[0].trim().toLowerCase().slice(0,120)||old?.mime,status:e.statusCode??old?.status,
      requestType:e.type,problem:e.error?'request-error':old?.problem};
    if(old)s.records[s.records.indexOf(old)]=r;else s.records.push(r);return true;
  }
  poll(c:ObservationContext,now=Date.now()):ObservationResult {
    const s=this.sessions.get(c.tabId);
    if(!s)return {state:'stopped',records:[]};
    if(s.sessionId!==c.sessionId||s.documentId!==c.documentId||s.page!==xPageKey(c.page))return {state:'scope-changed',records:[]};
    if(s.expiresAt<=now){this.sessions.delete(c.tabId);return {state:'expired',records:[]};}
    return {state:'active',records:s.records.map(r=>({...r})),expiresAt:s.expiresAt,limited:s.limited,segments:s.segments};
  }
  stop(tabId:number,sessionId?:string):void {const s=this.sessions.get(tabId);if(s&&(!sessionId||sessionId===s.sessionId))this.sessions.delete(tabId);}
  session(tabId:number):ObservationSession|undefined {return this.sessions.get(tabId);}
  dump(now=Date.now()):ObservationSession[] {this.prune(now);return [...this.sessions.values()].map(s=>({...s,records:s.records.map(r=>({...r}))}));}
}

/** CDN resource identifiers are media IDs, NOT tweet IDs; thumbnails supply identity evidence too. */
export function mediaFamilies(value:string):string[] {
  const url=resourceURL(value);if(!url)return [];const u=new URL(url);
  if(!['video.twimg.com','pbs.twimg.com'].includes(u.hostname))return [];
  const m=u.pathname.match(/^\/(amplify_video|ext_tw_video)(?:_thumb)?\/(\d+)(?:\/|$)/);
  if(m)return [m[1]+':'+m[2],'media-id:'+m[2]];
  const gif=u.pathname.match(/^\/tweet_video(?:_thumb)?\/([A-Za-z0-9_-]+)(?:\.[a-z0-9]+)?$/i);
  return gif?['tweet-video:'+gif[1]]:[];
}
function mediaIdentity(m:Media):Set<string> {
  const keys=new Set<string>();
  for(const u of [m.posterUrl,m.src,m.sourceUrl,...existingVariants(m).map(v=>v.url)])if(u)for(const k of mediaFamilies(u))keys.add(k);
  const id=m.mediaId?.match(/^(?:\d+_)?(\d+)$/)?.[1];if(id)keys.add('media-id:'+id);
  return keys;
}
export interface DiscoverySummary {matched:number;unmatched:number;ambiguous:number;segments:number;ignored:number;formats:string[];pending:ObservedResource[];}
/** Attach only with exact URL or a unique confirmed media-family identity. Never use time proximity alone. */
export function attachObservations(c:Capture,selected:Set<string>,records:ObservedResource[],quotes=true):DiscoverySummary {
  const targets:Media[]=[];visitMedia(c,selected,m=>{if(m.kind!=='image')targets.push(m);},quotes);
  const identities=targets.map(mediaIdentity),urls=targets.map(m=>new Set(existingVariants(m).map(v=>v.url)));
  const result:DiscoverySummary={matched:0,unmatched:0,ambiguous:0,segments:0,ignored:0,formats:[],pending:[]};
  const seen=new Set<string>();
  for(const r of records.slice(0,192)){
    const url=observedMediaURL(r.url);if(!url||seen.has(url)){result.ignored++;continue;}seen.add(url);
    const v=variant({url,mime:r.mime},r.source==='performance'?'performance':'network');
    if(!v||!['file','hls','dash','vmap','audio','subtitle','segment'].includes(v.kind)){result.ignored++;continue;}
    if(v.kind==='segment'){result.segments++;continue;}
    const exact=targets.map((_,i)=>urls[i].has(url)?i:-1).filter(i=>i>=0);
    const family=mediaFamilies(url);const matches=exact.length?exact:identities.map((id,i)=>family.some(k=>id.has(k))?i:-1).filter(i=>i>=0);
    if(matches.length!==1){matches.length?result.ambiguous++:result.unmatched++;result.pending.push({...r,url});continue;}
    const m=targets[matches[0]];
    v.discoveredAt=new Date(r.observedAt).toISOString();v.httpStatus=r.status;
    // Successful request observation is not file/manifest validation.
    if(r.status===404||r.status===410){v.state='unavailable';v.problem='not-found';}
    else if(r.status&&r.status>=400||r.problem){v.state='unverified';v.problem=r.status===401||r.status===403?'forbidden':'network-or-cors';}
    m.variants=mergeVariants(m.variants,[v]);
    if(v.kind==='subtitle')m.tracks=mergeTracks(m.tracks,[{id:'observed-sub:'+url,kind:'subtitles',url,format:mediaFormat(url,r.mime),mime:r.mime,
      state:'observed',source:v.source,evidence:'url-observed'}]);
    result.matched++;if(!result.formats.includes(v.kind))result.formats.push(v.kind);
  }return result;
}
/** Read only allowlisted names already in this document's performance timeline. TAO is not bypassed. */
export function performanceMediaEntries(p:Pick<Performance,'getEntriesByType'|'timeOrigin'>,now=Date.now()):ObservedResource[] {
  try{
    const out:ObservedResource[]=[],seen=new Set<string>();
    for(const e of p.getEntriesByType('resource').slice(-512).reverse()){
      const url=observedMediaURL(e.name);if(!url||seen.has(url))continue;
      const observedAt=p.timeOrigin+e.startTime;
      if(!Number.isFinite(observedAt)||observedAt>now+1000||now-observedAt>120000)continue;
      const v=acceptedVariant(url);if(!v||v.kind==='segment')continue;
      seen.add(url);out.push({url,source:'performance',frameId:0,observedAt});if(out.length>=96)break;
    }return out;
  }catch{return [];}
}

/** Diagnostics intentionally contain no URLs, account handles, titles, or signed query parameters. */
export function resourceDiagnostics(c:Capture,selected:Set<string>,quotes=true):string[] {
  const lines:string[]=[];let n=0;
  visitMedia(c,selected,m=>{
    if(m.kind==='image')return;n++;
    const vs=existingVariants(m),from=(s:string)=>vs.filter(v=>(v.sources||[v.source]).includes(s as any)).length;
    const kinds=['file','hls','dash'].map(k=>k.toUpperCase()+':'+vs.filter(v=>v.kind===k&&!v.segmented).length).join(' ');
    const tracks=m.tracks||[],hints=tracks.filter(t=>t.evidence==='hint'||!t.evidence&&t.source==='track'&&!t.url).length;
    lines.push(`视频 ${n}｜DOM ${m.domSourceKind||'未记录'}｜页面数据 ${from('page-data')}｜网络 ${from('network')}｜时间线条目 ${from('performance')}｜${kinds}｜已解析清单 ${(m.manifests||[]).length}｜字幕元信息 ${hints} / 轨道 ${tracks.length}`);
  },quotes);
  return lines.length?lines:['已选内容中没有视频。'];
}
