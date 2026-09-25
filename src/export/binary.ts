export const utf8=(value:string)=>new TextEncoder().encode(value);
export function concat(parts:Uint8Array[]):Uint8Array{const out=new Uint8Array(parts.reduce((n,p)=>n+p.byteLength,0));let o=0;for(const p of parts){out.set(p,o);o+=p.byteLength;}return out;}
export function base64(bytes:Uint8Array):string{let value='';for(let i=0;i<bytes.length;i+=24576)value+=String.fromCharCode(...bytes.subarray(i,i+24576));return btoa(value);}
export function unbase64(value:string):Uint8Array{const str=atob(value),out=new Uint8Array(str.length);for(let i=0;i<str.length;i++)out[i]=str.charCodeAt(i);return out;}
export async function compress(bytes:Uint8Array):Promise<{data:Uint8Array;filter:string}>{
  if(typeof CompressionStream==='undefined')return{data:bytes,filter:''};
  try{const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));return {data:new Uint8Array(await new Response(stream).arrayBuffer()),filter:'/Filter /FlateDecode'};}catch{return {data:bytes,filter:''};}
}
export function xml(value:string){return value.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]!));}
export function utf16Hex(value:string,bom=true):string{let out=bom?'FEFF':'';for(let i=0;i<value.length;i++)out+=value.charCodeAt(i).toString(16).padStart(4,'0');return out;}
