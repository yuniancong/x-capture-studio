export function sourceURL(value:string,base='https://x.com/'):string|undefined{
  try{const u=new URL(value,base);if(!['https:','http:'].includes(u.protocol))return;
    if(!/^(?:www\.|mobile\.)?(?:x\.com|twitter\.com)$/.test(u.hostname))return;
    const m=u.pathname.match(/^\/(?:([\w]+)\/status\/(\d+)|i\/article\/(\d+)|i\/web\/status\/(\d+))(?=\/|$)/);
    if(!m)return;return `https://x.com${m[3]?'/i/article/'+m[3]:m[4]?'/i/web/status/'+m[4]:'/'+m[1]+'/status/'+m[2]}`;
  }catch{return;}
}
export function postID(url:string){return url.match(/\/(?:status|article)\/(\d+)/)?.[1];}
export function safeLink(value:string,base='https://x.com/'):string|undefined{
  try{const u=new URL(value,base);return ['https:','http:'].includes(u.protocol)?u.href:undefined;}catch{return;}
}
export function allowedAsset(url:string):boolean{
  try{const u=new URL(url);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&(/^([a-z\d-]+\.)*twimg\.com$/.test(u.hostname)||u.href==='https://raw.githubusercontent.com/notofonts/noto-cjk/Sans2.004/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf');}catch{return false;}
}
export function plainText(p:{blocks:any[]}):string{return p.blocks.map(b=>b.kind==='text'?b.runs.map((r:any)=>r.text).join(''):b.kind==='media'?`[${b.media.kind}: ${b.media.alt||'媒体'}]`:b.kind==='embed'?`[嵌入帖子]\n${plainText(b.post)}`:'').join('\n');}

/** Copy the selected contextual record without pretending hidden fields were captured. */
export function contextText(p:any,identity=true,sources=true,depth=0):string{
  if(depth>5)return '[更深层引用未展开]';
  const out=[identity?`${p.author.name} @${p.author.handle}`:'匿名用户'];
  if(p.title)out.push(p.title);if(p.published||p.displayTime)out.push(p.published||p.displayTime);
  out.push(plainText(p));
  if(p.quote)out.push('引用帖子：\n'+contextText(p.quote,identity,sources,depth+1));
  if(p.poll)out.push('投票：\n'+p.poll.options.map((v:any)=>v.text+(v.percent===undefined?'':` ${v.percent}%`)).join('\n')+'\n'+(p.poll.summary||''));
  if(p.note)out.push('读者补充背景：'+p.note);
  if(p.linkCard)out.push('链接卡片：'+p.linkCard.title+(sources?'\n'+p.linkCard.url:''));
  if(sources)out.push('来源：'+p.url);return out.filter(Boolean).join('\n');
}
