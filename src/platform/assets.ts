import {Asset,AssetMap,Capture,FONT_CACHE_KEY,FONT_URL,Host,Post} from '../core/model';
import {base64} from '../export/binary';
import {allowedAsset} from '../core/urls';
const DB='xc-public-font-cache-v1';
async function fontDB():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('font');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('字体缓存不可用。'));});}
export async function cachedFont():Promise<Uint8Array|undefined>{try{const db=await fontDB();return await new Promise((res,rej)=>{const tx=db.transaction('font','readonly'),r=tx.objectStore('font').get(FONT_CACHE_KEY);r.onsuccess=()=>{db.close();res(r.result?new Uint8Array(r.result):undefined);};r.onerror=()=>{db.close();rej(r.error);};});}catch{return;}}
export async function cacheFont(bytes:Uint8Array){try{const db=await fontDB();await new Promise<void>((res,rej)=>{const tx=db.transaction('font','readwrite');tx.objectStore('font').put(bytes,FONT_CACHE_KEY);tx.oncomplete=()=>{db.close();res();};tx.onerror=()=>{db.close();rej(tx.error);};});}catch{/* PDF can use the in-memory font if cache is unavailable. */}}
export async function clearFont(){try{const db=await fontDB();const tx=db.transaction('font','readwrite');tx.objectStore('font').clear();tx.oncomplete=()=>db.close();}catch{}}
let memoryFont:Uint8Array|undefined;
export function useMemoryFont(bytes:Uint8Array){memoryFont=bytes.length?bytes:undefined;}
export async function loadPdfFont(host:Host,onStatus:(s:string)=>void):Promise<Uint8Array>{
  if(memoryFont)return memoryFont;
  const cached=await cachedFont();if(cached){memoryFont=cached;return cached;}
  onStatus('首次准备 PDF 字体：从 Noto 官方仓库下载并本地缓存，不上传贴文…');
  try{const b=await host.readBytes(FONT_URL);if(b.length<10000)throw new Error('字体文件不完整。');memoryFont=b;await cacheFont(b);return b;}
  catch{throw new Error('无法下载 PDF 字体。请检查 GitHub 网络访问，或在「高级 → PDF 字体」导入本地可嵌入的 TTF/OTF 字体后重试。PNG 导出不受影响。');}
}
export function mediaSources(capture:Capture):string[]{const result=new Set<string>();const post=(p:Post)=>{if(p.author.avatar)result.add(p.author.avatar);for(const b of p.blocks){if(b.kind==='media'&&b.media.src)result.add(b.media.src);if(b.kind==='embed')post(b.post);}if(p.quote)post(p.quote);if(p.linkCard?.image)result.add(p.linkCard.image);};capture.posts.forEach(post);return [...result];}
function guessMime(bytes:Uint8Array){return bytes[0]===137?'image/png':bytes[0]===255?'image/jpeg':bytes[0]===71?'image/gif':bytes[0]===82?'image/webp':'application/octet-stream';}
export async function decodeData(dataUrl:string):Promise<Asset>{return new Promise((resolve,reject)=>{const img=new Image();const timer=setTimeout(()=>reject(new Error('图片解码超时')),20000);img.onload=()=>{clearTimeout(timer);resolve({image:img,dataUrl,width:img.naturalWidth,height:img.naturalHeight});};img.onerror=()=>{clearTimeout(timer);reject(new Error('图片格式不能解码'));};img.src=dataUrl;});}
/** Fetch + decode one image into the asset map, with the same source allowlist and pixel cap. */
export async function loadAsset(u:string,host:Host,map:AssetMap,signal?:AbortSignal):Promise<Asset>{
  const cached=map.get(u);if(cached)return cached;
  let dataUrl:string;
  if(/^data:image\/(?:png|jpeg|gif|webp);base64,/.test(u))dataUrl=u;
  else {if(!allowedAsset(u))throw new Error('不支持的图片来源');const b=await host.readBytes(u,signal);dataUrl=`data:${guessMime(b)};base64,${base64(b)}`;}
  const asset=await decodeData(dataUrl);if(asset.width*asset.height>50000000)throw new Error('图片像素超过安全上限');map.set(u,asset);return asset;
}
export async function loadAssets(capture:Capture,host:Host,map:AssetMap,onProgress?:(n:number,total:number)=>void,signal?:AbortSignal):Promise<string[]>{
  const urls=mediaSources(capture).filter(u=>!map.has(u));const failures:string[]=[];let cursor=0,done=0;
  async function worker(){while(cursor<urls.length){const u=urls[cursor++];if(signal?.aborted)return;try{await loadAsset(u,host,map,signal);}catch{failures.push(u);}onProgress?.(++done,urls.length);}}
  await Promise.all([worker(),worker(),worker()]);return failures;
}
