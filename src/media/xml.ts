/** Small non-executing XML reader for MPD/VMAP. Never resolves entities, DTD, XLink,
 * XInclude or external resources. Bounded and independent of browser DOMParser. */
export interface XMLNode { name:string; local:string; attrs:Record<string,string>; children:XMLNode[]; text:string; }
function decode(s:string):string {
  if(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-f]+;)/i.test(s))throw new Error('Unsupported XML entity');
  return s.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,v:string)=>{
    if(v[0]==='#'){const n=v[1].toLowerCase()==='x'?parseInt(v.slice(2),16):Number(v.slice(1));if(n<=0||n>0x10ffff||n>=0xd800&&n<=0xdfff)throw new Error('Invalid XML scalar');return String.fromCodePoint(n);}
    return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"} as Record<string,string>)[v];
  });
}
export function parseXML(s:string):XMLNode {
  if(s.length>524288||/<!DOCTYPE|<!ENTITY|<!\[CDATA\[.*<!ENTITY/is.test(s)||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s))throw new Error('Unsafe or oversized XML');
  const stack:XMLNode[]=[],roots:XMLNode[]=[];let i=0,count=0;
  while(i<s.length){
    if(s.startsWith('<!--',i)){const e=s.indexOf('-->',i+4);if(e<0)throw new Error('XML comment');i=e+3;continue;}
    if(s.startsWith('<?',i)){const e=s.indexOf('?>',i+2);if(e<0)throw new Error('XML instruction');i=e+2;continue;}
    if(s.startsWith('<![CDATA[',i)){const e=s.indexOf(']]>',i+9);if(e<0||!stack.length)throw new Error('XML CDATA');stack[stack.length-1].text+=s.slice(i+9,e);i=e+3;continue;}
    if(s[i]!=='<'){const e=s.indexOf('<',i),end=e<0?s.length:e;const text=decode(s.slice(i,end));if(stack.length)stack[stack.length-1].text+=text;else if(text.trim())throw new Error('XML outside root');i=end;continue;}
    let end=i+1,quote='';for(;end<s.length;end++){const c=s[end];if(quote){if(c===quote)quote='';}else if(c==='"'||c==="'")quote=c;else if(c==='>')break;}
    if(end>=s.length)throw new Error('Unclosed XML tag');let raw=s.slice(i+1,end).trim();i=end+1;
    if(raw.startsWith('/')){const name=raw.slice(1).trim();if(!stack.length||stack.pop()!.name!==name)throw new Error('Mismatched XML tag');continue;}
    const self=raw.endsWith('/');if(self)raw=raw.slice(0,-1).trim();const m=/^([A-Za-z_][\w:.-]*)/.exec(raw);if(!m)throw new Error('Invalid XML tag');
    const name=m[1],attrs:Record<string,string>=Object.create(null);let pos=m[0].length,attrCount=0;
    while(pos<raw.length){const a=/^\s+([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(raw.slice(pos));if(!a)throw new Error('Invalid XML attribute');if(a[1] in attrs||++attrCount>80)throw new Error('XML attributes budget');attrs[a[1]]=decode(a[2]??a[3]);pos+=a[0].length;}
    const node:XMLNode={name,local:name.split(':').pop()!,attrs,children:[],text:''};if(++count>8000||stack.length>=32)throw new Error('XML complexity budget');
    if(stack.length)stack[stack.length-1].children.push(node);else roots.push(node);
    if(!self)stack.push(node);
  }
  if(stack.length||roots.length!==1)throw new Error('Incomplete XML document');return roots[0];
}
export const children=(n:XMLNode,name:string)=>n.children.filter(c=>c.local===name);
export function descendants(n:XMLNode,name:string):XMLNode[]{const a:XMLNode[]=[];const visit=(x:XMLNode)=>{if(x.local===name)a.push(x);x.children.forEach(visit);};visit(n);return a;}
