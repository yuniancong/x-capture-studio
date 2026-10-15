import {ManifestResult,ResourceVariant,MediaTrack} from './types';
import {resourceURL,sensitiveURL,variant,mergeVariants,mergeTracks} from './resources';

/** Attribute lists are not CSV: commas inside CODECS/NAME quoted strings are data. */
export function hlsAttributes(s:string):Record<string,string> {
  if(s.length>32768)throw new Error('HLS attribute budget');const a:Record<string,string>=Object.create(null);let i=0;
  while(i<s.length){while(/[ ,\t]/.test(s[i]||'')&&i<s.length)i++;if(i>=s.length)break;
    const m=/^[A-Z0-9-]+/.exec(s.slice(i));if(!m)throw new Error('Invalid HLS attribute');const k=m[0];i+=k.length;
    if(s[i++]!=='=')throw new Error('Missing HLS equals');let v='';
    if(s[i]==='"'){i++;const end=s.indexOf('"',i);if(end<0)throw new Error('Unclosed HLS string');v=s.slice(i,end);i=end+1;}
    else{const end=s.indexOf(',',i);v=s.slice(i,end<0?s.length:end).trim();i=end<0?s.length:end;}
    if(k in a)throw new Error('Duplicate HLS attribute');a[k]=v;
    if(i<s.length&&s[i++]!==',')throw new Error('Invalid HLS separator');
  }return a;
}
const num=(s:string|undefined)=>{const n=Number(s);return s!==undefined&&Number.isFinite(n)&&n>=0?n:undefined;};
export function parseHLS(text:string,address:string,imports:Record<string,string>={},trackRole?:'audio'|'subtitle'):ManifestResult {
  const base=resourceURL(address);if(!base)throw new Error('Invalid manifest URL');
  if(text.length>524288)throw new Error('HLS size budget');
  const lines=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').split('\n').map(s=>s.trim());
  if(lines.length>16000||lines[0]!=='#EXTM3U')throw new Error('Not an HLS playlist');
  const rootSensitive=sensitiveURL(base),variables:Record<string,string>=Object.create(null),warnings:string[]=[];
  const variants:ResourceVariant[]=[],tracks:MediaTrack[]=[];
  let master=false,media=false,encrypted=false,drm=false,ended=false,segmentCount=0,initializationCount=0,parts=0,duration=0,pending:Record<string,string>|undefined;
  let playlistType:string|undefined,targetDuration:number|undefined,sequence:number|undefined,iframeOnly=false;
  const resolve=(s:string|undefined):string|undefined=>{if(!s)return;
    let value=s;for(let n=0;n<4&&/\{\$[\w-]+\}/.test(value);n++)value=value.replace(/\{\$([\w-]+)\}/g,(full,k)=>variables[k]??full);
    if(value.includes('{$')){warnings.push('HLS 变量无法完整解析，未编造资源地址。');return;}
    return resourceURL(value,base);
  };
  const add=(url:string|undefined,a:Record<string,string>={},role:ResourceVariant['role']='video',kind:ResourceVariant['kind']='hls')=>{
    if(!url)return;const size=a.RESOLUTION?.match(/^(\d+)x(\d+)$/i);
    const v=variant({url,kind,role,playlist:kind==='hls'?'media':undefined,parentUrl:base,bitrate:num(a.BANDWIDTH),averageBitrate:num(a['AVERAGE-BANDWIDTH']),
      dimensionSource:'manifest',width:size?num(size[1]):undefined,height:size?num(size[2]):undefined,codecs:a.CODECS,frameRate:num(a['FRAME-RATE']),audioGroup:a.AUDIO,subtitleGroup:a.SUBTITLES,captionGroup:a['CLOSED-CAPTIONS'],
      name:a.NAME,language:a.LANGUAGE,sensitive:rootSensitive},'hls',kind)!;
    if(variants.length<512)variants.push(v);else warnings.push('HLS 变体超过保留上限。');
  };
  for(let n=1;n<lines.length;n++){
    const line=lines[n];if(!line)continue;
    if(!line.startsWith('#')){
      if(pending){add(resolve(line),pending);pending=undefined;master=true;}
      else {media=true;segmentCount++;if(segmentCount<=8)add(resolve(line),{},trackRole||'video','segment');}
      continue;
    }
    const colon=line.indexOf(':'),tag=colon<0?line:line.slice(0,colon),raw=colon<0?'':line.slice(colon+1);
    if(tag==='#EXT-X-DEFINE'){
      const a=hlsAttributes(raw);if(a.NAME&&a.VALUE!==undefined&&Object.keys(variables).length<64)variables[a.NAME]=a.VALUE;
      else if(a.IMPORT&&Object.prototype.hasOwnProperty.call(imports,a.IMPORT))variables[a.IMPORT]=imports[a.IMPORT];
      else if(a.QUERYPARAM){const q=new URL(base).searchParams.get(a.QUERYPARAM);if(q!==null)variables[a.QUERYPARAM]=q;}
      continue;
    }
    if(tag==='#EXT-X-STREAM-INF'){if(pending)throw new Error('HLS stream missing URI');pending=hlsAttributes(raw);master=true;continue;}
    if(tag==='#EXT-X-I-FRAME-STREAM-INF'){const a=hlsAttributes(raw);master=true;add(resolve(a.URI),a,'iframe');continue;}
    if(tag==='#EXT-X-MEDIA'){
      const a=hlsAttributes(raw);master=true;const url=resolve(a.URI),type=a.TYPE;
      if(type==='VIDEO'){add(url,a,'video');continue;}
      if(!['AUDIO','SUBTITLES','CLOSED-CAPTIONS'].includes(type))continue;
      const cc=type==='CLOSED-CAPTIONS';const kind=type==='AUDIO'?'audio':cc?'captions':'subtitles';
      const ccValid=/^(?:CC[1-4]|SERVICE(?:[1-9]|[1-5][0-9]|6[0-3]))$/.test(a['INSTREAM-ID']||'');
      const format=cc?(ccValid?(a['INSTREAM-ID'].startsWith('SERVICE')?'CEA-708':'CEA-608'):'内嵌格式未确认'):'HLS';
      if(type==='SUBTITLES'&&!url)warnings.push('字幕组没有有效 URI，仅保留轨道声明。');
      tracks.push({id:[base,type,a['GROUP-ID'],a.NAME,a.LANGUAGE,a['INSTREAM-ID']].join('|'),kind,url,manifestUrl:base,
        language:a.LANGUAGE,label:a.NAME,groupId:a['GROUP-ID'],default:a.DEFAULT==='YES',forced:a.FORCED==='YES',autoSelect:a.AUTOSELECT==='YES',
        inBand:(cc||type==='AUDIO')&&!url,evidence:'declared',inBandEvidence:(cc||type==='AUDIO')&&!url?'manifest':undefined,format,source:'hls',state:'observed',segmented:!!url,sensitive:rootSensitive||!!url&&sensitiveURL(url)});
      if(url)add(url,a,type==='AUDIO'?'audio':'subtitle');continue;
    }
    if(tag==='#EXT-X-KEY'||tag==='#EXT-X-SESSION-KEY'){
      const a=hlsAttributes(raw);if(a.METHOD&&a.METHOD!=='NONE'){encrypted=true;drm=drm||a.KEYFORMAT!==undefined&&a.KEYFORMAT!=='identity'||a.METHOD.startsWith('SAMPLE');}
      // Key addresses intentionally not retained, exported, or requested.
      continue;
    }
    if(tag==='#EXT-X-MAP'){media=true;initializationCount++;if(initializationCount<=8)add(resolve(hlsAttributes(raw).URI),{},trackRole||'video','segment');continue;}
    if(tag==='#EXT-X-PART'){media=true;parts++;if(parts<=8)add(resolve(hlsAttributes(raw).URI),{},trackRole||'video','segment');continue;}
    if(tag==='#EXT-X-PRELOAD-HINT'){parts++;continue;} // No speculative fetching.
    if(tag==='#EXT-X-CONTENT-STEERING'){warnings.push('检测到内容引导，未追踪重定向服务。');continue;}
    if(tag==='#EXT-X-RENDITION-REPORT'){continue;} // Sibling live snapshots not needed for link export.
    if(tag==='#EXT-X-ENDLIST'){ended=true;media=true;}
    if(tag==='#EXT-X-PLAYLIST-TYPE'){playlistType=raw;media=true;}
    if(tag==='#EXT-X-TARGETDURATION'){targetDuration=num(raw);media=true;}
    if(tag==='#EXT-X-MEDIA-SEQUENCE'){sequence=num(raw);media=true;}
    if(tag==='#EXTINF'){duration+=num(raw.split(',')[0])||0;media=true;}
    if(tag==='#EXT-X-I-FRAMES-ONLY')iframeOnly=true;
  }
  if(pending)throw new Error('HLS stream missing URI');if(master&&media)throw new Error('Mixed HLS master and media tags');
  if(!master&&!media)throw new Error('Empty HLS playlist');
  const live=master?undefined:!ended;
  if(playlistType==='VOD'&&!ended)warnings.push('VOD 播放列表缺少 ENDLIST，终止状态未确认。');
  if(encrypted)warnings.push('检测到加密/受保护流；不读取密钥或绕过保护。');
  const root=variant({url:base,kind:'hls',playlist:master?'master':'media',role:iframeOnly?'iframe':trackRole||'video',state:'verified',verifiedBy:'manifest-parse',checkedAt:new Date().toISOString(),encrypted,drm,live,sensitive:rootSensitive},'hls','hls')!;
  for(const v of variants){v.encrypted=encrypted;v.drm=drm;}
  for(const t of tracks)t.encrypted=encrypted;
  return {variants:mergeVariants([root],variants),tracks:mergeTracks(tracks),variables,info:{url:base,type:master?'hls-master':'hls-media',live,encrypted,drm,segmentCount,initializationCount,parts,playlistType,duration:media?duration:undefined,targetDuration,sequence,warnings:[...new Set(warnings)]}};
}
