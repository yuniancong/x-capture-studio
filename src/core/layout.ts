import QRCode = require('qrcode-core');
import {AssetMap,Block,Capture,Command,Options,Post,Run,Scene,TextCommand} from './model';
import {postRole,ROLE_LABELS,rootPost} from './selection';
import {sourcesAllowed} from './options';
export const SYSTEM_FONT='-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans CJK SC", sans-serif';
const FALLBACK_BADGE='M12 1.6 L14.5 3 L17.4 2.7 L18.7 5.3 L21.3 6.6 L21 9.5 L22.4 12 L21 14.5 L21.3 17.4 L18.7 18.7 L17.4 21.3 L14.5 21 L12 22.4 L9.5 21 L6.6 21.3 L5.3 18.7 L2.7 17.4 L3 14.5 L1.6 12 L3 9.5 L2.7 6.6 L5.3 5.3 L6.6 2.7 L9.5 3 Z';
const MONO_FONT='ui-monospace, SFMono-Regular, Consolas, monospace';
const ICONS:Record<string,string>={
  replies:'M21 11 C21 5 17 3 12 3 C7 3 3 6 3 11 C3 14 4 16 6 17 L4 21 L10 19 C17 21 21 16 21 11 Z',
  reposts:'M3 8 L18 8 L14 4 M21 16 L6 16 L10 20 M3 8 L3 16 M21 16 L21 8',
  likes:'M12 21 L3 12 C-2 5 6 0 12 6 C18 0 26 5 21 12 L12 21 Z',
  views:'M4 20 L4 12 M10 20 L10 4 M16 20 L16 9 M22 20 L22 15',
  bookmarks:'M5 3 L19 3 L19 21 L12 17 L5 21 L5 3 Z',
  play:'M8 4 L20 12 L8 20 Z'
};
export function fontCSS(size:number,weight=400,italic=false,family=SYSTEM_FONT){return `${italic?'italic ':''}${weight} ${size}px ${family}`;}
export function themeColors(theme:Options['theme']){
  return theme==='light'?{card:'#ffffff',text:'#0f1419',muted:'#536471',line:'#e7ecf0',soft:'#f5f8fa',link:'#1679c5'}:
    theme==='dim'?{card:'#15202b',text:'#f7f9f9',muted:'#98a8b6',line:'#36434e',soft:'#1d2d3c',link:'#46b4ff'}:
    {card:'#090c10',text:'#f1f4f7',muted:'#909ba6',line:'#29323b',soft:'#161c23',link:'#46b4ff'};
}
const segmenter=typeof Intl!=='undefined'&&(Intl as any).Segmenter?new (Intl as any).Segmenter(undefined,{granularity:'grapheme'}):undefined;
export function graphemes(text:string):string[]{return segmenter?Array.from(segmenter.segment(text),(s:any)=>s.segment):Array.from(text);}
function pieces(text:string):string[]{const gs=graphemes(text.replace(/\r\n?/g,'\n'));const out:string[]=[];let latin='';for(const g of gs){if(/^[a-zA-Z0-9_'’.-]$/.test(g)){latin+=g;}else{if(latin){out.push(latin);latin='';}out.push(g);}}if(latin)out.push(latin);return out;}
export function layoutCapture(capture:Capture,selection:Set<string>,order:string[],o:Options,assets:AssetMap,measure:CanvasRenderingContext2D):Scene{
  const colors=themeColors(o.theme), s:Scene={width:o.width,height:0,commands:[],links:[],cards:[],texts:[],warnings:[]};
  const hasSources=sourcesAllowed(o);
  const memo=new Map<string,number>();
  const width=(text:string,size:number,weight:number,italic:boolean,family:string)=>{const f=fontCSS(size,weight,italic,family),k=f+'\0'+text;if(memo.has(k))return memo.get(k)!;measure.font=f;const w=measure.measureText(text).width;memo.set(k,w);return w;};
  function textLine(text:string,x:number,y:number,size:number,color:string,weight=400,href?:string,italic=false,family=SYSTEM_FONT){
    const w=width(text,size,weight,italic,family);const cmd:TextCommand={type:'text',text,x,y:y+size*.94,fontSize:size,color,weight,italic,family,width:w,ascent:size*.94};s.commands.push(cmd);
    if(href&&hasSources){cmd.href=href;s.links.push({x,y,w,h:size*1.3,url:href});}return w;
  }
  function flow(runs:Run[],x:number,y:number,w:number,size:number,color:string,lh=o.lineHeight):number{
    let px=x,py=y;const lineH=size*lh;let buffer='',cur:Run|undefined;let bufferX=px;
    const flush=()=>{if(!buffer||!cur)return;const weight=cur.bold?700:400,family=cur.code?MONO_FONT:SYSTEM_FONT;const color2=cur.href?colors.link:color;
      const tw=textLine(buffer,bufferX,py,size,color2,weight,cur.href,!!cur.italic,family);const cmd=s.commands[s.commands.length-1] as TextCommand;cmd.underline=cur.underline;cmd.strike=cur.strike;buffer='';};
    const newline=()=>{flush();px=x;py+=lineH;};
    const append=(value:string,r:Run)=>{const f=r.code?MONO_FONT:SYSTEM_FONT;const tw=width(value,size,r.bold?700:400,!!r.italic,f);
      if(value==='\n'){newline();return;}
      if(px>x+.01&&px+tw>x+w+.01)newline();
      if(tw>w&&graphemes(value).length>1){for(const char of graphemes(value))append(char,r);return;}
      if(!buffer)bufferX=px;buffer+=value;px+=tw;
    };
    for(const r of runs){flush();cur=r;for(const p of pieces(r.text))append(p,r);}
    flush();return py+lineH;
  }
  const rect=(x:number,y:number,w:number,h:number,fill:string,r=0,stroke?:string,alpha?:number)=>s.commands.push({type:'rect',x,y,w,h,fill,r,stroke,alpha});
  function badge(p:Post,x:number,y:number,size:number){
    if(!o.showVerified||!p.author.verified||o.anonymize)return;
    if(p.author.badge?.paths.length){for(const part of p.author.badge.paths)s.commands.push({type:'path',x,y,size,path:part.path,color:part.color,fill:true,fillRule:part.rule,viewBox:p.author.badge.viewBox});}
    else {s.commands.push({type:'path',x,y,size,path:FALLBACK_BADGE,color:'#1d9bf0',fill:true},{type:'path',x:x+size*.15,y:y+size*.15,size:size*.7,path:'M5 12 L10 17 L20 6',color:'#ffffff'});}
  }
  function avatar(p:Post,x:number,y:number,size:number){
    rect(x,y,size,size,colors.soft,size/2);
    if(!o.anonymize&&p.author.avatar&&assets.has(p.author.avatar))s.commands.push({type:'image',x,y,w:size,h:size,src:p.author.avatar,r:size/2,fit:'cover',alt:'作者头像'});
    else textLine(o.anonymize?'匿':p.author.name.slice(0,1),x+size*.29,y+size*.2,size*.43,colors.muted,600);
  }
  function identity(p:Post,x:number,y:number,w:number,size:number,withTime:boolean,stacked=false){
    const name=o.anonymize?'匿名用户':p.author.name,handle=o.anonymize?'anonymous':p.author.handle;
    const bs=Math.max(14,size*1.12),hasBadge=o.showAuthor&&o.showVerified&&p.author.verified&&!o.anonymize;
    const badgeSpace=hasBadge?bs+5:0;let py=y,right=x;
    if(o.showAuthor){
      const before=s.commands.length,end=flow([{text:name,bold:true}],x,y,Math.max(30,w-badgeSpace),size,colors.text,1.35);
      const last=s.commands.slice(before).filter(c=>c.type==='text').slice(-1)[0] as TextCommand|undefined;
      py=last?last.y-last.ascent:y;right=last?last.x+last.width:x;
      if(hasBadge){badge(p,right+4,py+(size*1.2-bs)/2,bs);right+=badgeSpace;}
      if(stacked){py=end;right=x;}
    }
    const meta=[];if(o.showHandle)meta.push('@'+handle);if(withTime&&o.showTime){const t=p.displayTime||(p.published?new Date(p.published).toLocaleDateString('zh-CN'):'');if(t)meta.push(t);}
    if(meta.length){const text=meta.join(' · '),metaSize=stacked?o.metaSize:Math.min(size,o.metaSize+1),gap=right>x?7:0;
      if(right>x&&width(text,metaSize,400,false,SYSTEM_FONT)>w-(right-x)-gap){py+=size*1.35;right=x;}
      py=flow([{text}],right+gap,py,Math.max(30,w-(right-x)-gap),metaSize,colors.muted,1.35);
    }else if(o.showAuthor)py+=size*1.35;
    if(hasSources&&p.url&&(o.showAuthor||o.showHandle))s.links.push({x,y,w,h:Math.max(size,py-y),url:p.url});
    return py;
  }
  function mediaBlock(media:any[],x:number,y:number,w:number):number{
    if(!o.showMedia)return y;
    const gap=8;
    const draw=(m:any,mx:number,my:number,mw:number,mh:number,fit=o.mediaFit)=>{
      const src=m.src||'',asset=assets.get(src);rect(mx,my,mw,mh,colors.soft,Math.min(o.radius,12));
      if(src&&asset)s.commands.push({type:'image',x:mx,y:my,w:mw,h:mh,src,r:Math.min(o.radius,12),fit,alt:m.alt||''});
      else {const label=m.kind==='image'?'图片尚未加载':m.kind==='gif'?'GIF 动态媒体':'视频封面尚未加载';flow([{text:label}],mx+16,my+Math.max(12,mh/2-14),mw-32,o.metaSize,colors.muted);s.warnings.push(`媒体未载入：${m.alt||m.kind}`);}
      if(m.kind!=='image'){rect(mx+10,my+mh-32,Math.min(160,mw-20),24,'#0f1419',6,undefined,.85);textLine(m.kind==='gif'?'GIF':`▶ 视频${m.duration?' · '+m.duration:''}`,mx+18,my+mh-29,12,'#ffffff');}
      if(m.href&&hasSources)s.links.push({x:mx,y:my,w:mw,h:mh,url:m.href});
    };
    if(o.mediaLayout==='native'&&media.length>1&&media.every(m=>m.kind==='image'&&m.display?.width>1&&m.display?.height>1)){
      const boxes=media.map(m=>m.display),left=Math.min(...boxes.map(b=>b.x)),top=Math.min(...boxes.map(b=>b.y)),right=Math.max(...boxes.map(b=>b.x+b.width)),bottom=Math.max(...boxes.map(b=>b.y+b.height));
      const bw=right-left,bh=bottom-top;
      // Reject overlapping/off-screen carousel geometry rather than fabricating a mosaic.
      const overlap=boxes.some((a,i)=>boxes.some((b,j)=>j>i&&Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>2&&Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>2));
      if(bw>1&&bh>1&&!overlap&&bw/bh<10&&bh/bw<8){
        const k=Math.min(w/bw,o.mediaMaxHeight/bh),start=x+(w-bw*k)/2;
        media.forEach((m,i)=>{const b=boxes[i];draw(m,start+(b.x-left)*k,y+(b.y-top)*k,b.width*k,b.height*k,b.fit||o.mediaFit);});return y+bh*k+12;
      }
    }
    if(o.mediaLayout!=='stack'&&media.length>1&&media.every(m=>m.kind==='image')){
      const col=(w-gap)/2,rows=Math.ceil(media.length/2),rowH=Math.min(o.mediaMaxHeight,col*.78);
      media.forEach((m,i)=>draw(m,x+(i%2)*(col+gap),y+Math.floor(i/2)*(rowH+gap),media.length===3&&i===2?w:col,rowH));return y+rows*rowH+(rows-1)*gap+12;
    }
    for(const m of media){const a=assets.get(m.src),iw=a?.width||m.width||800,ih=a?.height||m.height||450;const h=Math.min(o.mediaMaxHeight,Math.max(100,w*ih/iw));draw(m,x,y,w,h,o.mediaLayout==='native'&&m.display?m.display.fit:o.mediaFit);y+=h+12;}
    return y;
  }
  function body(blocks:Block[],x:number,y:number,w:number,size:number,depth=0){
    for(let i=0;i<blocks.length;i++){
      const b=blocks[i];
      if(b.kind==='text'){
        if(!b.runs.some(r=>r.text))continue;
        const heading=b.level?size*(b.level===1?1.55:b.level===2?1.32:1.14):size;
        const indent=b.quote||b.list?18:0;const startY=y;
        if(b.list)textLine(b.list,x,y,heading,colors.muted);
        const idx=s.commands.length; y=flow(b.runs.map(r=>({...r,bold:b.level?true:r.bold,code:b.code||r.code})),x+indent+(b.code?10:0),y,w-indent-(b.code?20:0),heading,colors.text)+8;
        if(b.quote)s.commands.splice(idx,0,{type:'rect',x,y:startY+2,w:3,h:y-startY-8,r:1,fill:colors.line});
        if(b.code)s.commands.splice(idx,0,{type:'rect',x,y:startY-4,w,h:y-startY+2,r:6,fill:colors.soft});
      }else if(b.kind==='media'){
        const group=[b.media];while(i+1<blocks.length&&blocks[i+1].kind==='media'){i++;group.push((blocks[i] as any).media);}y=mediaBlock(group,x,y,w);
      }else if(b.kind==='embed'){if(o.showQuote)y=quote(b.post,x,y,w,depth+1);
      }else {s.commands.push({type:'line',x,y:y+5,x2:x+w,y2:y+5,color:colors.line,width:1});y+=20;}
    }return y;
  }
  function quote(p:Post,x:number,y:number,w:number,depth=0):number{
    if(depth>4){s.warnings.push('引用嵌套超过显示上限；请将深层引用单独加入候选。');return y;}
    const start=y,idx=s.commands.length,cp=Math.min(14,w*.08),px=x+cp,pw=w-cp*2;y+=cp;
    const av=Math.min(34,o.avatarSize),tx=px+(o.showAvatar?av+9:0),tw=pw-(o.showAvatar?av+9:0),headY=y;
    if(o.showAvatar)avatar(p,px,y,av);
    y=identity(p,tx,y,tw,Math.max(13,o.metaSize+1),true);
    y=headY+Math.max(o.showAvatar?av:0,y-headY)+10;
    if(p.title)y=flow([{text:p.title,bold:true}],px,y,pw,o.fontSize,colors.text,1.4)+8;
    y=body(p.blocks,px,y,pw,Math.max(12,o.fontSize-2),depth);
    if(p.quote)y=quote(p.quote,px,y,pw,depth+1);
    if(p.linkCard)y=flow([{text:p.linkCard.title,href:hasSources?p.linkCard.url:undefined}],px,y,pw,o.metaSize,colors.muted,1.4)+8;
    if(p.poll){for(const opt of p.poll.options)y=flow([{text:opt.text+(opt.percent!==undefined?` · ${opt.percent}%`:'')}],px,y,pw,o.metaSize,colors.text,1.4)+4;if(p.poll.summary)y=flow([{text:p.poll.summary}],px,y,pw,o.metaSize,colors.muted,1.4)+8;}
    if(o.showNote&&p.note)y=flow([{text:p.note}],px,y,pw,o.metaSize,colors.muted,1.4)+8;
    if(o.showSource&&hasSources&&p.url)y=flow([{text:p.url,href:p.url}],px,y,pw,Math.max(10,o.metaSize-1),colors.muted,1.4)+6;
    y+=Math.max(4,cp-6);
    s.commands.splice(idx,0,{type:'rect',x,y:start,w,h:y-start,r:Math.min(o.radius,14),fill:colors.card,stroke:colors.line});
    s.warnings.push(...p.warnings);
    return y+12;
  }
  let y=o.padding;
  const byId=new Map(capture.posts.map(p=>[p.id,p]));
  const arranged=[...new Set([...order,...capture.posts.map(p=>p.id)])].filter(id=>selection.has(id)).map(id=>byId.get(id)).filter((p):p is Post=>!!p);
  for(const p of arranged){
    const role=postRole(p,capture),isReply=role==='reply',indent=o.roleStyles&&isReply?Math.min(o.replyIndent,(o.width-o.padding*2)*.2):0;
    const x=o.padding+indent,w=o.width-o.padding*2-indent,cp=Math.min(o.cardPadding,w*.15),px=x+cp,pw=w-cp*2;
    const start=y,base=s.commands.length;let cy=y+cp;
    const userName=o.anonymize?'匿名用户':p.author.name,userHandle=o.anonymize?'anonymous':p.author.handle;
    const compact=o.compactReplies&&role!=='main'&&o.mode!=='document';
    if(o.showRelation&&role!=='main'&&!(compact&&role==='continuation')){
      const parent=p.parentId?byId.get(p.parentId):undefined;
      const context=parent?` · 回复 ${o.anonymize?'匿名用户':'@'+parent.author.handle}`:p.replyToHandle?` · 回复 ${o.anonymize?'匿名用户':'@'+p.replyToHandle}`:p.relationEvidence==='unknown'?' · 关系待核验':'';
      cy=flow([{text:ROLE_LABELS[role]+context}],px,cy,pw,o.metaSize,colors.muted,1.35)+10;
    }
    let tx=px,tw=pw,headerH=0;
    const av=compact?Math.min(o.avatarSize,36):o.avatarSize;
    if(o.showAvatar){avatar(p,px,cy,av);tx+=av+12;tw-=av+12;headerH=av;}
    const authorSize=Math.max(o.metaSize+2,o.fontSize*.85);
    let hy=identity(p,tx,cy,tw,authorSize,compact,!compact);
    if(compact&&o.showTime&&p.edited)hy=flow([{text:p.edited}],tx,hy,tw,o.metaSize,colors.muted,1.3);
    cy+=Math.max(headerH,hy-cy)+(headerH||hy>cy?(compact?9:14):0);
    if(p.title){cy=flow([{text:p.title,bold:true}],px,cy,pw,o.fontSize*1.5,colors.text,1.3)+15;}
    cy=body(p.blocks,px,cy,pw,o.fontSize);
    if(p.quote&&o.showQuote)cy=quote(p.quote,px,cy,pw);
    if(p.linkCard){
      const lc=p.linkCard,idx=s.commands.length,ly=cy;cy+=12;
      if(lc.image&&o.showMedia)cy=mediaBlock([{kind:'image',src:lc.image,alt:'链接卡片封面'}],px+12,cy,pw-24);
      cy=flow([{text:lc.title,href:hasSources?lc.url:undefined,bold:true}],px+12,cy,pw-24,o.metaSize,colors.text,1.4)+7;
      if(lc.description)cy=flow([{text:lc.description}],px+12,cy,pw-24,o.metaSize,colors.muted,1.4)+6;
      cy=flow([{text:lc.url,href:hasSources?lc.url:undefined}],px+12,cy,pw-24,Math.max(10,o.metaSize-1),colors.muted,1.3)+12;
      s.commands.splice(idx,0,{type:'rect',x:px,y:ly,w:pw,h:cy-ly,r:10,fill:colors.soft,stroke:colors.line});cy+=12;
    }
    if(p.poll){
      for(const opt of p.poll.options){const rowH=o.fontSize*1.5+12;rect(px,cy,pw,rowH,colors.soft,7);if(opt.percent!==undefined)rect(px,cy,pw*Math.max(0,Math.min(100,opt.percent))/100,rowH,o.theme==='light'?'#cee7fb':'#1c4563',7);
        const suffix=opt.percent===undefined?'':`  ${opt.percent}%`;cy=flow([{text:opt.text+suffix}],px+10,cy+6,pw-20,o.fontSize,colors.text,1.5)+12;
      }if(p.poll.summary)cy=flow([{text:p.poll.summary}],px,cy,pw,o.metaSize,colors.muted,1.3)+10;
    }
    if(p.note&&o.showNote){const iy=cy,idx=s.commands.length;cy+=12;cy=flow([{text:'读者补充背景',bold:true}],px+12,cy,pw-24,o.metaSize,colors.text,1.4)+6;cy=flow([{text:p.note}],px+12,cy,pw-24,o.metaSize,colors.text,1.5)+12;s.commands.splice(idx,0,{type:'rect',x:px,y:iy,w:pw,h:cy-iy,r:8,fill:colors.soft,stroke:colors.line});cy+=12;}
    if(o.showTime&&!compact){let time=p.displayTime||'';if(p.published){const d=new Date(p.published);if(!isNaN(+d))time=d.toLocaleString('zh-CN',{hour12:false});}if(p.edited)time+=(time?' · ':'')+p.edited;if(time)cy=flow([{text:time}],px,cy+4,pw,o.metaSize,colors.muted,1.4)+12;}
    if(o.showMetrics&&Object.keys(p.metrics).length){
      s.commands.push({type:'line',x:px,y:cy,x2:px+pw,y2:cy,color:colors.line,width:1});cy+=13;
      const keys=['replies','reposts','likes','views','bookmarks'].filter(k=>p.metrics[k]!==undefined),cols=Math.min(keys.length,pw<400?3:5),cw=pw/cols;
      keys.forEach((key,i)=>{const ix=px+(i%cols)*cw,iy=cy+Math.floor(i/cols)*30;const size=Math.max(14,o.metaSize+3);s.commands.push({type:'path',x:ix,y:iy,size,path:ICONS[key],color:colors.muted});textLine(p.metrics[key],ix+size+6,iy,o.metaSize,colors.muted);});cy+=Math.ceil(keys.length/cols)*30-8;
    }
    if(o.showSource&&hasSources)cy=flow([{text:p.url,href:p.url}],px,cy+5,pw,Math.max(10,o.metaSize-1),colors.muted,1.4)+5;
    cy+=cp;
    const bg=o.roleStyles&&isReply&&o.theme==='light'?o.replyBg:colors.card;
    if(o.shadow&&o.mode==='stack'){
      const layers:Command[]=[];for(let j=5;j>=1;j--){const d=o.shadow*j/15;layers.push({type:'rect',x:x-d/2,y:start+d/2,w:w+d,h:cy-start+d,r:o.radius+d/2,fill:'#000000',alpha:.017});}s.commands.splice(base,0,...layers);}
    const cardIndex=base+(o.shadow&&o.mode==='stack'?5:0);
    s.commands.splice(cardIndex,0,{type:'rect',x,y:start,w,h:cy-start,r:o.mode==='stack'?o.radius:0,fill:bg,stroke:o.border?colors.line:undefined});
    if(o.authorAccent&&o.roleStyles&&['main','continuation','authorReply'].includes(role))s.commands.splice(cardIndex+1,0,{type:'rect',x:x+1,y:start+cp,w:3,h:Math.max(0,cy-start-cp*2),r:1,fill:'#1d9bf0'});
    if(o.mode==='native')s.commands.push({type:'line',x,y:cy,x2:x+w,y2:cy,color:colors.line,width:1});
    s.cards.push({id:p.id,x,y:start,w,h:cy-start,role});s.texts.push((p.title?p.title+'\n':'')+p.blocks.map(b=>b.kind==='text'?b.runs.map(r=>r.text).join(''):'').join('\n'));
    for(const warning of p.warnings)s.warnings.push(warning);
    y=cy+(o.mode==='native'?0:o.gap);
  }
  if(arranged.length)y-=o.mode==='native'?0:o.gap;
  if(o.connectors&&o.mode==='stack'&&s.cards.length>1)for(let i=1;i<s.cards.length;i++){const a=s.cards[i-1],b=s.cards[i];s.commands.push({type:'line',x:a.x+a.w/2,y:a.y+a.h+3,x2:b.x+b.w/2,y2:b.y-3,color:o.theme==='light'?'#ffffff':'#72808d',width:2});}
  if(o.showQR&&hasSources&&rootPost(capture)?.url){
    y+=22;const q=new QRCode(-1,1);q.addData(rootPost(capture)!.url);q.make();const size=92,cell=size/(q.getModuleCount()+8),qx=(s.width-size)/2;
    rect(qx,y,size,size,'#ffffff',0);for(let r=0;r<q.getModuleCount();r++)for(let col=0;col<q.getModuleCount();col++)if(q.isDark(r,col))rect(qx+(col+4)*cell,y+(r+4)*cell,cell+.03,cell+.03,'#000000');y+=size;
  }
  if(o.showCaptureTime){y+=16;y=flow([{text:'采集于 '+new Date(capture.capturedAt).toLocaleString('zh-CN',{hour12:false})}],o.padding,y,s.width-o.padding*2,11,o.background==='gradient'?'#ffffff':colors.muted,1.4);}
  s.height=Math.max(100,Math.ceil(y+o.padding));
  if(o.ratio!=='auto'){
    const [a,b]=o.ratio.split(':').map(Number),oldW=s.width,oldH=s.height;
    if(oldH>oldW*b/a)s.width=Math.ceil(oldH*a/b);else s.height=Math.ceil(oldW*b/a);
    // Add canvas space without cropping, distorting, or silently reducing the font size.
    const dx=(s.width-oldW)/2,dy=(s.height-oldH)/2;
    for(const c of s.commands){c.x+=dx;c.y+=dy;if(c.type==='line'){c.x2+=dx;c.y2+=dy;}}
    for(const l of s.links){l.x+=dx;l.y+=dy;}for(const c of s.cards){c.x+=dx;c.y+=dy;}
  }
  const backdrop:Command[]=[];
  if(o.background==='gradient')backdrop.push({type:'gradient',x:0,y:0,w:s.width,h:s.height,c1:o.bg1,c2:o.bg2,angle:o.angle});
  else if(o.background==='solid'||o.background==='image')backdrop.push({type:'rect',x:0,y:0,w:s.width,h:s.height,r:0,fill:o.bg1});
  if(o.background==='image'){
    if(o.bgImage&&assets.has(o.bgImage))backdrop.push({type:'image',x:0,y:0,w:s.width,h:s.height,src:o.bgImage,r:0,fit:o.bgImageFit,positionX:o.bgImageX,positionY:o.bgImageY,blur:o.bgBlur,alt:'自定义背景'});
    else s.warnings.push('背景图片尚未载入：请选择图片或切换其他背景。');
  }
  if(o.bgPattern!=='none'&&o.background!=='transparent'){
    const step=Math.max(32,Math.ceil(s.height/1000),Math.ceil(s.width/1000),Math.ceil(Math.sqrt(s.width*s.height/6000))),patternColor='#ffffff';
    if(o.bgPattern==='grid'){
      for(let x=0;x<s.width;x+=step)backdrop.push({type:'rect',x,y:0,w:.65,h:s.height,r:0,fill:patternColor,alpha:.12});
      for(let y=0;y<s.height;y+=step)backdrop.push({type:'rect',x:0,y,w:s.width,h:.65,r:0,fill:patternColor,alpha:.12});
    }else {for(let y=step/2;y<s.height;y+=step)for(let x=step/2;x<s.width;x+=step)backdrop.push({type:'rect',x,y,w:1.8,h:1.8,r:.9,fill:patternColor,alpha:.24});}
  }
  if(o.bgDim&&o.background!=='transparent')backdrop.push({type:'rect',x:0,y:0,w:s.width,h:s.height,r:0,fill:'#000000',alpha:o.bgDim/100});
  s.commands.unshift(...backdrop);
  s.warnings=[...new Set(s.warnings)];
  return s;
}
export { ICONS };
