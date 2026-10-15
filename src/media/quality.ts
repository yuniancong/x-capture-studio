import type {Capture,Media} from '../core/model';
import type {ResourceVariant} from './types';
import {existingVariants,imageCandidates,visitMedia} from './resources';

/** User-chosen media quality. 'default' / 'best' keep the pre-existing behaviour exactly. */
export type ImageLevel='default'|'large'|'4096x4096'|'orig';
export type VideoLevel='best'|`p${number}`;
export interface MediaQuality {image:ImageLevel;video:VideoLevel;}
export const QUALITY_DEFAULTS:MediaQuality={image:'default',video:'best'};
export interface LevelOption {value:string;label:string;disabled?:boolean;}

const IMAGE_ORDER:Exclude<ImageLevel,'default'>[]=['orig','4096x4096','large'];
const IMAGE_NAMES:Record<string,string>={orig:'原图','4096x4096':'4096','large':'大图'};
export function normalizeQuality(raw:unknown):MediaQuality {
  const v=raw&&typeof raw==='object'?raw as any:{};
  const image=['default',...IMAGE_ORDER].includes(v.image)?v.image:'default';
  const video=v.video==='best'||/^p\d{2,4}$/.test(v.video)?v.video:'best';
  return {image,video};
}
const levelName=(v:ResourceVariant)=>{try{return new URL(v.url).searchParams.get('name')||v.name;}catch{return v.name;}};
const dims=(w?:number,h?:number)=>w&&h?`${w}×${h}`:'';
/** Short side in pixels, the common "720p" meaning for portrait and landscape alike. */
export const shortSide=(v:{width?:number;height?:number})=>v.width&&v.height?Math.min(v.width,v.height):0;

/** Real CDN rendition for one level. Only X image-server photos have levels; others return undefined. */
export function imageLevelVariant(m:Media,level:Exclude<ImageLevel,'default'>):ResourceVariant|undefined {
  if(m.kind!=='image')return;
  return [...existingVariants(m),...imageCandidates(m)].find(v=>v.kind==='image'&&levelName(v)===level);
}
/** Ordered fallbacks: the chosen level, then lower levels. Known-unavailable renditions are skipped. */
export function imageLevelChain(m:Media,level:ImageLevel):ResourceVariant[] {
  if(level==='default')return [];
  return IMAGE_ORDER.slice(IMAGE_ORDER.indexOf(level)).map(l=>imageLevelVariant(m,l)).filter((v):v is ResourceVariant=>!!v&&v.state!=='unavailable'&&v.state!=='blocked');
}
/** For text: only a rendition that actually decoded counts. */
export function verifiedImageForLevel(m:Media,level:ImageLevel):ResourceVariant|undefined {
  return imageLevelChain(m,level).find(v=>v.state==='verified'&&!!v.width&&!!v.height);
}
function selectedMedia(c:Capture,selected:Set<string>,quotes:boolean,kind:(m:Media)=>boolean):Media[] {
  const out:Media[]=[];visitMedia(c,selected,m=>{if(kind(m))out.push(m);},quotes);return out;
}
/** Options reflect what is known right now: decoded sizes when verified, otherwise "选择后载入". */
export function imageQualityOptions(c:Capture,selected:Set<string>,quotes=true):LevelOption[] {
  const images=selectedMedia(c,selected,quotes,m=>m.kind==='image');
  const out:LevelOption[]=[{value:'default',label:'默认（页面图）'}];
  for(const level of IMAGE_ORDER){
    const vs=images.map(m=>imageLevelVariant(m,level)).filter((v):v is ResourceVariant=>!!v);
    if(!vs.length){out.push({value:level,label:`${IMAGE_NAMES[level]} · 无可用`,disabled:true});continue;}
    const ok=vs.filter(v=>v.state==='verified'&&v.width&&v.height),bad=vs.filter(v=>v.state==='unavailable').length;
    const largest=ok.sort((a,b)=>b.width!*b.height!-a.width!*a.height!)[0];
    const detail=largest?(images.length>1?`${ok.length}/${images.length} 张 · 最大 ${dims(largest.width,largest.height)}`:dims(largest.width,largest.height)):bad===vs.length?'不可用':'选择后载入';
    out.push({value:level,label:`${IMAGE_NAMES[level]} · ${detail}`,disabled:bad===vs.length});
  }
  return images.length?out:[{value:'default',label:'无图片',disabled:true}];
}
const videoCandidates=(m:Media)=>existingVariants(m).filter(v=>(v.kind==='file'&&!v.segmented||v.kind==='hls'&&v.playlist!=='master'&&!!v.parentUrl)&&
  (!v.role||v.role==='video')&&!['candidate','unavailable'].includes(v.state)&&shortSide(v)>0);
/** Distinct real levels (short side) present among the selected videos' MP4 / HLS renditions. */
export function videoQualityOptions(c:Capture,selected:Set<string>,quotes=true):LevelOption[] {
  const videos=selectedMedia(c,selected,quotes,m=>m.kind!=='image');
  if(!videos.length)return [{value:'best',label:'无视频',disabled:true}];
  const levels=new Map<number,number>();
  for(const m of videos)for(const p of new Set(videoCandidates(m).map(shortSide)))levels.set(p,(levels.get(p)||0)+1);
  const out:LevelOption[]=[{value:'best',label:levels.size?'最高可用':'最高可用（尚未取得清晰度）'}];
  for(const [p,n] of [...levels].sort((a,b)=>b[0]-a[0]))out.push({value:'p'+p,label:`${p}p${videos.length>1?` · ${n}/${videos.length} 个视频`:''}`});
  return out;
}
/** Renditions for one level: the closest at-or-below (else the smallest above). HLS falls back to the master. */
export function videoVariantsForLevel(m:Media,level:VideoLevel):ResourceVariant[]|undefined {
  if(level==='best')return;
  const target=Number(level.slice(1));const all=videoCandidates(m);
  const pick=(kind:'file'|'hls')=>{const g=all.filter(v=>v.kind===kind);if(!g.length)return;
    const below=g.filter(v=>shortSide(v)<=target).sort((a,b)=>shortSide(b)-shortSide(a)||(b.bitrate||0)-(a.bitrate||0));
    return below[0]||g.sort((a,b)=>shortSide(a)-shortSide(b))[0];};
  const file=pick('file');let hls=pick('hls');
  if(!hls)hls=existingVariants(m).find(v=>v.kind==='hls'&&(v.playlist==='master'||!v.parentUrl)&&!['candidate','unavailable'].includes(v.state)&&(!v.role||v.role==='video'));
  return [file,hls].filter((v):v is ResourceVariant=>!!v);
}
