import type {Media,Post,Block,Capture} from '../core/model';
import type {ResourceKind,ResourceSource,ResourceVariant,MediaTrack} from './types';

export function resourceURL(value:unknown,base?:string):string|undefined {
  if(typeof value!=='string'||value.length>12000||/[\u0000-\u0020\u007f\\]/.test(value))return;
  try {const u=new URL(value,base);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return;
    if(!u.hostname||/^(?:localhost|.*\.localhost|.*\.local|.*\.internal|.*\.lan)$/.test(u.hostname)||u.hostname.includes(':')||/^\d+(?:\.\d+){0,3}$/.test(u.hostname))return;
    return u.href;
  }catch{return;}
}
export function sensitiveURL(value:string):boolean {
  try {const u=new URL(value);const keys=[...u.searchParams.keys()];
    return keys.some(k=>/(?:token|signature|credential|authorization|password|secret|^sig$|^key$|api.?key|^policy$|^expires?$|^x-amz-|^x-goog-|key-pair-id|^jwt$|^auth$|^hdnea$|^hdnts$)/i.test(k))||
      /(?:^|[?&#])(?:access_token|token|sig|key)=/i.test(u.hash)||/\/(?:token|signature|auth)\/[^/]+/i.test(u.pathname);
  }catch{return false;}
}
/** Network verification is deliberately narrower than link discovery. No new host permissions. */
export function fetchableResource(value:string):boolean {
  const s=resourceURL(value);if(!s)return false;const u=new URL(s);
  return u.protocol==='https:'&&!u.port&&['pbs.twimg.com','video.twimg.com','abs.twimg.com'].includes(u.hostname);
}
export function mediaFormat(url:string,mime=''):string {
  const type=mime.split(';')[0].trim().toLowerCase();
  if(/(?:vnd\.apple\.mpegurl|x-mpegurl)/.test(type))return 'hls';
  if(type==='application/dash+xml')return 'dash';
  if(type==='application/ttml+xml')return 'ttml';
  if(type==='text/vtt')return 'vtt';
  if(/subrip/.test(type))return 'srt';
  if(type==='video/mp2t')return 'ts';
  if(/vmap|vast/.test(type))return 'vmap';
  const m:Record<string,string>={'video/mp4':'mp4','video/x-m4v':'m4v','video/quicktime':'mov','video/webm':'webm','video/ogg':'ogv','audio/mp4':'m4a','audio/mpeg':'mp3','image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/avif':'avif'};
  if(m[type])return m[type];
  try {const u=new URL(url),ext=u.pathname.match(/\.([a-z0-9]+)(?::(?:small|large|orig|thumb|medium|\d+x\d+))?$/i)?.[1]?.toLowerCase();
    const fmt=u.hostname==='pbs.twimg.com'?u.searchParams.get('format'):undefined;
    return (fmt||ext||'').replace(/^m3u8$/,'hls').replace(/^mpd$/,'dash').replace(/^jpeg$/,'jpg');
  }catch{return '';}
}
export function classifyResource(url:string,mime='',hint?:ResourceKind):ResourceKind {
  if(hint==='segment'||hint==='poster'||hint==='page')return hint;
  const f=mediaFormat(url,mime),type=mime.toLowerCase();
  // Provenance beats extension: an MP4 may be an initialization or media segment.
  if(['ts','m4s','cmfv','cmfa'].includes(f)||(/\/(?:segments?|chunks?|seg)\/|\/(?:init|initialization|segment[-_]\d+)(?:\.|\/)/i.test(new URL(url).pathname)&&['mp4','m4v'].includes(f)))return 'segment';
  if(f==='hls')return 'hls';if(f==='dash')return 'dash';if(f==='vmap')return 'vmap';
  if(['vtt','srt','ttml','dfxp'].includes(f))return 'subtitle';
  if(['jpg','png','gif','webp','avif'].includes(f)||type.startsWith('image/'))return 'image';
  if(type.startsWith('audio/')||['aac','m4a','mp3','opus'].includes(f))return 'audio';
  if(['mp4','m4v','mov','webm','ogv','ogg'].includes(f)||type.startsWith('video/'))return 'file';
  return hint||'unknown';
}
const positive=(v:unknown):number|undefined=>typeof v==='number'&&Number.isFinite(v)&&v>0?v:undefined;
const word=(s:unknown,max=180):string|undefined=>typeof s==='string'?s.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,max):undefined;
/** Whitelist fields from a page or manifest. Never copy arbitrary objects into exportable data. */
export function variant(value:unknown,source:ResourceSource='dom',hint?:ResourceKind,base?:string):ResourceVariant|undefined {
  const v=typeof value==='string'?{url:value}:value as any;if(!v||typeof v!=='object')return;
  const url=resourceURL(v.url,base);if(!url)return;
  const mime=word(v.mime||v.content_type,100),kind=classifyResource(url,mime,hint||v.kind);
  if(!['image','file','hls','dash','audio','subtitle','poster','segment','vmap','page','unknown'].includes(kind))return;
  const out:ResourceVariant={url,kind,format:mediaFormat(url,mime)||word(v.format,32),source,mime,state:'observed',sensitive:sensitiveURL(url)||v.sensitive===true};
  for(const k of ['width','height','bitrate','averageBitrate','frameRate','descriptorWidth','descriptorDensity'] as const){const n=positive(v[k]??(k==='bitrate'?v.bit_rate:undefined));if(n!==undefined&&n<1e12)out[k]=n;}
  for(const k of ['codecs','language','name','parentUrl','audioGroup','subtitleGroup','captionGroup','periodId','adaptationId','representationId','discoveredAt','checkedAt'] as const){const t=word(v[k],k==='parentUrl'?12000:180);if(t)out[k]=t;}
  if(['observed','candidate','verified','unverified','unavailable','blocked'].includes(v.state))out.state=v.state;
  if(['video','audio','subtitle','iframe'].includes(v.role))out.role=v.role;
  if(['master','media'].includes(v.playlist))out.playlist=v.playlist;
  if(v.segmented!==undefined)out.segmented=!!v.segmented;
  for(const k of ['encrypted','drm','live'] as const)if(typeof v[k]==='boolean')out[k]=v[k];
  if(v.verifiedBy&&['image-decode','manifest-parse','headers'].includes(v.verifiedBy))out.verifiedBy=v.verifiedBy;
  if(typeof v.httpStatus==='number')out.httpStatus=v.httpStatus;
  if(typeof v.problem==='string')out.problem=v.problem;
  return out;
}
export function variantKey(v:ResourceVariant):string {return [v.kind,v.url,v.role||'',v.periodId||'',v.representationId||'',v.audioGroup||'',v.subtitleGroup||''].join('\u001f');}
export function mergeVariants(...arrays:(ResourceVariant[]|undefined)[]):ResourceVariant[] {
  const map=new Map<string,ResourceVariant>();
  for(const arr of arrays)for(const raw of (arr||[]).slice(0,512)){
    const v=variant(raw,raw.source,raw.kind);if(!v)continue;const key=variantKey(v),a=map.get(key);
    if(!a){if(map.size<512)map.set(key,v);continue;}
    const out={...a};for(const [k,val] of Object.entries(v))if(val!==undefined)(out as any)[k]=val;
    // A fresh scan cannot erase a network check. A later explicit check CAN supersede it.
    if(!v.checkedAt&&a.checkedAt){out.state=a.state;out.checkedAt=a.checkedAt;out.problem=a.problem;out.verifiedBy=a.verifiedBy;out.width=a.width||v.width;out.height=a.height||v.height;}
    else if(a.state==='observed'&&v.state==='candidate')out.state='observed';
    if(a.sensitive||v.sensitive)out.sensitive=true;
    map.set(key,out);
  }return [...map.values()];
}
export function mergeTracks(...arrays:(MediaTrack[]|undefined)[]):MediaTrack[] {
  const map=new Map<string,MediaTrack>();
  for(const arr of arrays)for(const t of (arr||[]).slice(0,128)){
    if(!t||!['audio','subtitles','captions','descriptions'].includes(t.kind))continue;
    const url=resourceURL(t.url),manifestUrl=resourceURL(t.manifestUrl);
    const key=[t.kind,url||'',t.language||'',t.groupId||'',t.periodId||'',t.representationId||'',t.inBand?'in-band':'',!url?t.id:''].join('|');
    const clean:MediaTrack={id:word(t.id,256)||key,kind:t.kind,url,manifestUrl,state:t.state||'observed',source:t.source||'track'};
    for(const k of ['language','label','format','mime','codecs','groupId','periodId','adaptationId','representationId'] as const)clean[k]=word(t[k]);
    for(const k of ['inBand','default','forced','autoSelect','encrypted','segmented'] as const)if(typeof t[k]==='boolean')clean[k]=t[k];
    clean.sensitive=t.sensitive||!!url&&sensitiveURL(url)||!!manifestUrl&&sensitiveURL(manifestUrl);
    if(map.size<128||map.has(key))map.set(key,{...map.get(key),...clean});
  }return [...map.values()];
}
export function sameMediaKey(m:Partial<Media>):string|undefined {
  if(m.mediaId)return 'id:'+m.mediaId;
  const u=resourceURL(m.posterUrl)||resourceURL(m.src);if(!u)return;
  const a=new URL(u);
  // Only documented X image renditions share identity across format/size requests.
  if(a.hostname==='pbs.twimg.com'&&/^\/media\/[A-Za-z0-9_-]+/.test(a.pathname))return a.hostname+a.pathname.replace(/:(?:thumb|small|medium|large|orig|\d+x\d+)$/i,'').replace(/\.(?:jpe?g|png|webp|gif)$/i,'');
  return u;
}
export function existingVariants(m:Media):ResourceVariant[] {
  const a:ResourceVariant[]=[];
  for(const url of m.kind==='image'?[m.src,m.sourceUrl]:[m.sourceUrl,m.href]){
    const v=variant(url,'legacy',m.kind==='image'?'image':undefined);if(v&&((m.kind==='image'&&v.kind==='image')||(m.kind!=='image'&&['file','hls','dash','vmap','audio'].includes(v.kind))))a.push(v);
  }
  return mergeVariants(a,m.variants);
}
export function mergeMediaResources(target:Media,incoming:Partial<Media>):void {
  if(target.ownerId&&incoming.ownerId&&target.ownerId!==incoming.ownerId)return;
  if(target.mediaId&&incoming.mediaId&&target.mediaId!==incoming.mediaId)return;
  const a=existingVariants(target),b=existingVariants({...target,variants:[],sourceUrl:undefined,...incoming} as Media);
  target.variants=mergeVariants(a,b);target.tracks=mergeTracks(target.tracks,incoming.tracks);
  target.mediaId=target.mediaId||incoming.mediaId;target.ownerId=target.ownerId||incoming.ownerId;
  const info=new Map((target.manifests||[]).map(x=>[x.url,x]));for(const m of incoming.manifests||[])info.set(m.url,m);target.manifests=[...info.values()].slice(0,64);
  target.resourceNotes=[...new Set([...(target.resourceNotes||[]),...(incoming.resourceNotes||[])])].slice(0,40);
  if(!target.selectedImageUrl&&incoming.selectedImageUrl)target.selectedImageUrl=incoming.selectedImageUrl;
}
/** Candidate rank is a request strategy, never an assertion about existing originals. */
export function imageCandidates(m:Media):ResourceVariant[] {
  const observed=existingVariants(m).filter(v=>v.kind==='image').sort((a,b)=>Number(b.source==='page-data')-Number(a.source==='page-data'));
  const generated:ResourceVariant[]=[];
  for(const v of observed){
    const u=new URL(v.url);if(u.hostname!=='pbs.twimg.com'||sensitiveURL(v.url)||u.port)continue;
    const match=u.pathname.match(/^\/media\/([A-Za-z0-9_-]+)(?:\.(jpe?g|png|webp|gif))?(?::(?:thumb|small|medium|large|orig|\d+x\d+))?$/i);if(!match)continue;
    const fmt=(u.searchParams.get('format')||match[2]||'').toLowerCase();if(!['jpg','jpeg','png','webp','gif'].includes(fmt))continue;
    for(const size of fmt==='webp'?['4096x4096','large','medium']:['orig','4096x4096','large','medium']){
      const c=new URL(v.url);c.protocol='https:';c.pathname='/media/'+match[1];c.searchParams.set('format',fmt==='jpeg'?'jpg':fmt);c.searchParams.set('name',size);c.hash='';
      const x=variant(c.href,'image-rule','image')!;x.state='candidate';x.name=size;generated.push(x);
    }
  }
  const merged=mergeVariants(generated,observed);
  const rank=(v:ResourceVariant)=>{const name=new URL(v.url).searchParams.get('name')||v.name;return name==='orig'?1e9:name==='4096x4096'?4096:name==='large'?2048:name==='medium'?1200:(v.width||v.descriptorWidth||(v.descriptorDensity||0)*1000);};
  return merged.sort((a,b)=>rank(b)-rank(a)).slice(0,24);
}
export function preferredImage(m:Media):ResourceVariant|undefined {
  const variants=existingVariants(m).filter(v=>v.kind==='image');
  const selected=variants.find(v=>v.url===m.selectedImageUrl&&!['unavailable','blocked'].includes(v.state)&&(v.source!=='image-rule'||v.state==='verified'));if(selected)return selected;
  const known=variants.filter(v=>v.state==='verified'&&v.verifiedBy==='image-decode');
  if(known.length)return known.sort((a,b)=>(b.width||0)*(b.height||0)-(a.width||0)*(a.height||0))[0];
  // Do not discard an observed URL solely because the checking environment has CORS/network limits.
  const ok=variants.filter(v=>v.source!=='image-rule'&&v.state!=='candidate'&&v.state!=='unavailable');
  return ok.sort((a,b)=>(b.width||b.descriptorWidth||0)-(a.width||a.descriptorWidth||0)||((b.descriptorDensity||0)-(a.descriptorDensity||0))||Number(b.source==='page-data')-Number(a.source==='page-data'))[0]||variants.find(v=>v.source!=='image-rule');
}
export function recommendedVariants(m:Media,all=false):ResourceVariant[] {
  const a=existingVariants(m).filter(v=>!['candidate','unavailable'].includes(v.state)&&['file','hls','dash','audio','vmap'].includes(v.kind)&&v.role!=='iframe'&&v.role!=='subtitle'&&v.role!=='audio');
  if(all)return a;
  const out:ResourceVariant[]=[];
  for(const kind of ['file','hls','dash','vmap'] as const){
    const group=a.filter(v=>v.kind===kind);
    group.sort((a,b)=>Number(b.playlist==='master'||(!b.parentUrl&&!b.representationId))-Number(a.playlist==='master'||(!a.parentUrl&&!a.representationId))||
      ((b.width||0)*(b.height||0)-(a.width||0)*(a.height||0))||((a.codecs||'')===(b.codecs||'')?(b.bitrate||0)-(a.bitrate||0):0));
    if(group[0])out.push(group[0]);
  }return out;
}
export function visitMedia(capture:Capture,selected:Set<string>,fn:(media:Media,post:Post)=>void,quotes=true):void {
  const seen=new Set<Post>();let budget=2000;
  const visit=(p:Post,depth:number)=>{if(depth>8||seen.has(p)||budget--<=0)return;seen.add(p);let i=0;
    for(const b of p.blocks){if(b.kind==='media'){b.media.ownerId=p.id;b.media.scopeId=`${p.id}:${b.media.mediaRole||'body'}:${sameMediaKey(b.media)||i}`;fn(b.media,p);i++;}else if(b.kind==='embed'&&quotes)visit(b.post,depth+1);}
    if(p.linkCard?.media){const m=p.linkCard.media;m.ownerId=p.id;m.scopeId=`${p.id}:card:${sameMediaKey(m)||'visible'}`;fn(m,p);}
    if(p.quote&&quotes)visit(p.quote,depth+1);
  };
  for(const p of capture.posts)if(selected.has(p.id))visit(p,0);
}
