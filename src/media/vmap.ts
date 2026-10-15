import {ManifestResult,ResourceVariant} from './types';
import {parseXML,descendants} from './xml';
import {resourceURL,variant,mergeVariants,sensitiveURL} from './resources';
/** Extract only declared media. Ad impressions/tracking and VAST wrappers are never followed. */
export function parseVMAP(text:string,address:string):ManifestResult {
  const base=resourceURL(address);if(!base)throw new Error('Invalid VMAP URL');const root=parseXML(text);
  if(!['VMAP','VAST'].includes(root.local))throw new Error('Not VMAP/VAST');const found:ResourceVariant[]=[],warnings:string[]=[];
  for(const name of ['videoVariant','MediaFile'])for(const n of descendants(root,name)){
    const url=resourceURL(n.attrs.url||n.text.trim(),base);if(!url)continue;
    const v=variant({url,mime:n.attrs.content_type||n.attrs.type,bitrate:n.attrs.bitrate?Number(n.attrs.bitrate)*(name==='MediaFile'?1000:1):undefined,width:Number(n.attrs.width)||undefined,height:Number(n.attrs.height)||undefined,codecs:n.attrs.codec,parentUrl:base,sensitive:sensitiveURL(base)},'vmap');
    if(v&&['file','hls','dash'].includes(v.kind))found.push(v);
  }
  if(descendants(root,'AdTagURI').length||descendants(root,'VASTAdTagURI').length)warnings.push('广告/第三方 VAST 包装地址未追踪；没有请求追踪器。');
  if(!found.length)warnings.push('VMAP 中未识别到直接声明的媒体资源。');
  const entry=variant({url:base,kind:'vmap',state:'verified',verifiedBy:'manifest-parse',checkedAt:new Date().toISOString()},'vmap','vmap')!;
  return {variants:mergeVariants([entry],found),tracks:[],info:{url:base,type:'vmap',encrypted:false,drm:false,segmentCount:0,initializationCount:0,warnings}};
}
