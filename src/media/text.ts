import type {Media,Post} from '../core/model';
import {sourceURL} from '../core/urls';
import {videoPageForMedia} from '../core/media-links';
import {preferredImage,recommendedVariants,existingVariants,sensitiveURL,resourceURL,mediaFormat} from './resources';
import type {ResourceVariant,MediaTrack} from './types';
export interface MediaTextOptions { all:boolean; images:boolean; subtitles:boolean; sensitive:boolean; markdown:boolean; links:boolean; sources:boolean; }
const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/([\\`*_[\]~|])/g,'\\$1');
const urlText=(s:string,md:boolean)=>md?'<'+s.replace(/[<>\s]/g,c=>encodeURIComponent(c))+'>':s;
function details(v:ResourceVariant,all:boolean):string {
  const parts:string[]=[];
  if(v.width&&v.height)parts.push(`${v.width}×${v.height}`);
  if(all&&v.bitrate)parts.push(`${Math.round(v.bitrate/1000)} kbps`);
  if(all&&v.codecs)parts.push(v.codecs);
  if(v.kind==='hls')parts.push(v.playlist==='master'?'主播放列表':v.playlist==='media'?'子播放列表':'播放列表');
  if(v.kind==='dash'&&v.representationId)parts.push(`Representation ${v.representationId}`);
  if(v.segmented)parts.push('分片式，使用清单');
  if(v.encrypted||v.drm)parts.push('受保护/加密');
  if(v.live!==undefined)parts.push(v.live?'直播/动态快照':'点播/已结束');
  if(all)parts.push(v.state==='verified'?(v.verifiedBy==='headers'?'仅响应头验证':v.verifiedBy==='image-decode'?'图片已解码':'清单已解析'):v.state==='unavailable'?'不可用':v.state==='candidate'?'候选未验证':'已发现，访问未确认');
  else if(v.state==='unverified'||v.state==='blocked')parts.push('访问未确认');
  return parts.length?' · '+parts.join(' · '):'';
}
/** Only this formatter changes multimedia text. All original paragraphs/roles remain owned by serializeText. */
export function mediaTextLines(m:Media,p:Post,o:MediaTextOptions):{text:string;warnings:string[]} {
  const label=m.kind==='image'?'图片':m.kind==='gif'?'GIF':'视频';const alt=m.alt?.trim();
  const raw=`[${label}${m.duration?' · '+m.duration:''}${alt&&!['帖子图片','视频封面','文章内视频','引用帖媒体'].includes(alt)?'：'+alt:''}]`;
  const text=(v:string)=>o.markdown?escape(v):v;const marker=text(raw);const warnings:string[]=[];
  if(!o.links)return {text:marker,warnings};
  const restricted=(url:string,flag?:boolean)=>!o.sensitive&&(flag||sensitiveURL(url));
  let hidden=false;const addr=(url:string,flag?:boolean)=>{if(restricted(url,flag)){hidden=true;return;}return urlText(url,o.markdown);};
  const lines:string[]=[];
  if(m.kind==='image'){
    const best=preferredImage(m);const address=best&&addr(best.url,best.sensitive);
    if(address&&!sourceURL(best!.url)){
      lines.push(o.markdown&&o.images?`![${escape(alt||'图片')}](<${best!.url.replace(/[<>\s]/g,c=>encodeURIComponent(c))}>)`:`${marker} ${address}`);
      if(o.all)for(const v of existingVariants(m).filter(v=>v.kind==='image'&&v.url!==best!.url)){
        const a=addr(v.url,v.sensitive);if(a)lines.push(text(`图片候选${details(v,true)}：`)+a);
      }
      if(best!.state!=='verified')warnings.push('图片使用页面已观察资源；最高可用画质尚未验证，可检查媒体资源后再次复制。');
    }else lines.push(marker+(hidden?'（含受限签名链接，默认不导出）':'（图片链接未获取）'));
  }else{
    const page=o.sources?videoPageForMedia(m,p):undefined;
    if(page)lines.push(`${marker} 视频播放页：${urlText(page,o.markdown)}`);
    else{
      const external=o.sources&&m.mediaRole==='embed'?resourceURL(m.playbackUrl):undefined;
      const a=external?addr(external):undefined;if(a)lines.push(`${marker} 外部播放器：${a}`);
    }
    for(const v of recommendedVariants(m,o.all)){
      const a=addr(v.url,v.sensitive);if(!a)continue;
      const format=(v.format||mediaFormat(v.url,v.mime)||'未知格式').toUpperCase();
      const title=v.kind==='file'?'视频文件直链':v.kind==='hls'?'HLS 视频播放流':v.kind==='dash'?'DASH 视频播放流':'VMAP 媒体描述';
      lines.push((lines.length?'':marker+' ')+text(`${title}${o.all||v.kind!=='file'?' · '+format:''}${details(v,o.all)}：`)+a);
    }
    if(!lines.length){const original=o.sources?sourceURL(m.href||'')||sourceURL(p.url):undefined;lines.push(`${marker}${original?' 原帖（视频专属地址未获取）：'+urlText(original,o.markdown):'（视频链接未获取）'}`);}
    const tracks=(m.tracks||[]).filter(t=>t.kind==='audio'?o.all:o.subtitles);
    for(const t of tracks){
      const format=t.format||(t.url?mediaFormat(t.url,t.mime):'')||'未确认格式';
      const name=[t.kind==='audio'?'音轨':'字幕',t.language,t.label,format,t.default?'默认':undefined,t.forced?'强制':undefined].filter(Boolean).join('｜');
      const u=t.url||t.manifestUrl;const a=u?addr(u,t.sensitive):undefined;
      if(t.inBand){lines.push(text(name+'：内嵌轨道，无独立文件 URL'));}
      else if(a){lines.push(text(name+(t.segmented||!t.url?'｜分片/清单':'')+'：')+a);}
      else lines.push(text(name+(u?'：受限链接未导出':'：已检测到，独立资源地址未获取')));
    }
    for(const info of m.manifests||[]){if(info.encrypted)warnings.push('检测到加密/受保护内容，仅记录流和轨道信息，未获取密钥或解密。');
      if(o.all&&(info.segmentCount||info.initializationCount||info.parts))lines.push(text(`清单结构：${info.segmentCount} 个媒体分片，${info.initializationCount} 个初始化片段${info.parts?'，低延迟片段 '+info.parts:''}（不输出为完整视频）`));
    }
  }
  if(hidden){warnings.push('检测到带签名/令牌或继承受限上下文的媒体地址；已从文本中隐藏。需要本人使用时可显式允许完整受限地址。');if(!lines.some(l=>l.includes('受限签名')))lines.push(text('部分媒体为受限签名链接，未包含在可分享文本中。'));}
  if(o.all&&m.resourceNotes?.length)lines.push(...m.resourceNotes.map(text));
  return {text:lines.join('\n'),warnings:[...new Set(warnings)]};
}
