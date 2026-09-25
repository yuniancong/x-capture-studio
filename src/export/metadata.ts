import {Capture,Options,VERSION} from '../core/model';
import {sourceURL} from '../core/urls';
import {sourcesAllowed} from '../core/options';
import {concat,utf8,xml} from './binary';
export function provenance(c:Capture,selected:Set<string>,o:Options){
  const allow=o.sourceMetadata&&sourcesAllowed(o),posts=c.posts.filter(p=>selected.has(p.id));
  const sources=allow?posts.flatMap(p=>{const url=sourceURL(p.url);return url?[{url,id:p.id,published:p.published,parentId:p.parentId,relationEvidence:p.relationEvidence}]:[];}):[];
  const nested=new Set<string>();
  function collect(p:typeof posts[number],depth=0){if(depth>5)return;if(p.quote){const u=sourceURL(p.quote.url);if(u)nested.add(u);collect(p.quote,depth+1);}for(const b of p.blocks)if(b.kind==='embed'){const u=sourceURL(b.post.url);if(u)nested.add(u);collect(b.post,depth+1);}}
  if(allow)posts.forEach(p=>collect(p));
  // No homepage fallback; a source is a verified permalink, not the current timeline URL.
  const root=allow?(sources.find(p=>p.id===c.rootId)?.url||sources[0]?.url):undefined;
  return {version:VERSION,capturedAt:c.capturedAt,root,sources,embeddedSources:[...nested].filter(u=>!sources.some(s=>s.url===u)),
    selectedCount:posts.length,scope:'loaded-and-user-selected',anonymized:o.anonymize,layout:o.mode};
}
export function sourceList(data:ReturnType<typeof provenance>):string[]{return [...new Set([data.root,...data.sources.map(s=>s.url),...data.embeddedSources].filter((s):s is string=>!!s))];}
export function xmpMetadata(data:ReturnType<typeof provenance>):string{
  const links=sourceList(data);
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/"><dc:source><rdf:Seq>${links.map(url=>`<rdf:li>${xml(url)}</rdf:li>`).join('')}</rdf:Seq></dc:source><xmp:CreateDate>${xml(data.capturedAt)}</xmp:CreateDate></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
}
const CRC_TABLE=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export function crc32(b:Uint8Array):number{let crc=0xffffffff;for(const v of b)crc=CRC_TABLE[(crc^v)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function chunk(name:string,bytes:Uint8Array):Uint8Array{const type=utf8(name),out=new Uint8Array(bytes.length+12),view=new DataView(out.buffer);view.setUint32(0,bytes.length);out.set(type,4);out.set(bytes,8);view.setUint32(bytes.length+8,crc32(out.subarray(4,bytes.length+8)));return out;}
function itxt(name:string,text:string){return chunk('iTXt',concat([utf8(name),new Uint8Array([0,0,0,0,0]),utf8(text)]));}
/** Losslessly add standard PNG iTXt/XMP records; no pixels are re-encoded. */
export function addPngMetadata(png:Uint8Array,data:ReturnType<typeof provenance>,scale:number):Uint8Array{
  if(png.length<20||png[0]!==137||png[1]!==80)throw new Error('无效的 PNG 数据。');
  const parts:Uint8Array[]=[png.subarray(0,8)];let i=8,ended=false,inserted=false;
  const insert=()=>{
    if(inserted)return;inserted=true;
    const phys=new Uint8Array(9),v=new DataView(phys.buffer);v.setUint32(0,Math.round(96*scale/.0254));v.setUint32(4,Math.round(96*scale/.0254));phys[8]=1;parts.push(chunk('pHYs',phys));
    if(data.sources.length)parts.push(itxt('SourceURL',data.root||data.sources[0].url),itxt('Source',data.root||data.sources[0].url),itxt('Description','原帖：'+(data.root||data.sources[0].url)),itxt('Sources',sourceList(data).join('\n')),itxt('XML:com.adobe.xmp',xmpMetadata(data)));
    parts.push(itxt('XCapture',JSON.stringify(data)));
  };
  while(i+12<=png.length){const view=new DataView(png.buffer,png.byteOffset+i,4),len=view.getUint32(0),end=i+12+len;if(end>png.length)throw new Error('PNG 文件损坏。');const name=String.fromCharCode(...png.subarray(i+4,i+8));
    // pHYs must precede IDAT. Early iTXt also works with lazy metadata readers.
    if(name==='IDAT')insert();
    if(name==='IEND'){if(!inserted)throw new Error('PNG 缺少图像数据。');parts.push(png.subarray(i,end));ended=true;break;}
    if(name!=='pHYs')parts.push(png.subarray(i,end));i=end;
  }
  if(!ended)throw new Error('PNG 缺少结束块。');return concat(parts);
}
