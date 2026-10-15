import type {Block,Post,Run} from './model';
const WARNING='正文扩展未合并：媒体位置或文字锚点无法确认，请在原帖展开后重新读取。';
function compact(raw:string):{text:string;offsets:number[]} {
  let text='';const offsets:number[]=[];
  for(let i=0;i<raw.length;i++)if(!/\s/.test(raw[i])){text+=raw[i];offsets.push(i);}
  return {text,offsets};
}
function prefixRuns(runs:Run[],length:number):Run[] {
  const out:Run[]=[];let remaining=length;
  for(const r of runs){if(remaining<=0)break;const text=r.text.slice(0,remaining);if(text)out.push({...r,text});remaining-=r.text.length;}
  return out;
}
/** Only extend a uniquely anchored tail. Existing non-text nodes never leave their positions.
 * Missing interleaved anchors are a partial capture, NOT permission to invent media offsets. */
export function expandAnchoredText(p:Pick<Post,'blocks'|'warnings'|'textStructure'>,fullText:string):'expanded'|'uncertain'|'unchanged' {
  if(typeof fullText!=='string'||!fullText||fullText.length>400000)return 'unchanged';
  const texts=p.blocks.map((b,i)=>b.kind==='text'?{b,i,raw:b.runs.map(r=>r.text).join('')}:undefined).filter((x):x is NonNullable<typeof x>=>!!x);
  const visible=texts.map(t=>t.raw).join('');if(!texts.length||fullText.length<=visible.length)return 'unchanged';
  const fail=()=>{if(!p.warnings.includes(WARNING))p.warnings.push(WARNING);return 'uncertain' as const;};
  if(p.textStructure==='interleaved'&&p.blocks.slice(texts[texts.length-1].i+1).some(b=>b.kind!=='text'))return fail();
  const full=compact(fullText);let cursor=0,lastStart=0,lastPrefix='';
  for(let n=0;n<texts.length;n++){
    const t=texts[n],last=n===texts.length-1;
    if(!last&&/(?:…|\.{3})\s*$/.test(t.raw))return fail();
    const prefix=last?t.raw.replace(/(?:…+|\.{3})\s*$/,'').replace(/\s+$/,''):t.raw;
    const value=compact(prefix).text;if(!value)return fail();
    // Prefix equality (not search/indexOf) refuses to assign unseen interstitial text to either side of an image.
    if(!full.text.startsWith(value,cursor))return fail();
    if(last){lastStart=full.offsets[cursor];lastPrefix=prefix;}cursor+=value.length;
  }
  const last=texts[texts.length-1],replacement=fullText.slice(lastStart);
  const trimmedStart=lastPrefix.length-lastPrefix.trimStart().length;
  const known=lastPrefix.slice(trimmedStart);
  let runs:Run[];
  if(replacement.startsWith(known)&&trimmedStart===0){runs=prefixRuns(last.b.runs,lastPrefix.length);const extra=replacement.slice(known.length);if(extra)runs.push({text:extra});}
  else runs=[{text:replacement}];
  const blocks:Block[]=[...p.blocks];blocks[last.i]={...last.b,runs};p.blocks=blocks;
  p.warnings=p.warnings.filter(w=>w!==WARNING&&!w.includes('正文可能折叠'));
  return 'expanded';
}
