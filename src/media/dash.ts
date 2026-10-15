import type {ManifestResult,ResourceVariant,MediaTrack,ManifestInfo} from './types';
import {parseXML,children,XMLNode} from './xml';
import {resourceURL,variant,mediaFormat,sensitiveURL,mergeVariants,mergeTracks} from './resources';
const num=(s:string|undefined)=>{if(!s)return;const [a,b]=s.split('/').map(Number),v=b===undefined?a:a/b;return Number.isFinite(v)&&v>=0?v:undefined;};
export function parseDASH(text:string,address:string):ManifestResult {
  const base=resourceURL(address);if(!base)throw new Error('Invalid MPD URL');const root=parseXML(text);if(root.local!=='MPD')throw new Error('Not an MPD');
  const variants:ResourceVariant[]=[],tracks:MediaTrack[]=[],warnings:string[]=[],templates:NonNullable<ManifestInfo['templates']>=[];
  let encrypted=false,drm=false,segmentCount=0,initializationCount=0;
  const sensitive=sensitiveURL(base),live=root.attrs.type==='dynamic';
  type Context={bases:string[];attrs:Record<string,string>;template?:Record<string,string>;list?:XMLNode;segmentBase?:XMLNode;protected:boolean;roles:string[];explicit:boolean;};
  function extend(c:Context,n:XMLNode):Context {
    let bases=c.bases;const xmlbase=n.attrs['xml:base'];if(xmlbase)bases=bases.map(b=>resourceURL(xmlbase,b)).filter((b):b is string=>!!b);
    const links=children(n,'BaseURL');if(links.length)bases=bases.flatMap(b=>links.slice(0,8).map(l=>resourceURL(l.text.trim(),b))).filter((b):b is string=>!!b).slice(0,16);
    const t=children(n,'SegmentTemplate')[0],l=children(n,'SegmentList')[0],s=children(n,'SegmentBase')[0];
    const prot=c.protected||children(n,'ContentProtection').length>0;if(prot){encrypted=true;drm=true;}
    return {bases,attrs:{...c.attrs,...n.attrs},template:t?{...c.template,...t.attrs}:l||s?undefined:c.template,
      list:l||(t||s?undefined:c.list),segmentBase:s||(t||l?undefined:c.segmentBase),protected:prot,
      roles:[...c.roles,...children(n,'Role').map(r=>r.attrs.value)],explicit:c.explicit||links.length>0};
  }
  const initial:Context={bases:[base],attrs:{},protected:false,roles:[],explicit:false};const rc=extend(initial,root);
  const periods=children(root,'Period');if(!periods.length)throw new Error('MPD has no Period');
  let reps=0;
  for(const [pi,p] of periods.entries()){
    const pc=extend(rc,p),periodId=p.attrs.id??String(pi);
    for(const [ai,a] of children(p,'AdaptationSet').entries()){
      const ac=extend(pc,a),adaptationId=a.attrs.id??String(ai),representations=children(a,'Representation');
      for(const access of children(a,'Accessibility')){
        const scheme=access.attrs.schemeIdUri||'';if(/cea-608|cea-708/i.test(scheme)){
          const values=(access.attrs.value||'').split(';');for(const value of values){const [id,lang]=value.split('=');tracks.push({id:`${periodId}:${adaptationId}:cc:${id||'embedded'}`,kind:'captions',language:lang,label:id||'内嵌字幕',format:/708/.test(scheme)?'CEA-708':'CEA-608',inBand:true,source:'dash',state:'observed',manifestUrl:base,periodId,adaptationId,encrypted:ac.protected,sensitive});}
        }
      }
      for(const r of (representations.length?representations:[a])){
        if(++reps>512)throw new Error('MPD representation budget');
        const c=r===a?ac:extend(ac,r),attrs=c.attrs,id=r.attrs.id||`rep-${reps}`,mime=attrs.mimeType||'',codecs=attrs.codecs||'';
        const role=(attrs.contentType||mime.split('/')[0]).toLowerCase();
        const sub=role==='text'||/ttml|vtt|stpp|wvtt/.test(mime+' '+codecs)||c.roles.some(v=>/subtitle|caption/.test(v));const audio=role==='audio';
        const segmented=!!(c.template||c.list||c.segmentBase);let isDirect=false;
        const targets=c.explicit&&!segmented?c.bases.filter(u=>u!==base&&!new URL(u).pathname.endsWith('/')):[];
        if(targets.length)isDirect=true;
        const format=/stpp\.ttml\.im|imsc/.test(codecs+' '+(attrs.profiles||''))?'IMSC1':/ttml|stpp/.test(mime+' '+codecs)?'TTML':/vtt|wvtt/.test(mime+' '+codecs)?'WebVTT':undefined;
        if(sub||audio){for(const target of isDirect?targets:[undefined])tracks.push({id:`${periodId}:${adaptationId}:${id}:${target||''}`,kind:audio?'audio':c.roles.includes('caption')?'captions':'subtitles',language:attrs.lang,label:children(r,'Label')[0]?.text||children(a,'Label')[0]?.text||id,format:audio?mediaFormat(target||base,mime):format||'DASH 字幕',mime,codecs,
          url:target,manifestUrl:base,periodId,adaptationId,representationId:id,default:c.roles.includes('main'),forced:c.roles.some(v=>/forced-subtitle|forced_subtitle/.test(v)),segmented,evidence:'declared',source:'dash',state:'observed',encrypted:c.protected,sensitive:sensitive||!!target&&sensitiveURL(target)});
        }
        for(const target of isDirect?targets:[base]){
          const kind=sub?'subtitle':audio?'audio':isDirect?'file':'dash';
          const v=variant({url:target,kind,format:isDirect?undefined:'dash',mime:isDirect?mime:undefined,codecs,role:sub?'subtitle':audio?'audio':'video',dimensionSource:'manifest',width:num(attrs.width),height:num(attrs.height),bitrate:num(attrs.bandwidth),frameRate:num(attrs.frameRate),language:attrs.lang,
            periodId,adaptationId,representationId:id,parentUrl:base,segmented:!isDirect,encrypted:c.protected,drm:c.protected,sensitive},'dash',kind)!;
          // A representation pointing to a manifest remains a DASH representation, not a video file.
          v.kind=kind;v.format=isDirect?mediaFormat(target,mime):sub?format||'dash':'dash';variants.push(v);
        }
        if(c.template){templates.push({periodId,representationId:id,media:c.template.media,initialization:c.template.initialization});if(c.template.initialization)initializationCount++;}
        if(c.list){segmentCount+=children(c.list,'SegmentURL').length;initializationCount+=children(c.list,'Initialization').length;}
        if(c.segmentBase)initializationCount+=children(c.segmentBase,'Initialization').length;
        if(!isDirect&&!segmented)warnings.push('部分 Representation 未提供可独立确认的媒体文件，保留 MPD 入口。');
      }
    }
  }
  if(!reps)throw new Error('MPD has no representations');
  if(encrypted)warnings.push('检测到 ContentProtection；未读取密钥或解密。');
  const entry=variant({url:base,kind:'dash',state:'verified',verifiedBy:'manifest-parse',checkedAt:new Date().toISOString(),live,encrypted,drm,sensitive},'dash','dash')!;
  return {variants:mergeVariants([entry],variants),tracks:mergeTracks(tracks),info:{url:base,type:'dash',live,encrypted,drm,segmentCount,initializationCount,templates:templates.slice(0,512),warnings:[...new Set(warnings)]}};
}
