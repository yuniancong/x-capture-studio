import type {Media} from '../core/model';
import type {ResourceVariant,MediaTrack} from './types';
import {resourceURL,variant,mergeVariants,mergeTracks,mediaFormat} from './resources';
const identifier=(node:Element)=>{const own=node.closest('[data-media-id],[data-media-key]');const id=own?.getAttribute('data-media-id')||own?.getAttribute('data-media-key');return id&&/^[\w:-]{1,100}$/.test(id)?id:undefined;};
export function imageDOMResources(img:HTMLImageElement):Partial<Media> {
  const vs:ResourceVariant[]=[],base=img.baseURI;
  for(const raw of [img.currentSrc,img.src]){const url=resourceURL(raw,base);if(!url)continue;const v=variant(url,'dom','image');if(!v||v.kind!=='image')continue;
    if(url===(resourceURL(img.currentSrc,base)||resourceURL(img.src,base))&&img.naturalWidth>0&&img.naturalHeight>0){v.width=img.naturalWidth;v.height=img.naturalHeight;}
    vs.push(v);
  }
  const sets=[img.getAttribute('srcset')||''];
  // A picture source belongs to the same image, not to adjacent pictures.
  if(img.parentElement?.tagName==='PICTURE')for(const source of img.parentElement.querySelectorAll('source')){
    if(source.media&&typeof matchMedia==='function'&&!matchMedia(source.media).matches)continue;sets.push(source.srcset);
  }
  for(const set of sets)for(const part of set.split(',').slice(0,32)){
    const a=part.trim().match(/^(\S+)(?:\s+(\d+(?:\.\d+)?)(w|x))?$/);if(!a)continue;const url=resourceURL(a[1],base);if(!url)continue;
    const v=variant(url,'srcset','image');if(!v||v.kind!=='image')continue;
    if(a[2]&&Number(a[2])>0){if(a[3]==='w')v.descriptorWidth=Number(a[2]);else v.descriptorDensity=Number(a[2]);}vs.push(v);
  }
  return {mediaId:identifier(img),variants:mergeVariants(vs)};
}
/** Playback dimensions describe the active element, never a manifest's maximum quality. */
export function videoDOMResources(video:HTMLVideoElement):Partial<Media> {
  const vs:ResourceVariant[]=[],tracks:MediaTrack[]=[];
  const add=(raw:string,mime='')=>{
    if(!raw?.trim())return;
    const url=resourceURL(raw,video.baseURI);if(!url)return;
    const v=variant({url,mime},'dom');
    if(v&&['file','hls','dash','vmap','audio','segment'].includes(v.kind))vs.push(v);
  };
  add(video.currentSrc);add(video.getAttribute('src')||'');
  for(const s of video.querySelectorAll('source'))add(s.getAttribute('src')||'',s.type);
  const cues=(t:TextTrack|undefined):number|undefined=>{
    try {const count=t?.cues?.length;return typeof count==='number'&&count>0?Math.min(count,100000):undefined;}catch{return;}
  };
  const domTracks=new Set<TextTrack>();
  for(const [i,t] of [...video.querySelectorAll('track')].entries()){
    if(!['subtitles','captions','descriptions'].includes(t.kind))continue;
    const src=t.getAttribute('src')?.trim();const url=src?resourceURL(src,video.baseURI):undefined;
    if(t.track)domTracks.add(t.track);
    const count=cues(t.track);
    tracks.push({id:'dom-track-'+i,kind:t.kind as MediaTrack['kind'],language:t.srclang||undefined,
      label:t.label||undefined,url,format:url?mediaFormat(url)||'未知字幕格式':undefined,
      default:t.default,evidence:count?'cue-confirmed':url?'url-observed':'declared',cueCount:count,
      source:'track',state:'observed'});
  }
  try {for(let i=0;i<video.textTracks.length&&i<64;i++){
    const t=video.textTracks[i];if(domTracks.has(t)||!['subtitles','captions','descriptions'].includes(t.kind))continue;
    const count=cues(t);
    // A TextTrack alone does not identify where its cues came from (in-band, DOM, or script).
    tracks.push({id:t.id||'browser-track-'+i,kind:t.kind as MediaTrack['kind'],language:t.language||undefined,
      label:t.label||undefined,default:t.mode==='showing',evidence:count?'cue-confirmed':'hint',cueCount:count,
      source:'track',state:'observed'});
  }}catch{/* Access may be denied. Do not equate unreadable cues with no captions. */}
  const width=video.videoWidth,height=video.videoHeight;
  const playbackDimensions=video.readyState>=1&&width>0&&height>0?
    {width,height,source:'video-element' as const,observedAt:new Date().toISOString()}:undefined;
  return {mediaId:identifier(video),variants:mergeVariants(vs),tracks:mergeTracks(tracks),playbackDimensions,domSourceKind:vs.length?'remote':video.currentSrc?.startsWith('blob:')?'blob':'none'};
}
export function iframeMedia(frame:HTMLIFrameElement):Media|undefined {
  const url=resourceURL(frame.getAttribute('src'),frame.baseURI);if(!url)return;
  return {kind:'video',src:'',alt:frame.title||'外部嵌入播放器',href:url,playbackUrl:url,mediaRole:'embed',variants:[variant(url,'dom','page')!],resourceNotes:['外部播放器，仅保留实际嵌入入口；不跨域读取其私有状态。']};
}
