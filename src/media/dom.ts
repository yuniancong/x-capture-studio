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
export function videoDOMResources(video:HTMLVideoElement):Partial<Media> {
  const vs:ResourceVariant[]=[],tracks:MediaTrack[]=[];
  const add=(raw:string,mime='')=>{const url=resourceURL(raw,video.baseURI);if(!url)return;const v=variant({url,mime},'dom');if(v&&['file','hls','dash','vmap','audio','segment'].includes(v.kind)){if(raw===video.currentSrc&&video.videoWidth>0){v.width=video.videoWidth;v.height=video.videoHeight;}vs.push(v);}};
  add(video.currentSrc);add(video.getAttribute('src')||'');for(const s of video.querySelectorAll('source'))add(s.getAttribute('src')||'',s.type);
  for(const [i,t] of [...video.querySelectorAll('track')].entries()){
    if(!['subtitles','captions','descriptions'].includes(t.kind))continue;
    const url=resourceURL(t.getAttribute('src'),video.baseURI);
    tracks.push({id:'dom-track-'+i,kind:t.kind as MediaTrack['kind'],language:t.srclang||undefined,label:t.label||undefined,url,format:url?mediaFormat(url)||'未知字幕格式':undefined,default:t.default,inBand:!url,source:'track',state:'observed'});
  }
  try{for(let i=0;i<video.textTracks.length&&i<64;i++){
    const t=video.textTracks[i];if(!['subtitles','captions','descriptions'].includes(t.kind))continue;
    if(tracks.some(k=>k.kind===t.kind&&(k.language||'')===t.language&&(k.label||'')===t.label))continue;
    tracks.push({id:t.id||'inband-'+i,kind:t.kind as MediaTrack['kind'],language:t.language||undefined,label:t.label||undefined,default:t.mode==='showing',inBand:true,format:'内嵌/无独立 URL',source:'track',state:'observed'});
  }}catch{/* Some browsers restrict TextTrack access; no invented URL or transcript. */}
  return {mediaId:identifier(video),variants:mergeVariants(vs),tracks:mergeTracks(tracks)};
}
export function iframeMedia(frame:HTMLIFrameElement):Media|undefined {
  const url=resourceURL(frame.getAttribute('src'),frame.baseURI);if(!url)return;
  return {kind:'video',src:'',alt:frame.title||'外部嵌入播放器',href:url,playbackUrl:url,mediaRole:'embed',variants:[variant(url,'dom','page')!],resourceNotes:['外部播放器，仅保留实际嵌入入口；不跨域读取其私有状态。']};
}
