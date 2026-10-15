import {Author,Badge,Block,Media,Post,Run,Poll} from './model';
import {postID,safeLink,sourceURL} from './urls';
import {absolutePath,hexColor} from './svg';
import {observedVideoURL,observedVideoPageURL,observedImageURL} from './media-links';
import {imageDOMResources,videoDOMResources,iframeMedia} from '../media/dom';
import {postNodes} from './post-nodes';
const clean=(s:string|null|undefined)=>(s||'').replace(/\u200b/g,'').trim();
const richSelectors='[data-testid="twitterArticleRichTextView"], [data-testid="longformRichTextComponent"], [data-testid="articleRichTextView"]';
const authorSelector='[data-testid="User-Name"], [data-testid="UserName"]';
/** Visible quote cards are not always anchors and may omit a permalink entirely.
 * Detect the content boundary first; missing identity must not discard visible text. */
function quoteNode(el:Element):Element|null {
  const explicit=el.querySelector('[data-testid="quoteTweet"], [data-testid="quotedTweet"], article[data-testid="tweet"]');
  if(explicit)return explicit;
  const primaryHeader=el.querySelector(authorSelector);
  const candidates=[...el.querySelectorAll('[role="link"], a[href*="/status/"]')];
  const usable=(q:Element)=>q!==el&&!q.contains(primaryHeader)&&!!q.querySelector('[data-testid="tweetText"], [data-testid="tweetPhoto"], video')&&
    (!!q.querySelector(authorSelector)||/@[A-Za-z0-9_]+/.test(q.textContent||'')&&!!q.querySelector('time, img[src*="profile_images"], [data-testid="Tweet-User-Avatar"]'));
  // Choose the outer content card, not its inner profile/media links.
  const match=candidates.find(usable);if(match)return match;
  for(const header of el.querySelectorAll(authorSelector)){
    if(header===primaryHeader)continue;
    let node=header.parentElement;
    while(node&&node!==el&&!node.contains(primaryHeader)){
      if(usable(node))return node;
      node=node.parentElement;
    }
  }
  return null;
}
function visibleBadge(header:Element,mark=header.querySelector('[data-testid="icon-verified"], [aria-label="Verified account"], [aria-label="已认证账号"], [aria-label="認証済みアカウント"], [aria-label="已認證帳戶"]')):Badge|undefined {
  const svg=['svg','symbol'].includes(mark?.tagName.toLowerCase()||'')?mark:mark?.querySelector('svg');if(!svg)return;
  const vb=(svg.getAttribute('viewBox')||'0 0 24 24').trim().split(/[\s,]+/).map(Number);
  if(vb.length!==4||vb.some(v=>!Number.isFinite(v)||Math.abs(v)>10000)||vb[2]<=0||vb[3]<=0)return;
  const fallback=hexColor(getComputedStyle(svg).color);
  const paths:Badge['paths']=[];
  for(const path of [...svg.querySelectorAll('path')].slice(0,16)){
    if(path.hasAttribute('transform')||path.parentElement?.closest('[transform]'))continue;
    const d=absolutePath(path.getAttribute('d')||'');if(!d)continue;
    const style=getComputedStyle(path),fill=style.fill==='currentcolor'?style.color:style.fill;
    if(fill==='none')continue;
    paths.push({path:d,color:hexColor(fill,fallback),rule:style.fillRule==='evenodd'?'evenodd':'nonzero'});
  }
  return paths.length?{paths,viewBox:vb as [number,number,number,number]}:undefined;
}
function readAuthor(el:Element,quote:Element|null,url?:string):Author {
  const header=ownNodes(el,authorSelector,quote)[0]||el;
  const anchors=[...header.querySelectorAll('a')].filter(a=>!a.querySelector('time'));
  const handleNode=[...header.querySelectorAll('a,span,[dir="ltr"]')].find(n=>!n.closest('time')&&!n.querySelector('time')&&/^@[A-Za-z0-9_]+$/.test(clean(n.textContent)));
  const headerCopy=header.cloneNode(true) as Element;headerCopy.querySelectorAll('time,svg').forEach(n=>n.remove());
  const handleText=(handleNode?clean(handleNode.textContent):clean(headerCopy.textContent)).match(/@([A-Za-z0-9_]+)/)?.[1];
  const handle=handleText||url?.match(/^https:\/\/x.com\/([^/]+)\/status/)?.[1]||'unknown';
  let name=clean(anchors.find(a=>!clean(a.textContent).startsWith('@')&&!!clean(a.textContent))?.textContent);
  if(!name){
    const span=[...header.querySelectorAll('[dir="auto"], [dir="ltr"], span')].find(n=>{const t=clean(n.textContent);return t&&!t.includes('@')&&!n.querySelector('time')&&!n.closest('time')&&!/^\s*[·•]\s*$/.test(t);});
    name=clean(span?.textContent)||handle;
  }
  const avatar=ownNodes(el,'[data-testid="Tweet-User-Avatar"] img, [data-testid^="UserAvatar-Container"] img, img[src*="profile_images"], img[src*="default_profile"]',quote)[0];
  const badge=visibleBadge(header);
  return {name,handle,avatar:imageSrc(avatar),verified:!!badge||!!header.querySelector('[data-testid="icon-verified"], [aria-label="Verified account"], [aria-label="已认证账号"]'),badge};
}
function ownNodes(el:Element,selector:string,quote:Element|null):Element[]{return [...el.querySelectorAll(selector)].filter(n=>!quote?.contains(n)&&!n.closest('[data-xcapture-ui]'));}
function imageSrc(el:Element|undefined|null):string|undefined{
  if(!el)return; const img=el as HTMLImageElement; return img.currentSrc||img.src||undefined;
}
export function inlineRuns(root:Node):Run[]{
  const out:Run[]=[];
  const add=(text:string,s:Partial<Run>)=>{if(!text)return;const last=out[out.length-1];if(last&&['bold','italic','underline','strike','code','href'].every(k=>(last as any)[k]===(s as any)[k]))last.text+=text;else out.push({text,...s});};
  const visit=(node:Node,s:Partial<Run>)=>{
    if(node.nodeType===3){add(node.textContent||'',s);return;}if(node.nodeType!==1)return;
    const el=node as HTMLElement, tag=el.tagName;
    if(['SCRIPT','STYLE','BUTTON','INPUT','SVG'].includes(tag)||el.dataset.xcaptureUi!==undefined)return;
    const next={...s}; if(tag==='B'||tag==='STRONG'||Number(el.style.fontWeight)>=600)next.bold=true;
    if(tag==='I'||tag==='EM'||el.style.fontStyle==='italic')next.italic=true;
    if(tag==='CODE'||tag==='PRE')next.code=true;
    if(tag==='U')next.underline=true;if(['S','DEL','STRIKE'].includes(tag))next.strike=true;
    if(tag==='A'){next.href=safeLink(el.getAttribute('href')||'',location.href);}
    if(tag==='BR'){add('\n',next);return;}
    if(tag==='IMG'){const alt=el.getAttribute('alt');if(alt&&(!el.getAttribute('src')||/emoji/.test(el.getAttribute('src')||'')))add(alt,next);return;}
    for(const child of el.childNodes)visit(child,next);
    if(['P','DIV','LI'].includes(tag)&&out.length&&!out[out.length-1].text.endsWith('\n'))add('\n',s);
  };
  for(const child of root.childNodes)visit(child,{});
  if(out.length){out[0].text=out[0].text.replace(/^\n+/,'');out[out.length-1].text=out[out.length-1].text.replace(/\n+$/,'');}
  return out.filter(r=>r.text);
}
function displayBox(el:Element){
  const r=el.getBoundingClientRect();if(r.width<=1||r.height<=1)return;
  const fit=getComputedStyle(el).objectFit==='contain'?'contain' as const:'cover' as const;
  return {x:r.x,y:r.y,width:r.width,height:r.height,fit};
}
function mediaFromImage(img:HTMLImageElement):Media{const display=displayBox(img.closest('[data-testid="tweetPhoto"]')||img);if(display)display.fit=getComputedStyle(img).objectFit==='contain'?'contain':'cover';return {...imageDOMResources(img),kind:'image',src:img.currentSrc||img.src,sourceUrl:observedImageURL(img),alt:img.alt||'帖子图片',width:img.naturalWidth||Number(img.getAttribute('width'))||undefined,height:img.naturalHeight||Number(img.getAttribute('height'))||undefined,display};}
function visibleVideoFrame(v:HTMLVideoElement):string|undefined {
  if(v.readyState<2||!v.videoWidth||!v.videoHeight||v.videoWidth*v.videoHeight>50000000)return;
  const c=document.createElement('canvas'),k=Math.min(1,1600/Math.max(v.videoWidth,v.videoHeight));
  c.width=Math.max(1,Math.round(v.videoWidth*k));c.height=Math.max(1,Math.round(v.videoHeight*k));
  try{const g=c.getContext('2d');if(!g)return;g.drawImage(v,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.9);}catch{return;}finally{c.width=c.height=1;}
}
export function richBlocks(el:Element):Block[]{
  const blocks:Block[]=[];
  const mediaSelector='img,video,iframe,article[data-testid="tweet"],[data-testid="quoteTweet"]';
  const validMedia=(n:Element)=>n.tagName!=='IMG'||!/emoji|profile_images|default_profile/.test((n as HTMLImageElement).src);
  const walk=(node:Element)=>{
    if(node.matches('[data-xcapture-ui],script,style,button'))return;
    if(node.matches('article[data-testid="tweet"], [data-testid="quoteTweet"]')){const post=parsePost(node,true);if(post)blocks.push({kind:'embed',post});return;}
    if(node.tagName==='IMG'){if(validMedia(node))blocks.push({kind:'media',media:mediaFromImage(node as HTMLImageElement)});return;}
    if(node.tagName==='VIDEO'){const v=node as HTMLVideoElement;blocks.push({kind:'media',media:{...videoDOMResources(v),kind:'video',src:v.poster,sourceUrl:observedVideoURL(v),playbackUrl:observedVideoPageURL(v),posterUrl:v.poster||undefined,alt:'文章内视频',duration:Number.isFinite(v.duration)?`${Math.floor(v.duration/60)}:${String(Math.floor(v.duration%60)).padStart(2,'0')}`:undefined}});return;}
    if(node.tagName==='IFRAME'){const m=iframeMedia(node as HTMLIFrameElement);if(m)blocks.push({kind:'media',media:m});return;}
    if(node.tagName==='HR'){blocks.push({kind:'divider'});return;}
    const paragraph=node.matches('h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,[data-block="true"],[data-testid="tweetText"]');
    if(paragraph){
      const style=node.closest('[data-block="true"]')?.getAttribute('class')||'';
      let first=true;
      const text=(root:Node)=>{const runs=inlineRuns(root);if(!runs.some(r=>r.text.trim()))return;
        blocks.push({kind:'text',runs,level:/^H[1-6]$/.test(node.tagName)?Number(node.tagName[1]):undefined,
          quote:node.tagName==='BLOCKQUOTE'||/blockquote/.test(style),list:first&&node.tagName==='LI'?(node.parentElement?.tagName==='OL'?String([...node.parentElement.children].indexOf(node)+1)+'.':'•'):undefined,code:node.tagName==='PRE'});first=false;};
      const media=[...node.querySelectorAll(mediaSelector)].filter(validMedia).filter(n=>{const ancestor=n.parentElement?.closest(mediaSelector);return !ancestor||ancestor===node||!node.contains(ancestor);});
      if(!media.length){text(node);return;}
      // Range preserves inline markup and exact position. Never move an image past following text.
      let previous:Element|undefined;
      for(const m of media){const range=node.ownerDocument.createRange();range.selectNodeContents(node);if(previous)range.setStartAfter(previous);range.setEndBefore(m);text(range.cloneContents());walk(m);previous=m;}
      const tail=node.ownerDocument.createRange();tail.selectNodeContents(node);if(previous)tail.setStartAfter(previous);text(tail.cloneContents());return;
    }
    if(node.children.length){for(const child of node.children)walk(child);}
    else if(clean(node.textContent))blocks.push({kind:'text',runs:inlineRuns(node)});
  };
  if(el.matches('[data-testid="tweetText"]'))walk(el);else for(const child of el.children)walk(child);
  if(!blocks.length&&clean(el.textContent))blocks.push({kind:'text',runs:inlineRuns(el)});
  return blocks;
}
function readPoll(el:Element,quote:Element|null):Poll|undefined{
  const poll=ownNodes(el,'[data-testid="poll"], [data-testid="pollVotingForm"], [data-testid="pollResults"]',quote)[0];
  if(!poll)return;const opts=[...poll.querySelectorAll('[data-testid^="pollOption"], [role="radio"]')];
  const labels=opts.length?opts:[...poll.querySelectorAll('label')];
  const options=labels.map(n=>{const s=clean(n.textContent),m=s.match(/(\d+(?:\.\d+)?)\s*%/);return{text:s.replace(/\d+(?:\.\d+)?\s*%/,'').trim(),percent:m?Number(m[1]):undefined};});
  if(!options.length)return {options:[],summary:clean(poll.textContent)};
  return {options,summary:clean(poll.querySelector('[data-testid="pollSummary"], [data-testid="pollFooter"]')?.textContent)};
}
function videoMedia(video:HTMLVideoElement,box:Element|null,url:string|undefined,order:number,attachment:number):Media{
  const poster=visibleVideoFrame(video)||video.poster||imageSrc(box?.querySelector('img'))||'';
  return {...videoDOMResources(video),src:poster,textOrder:order,sourceUrl:observedVideoURL(video),playbackUrl:observedVideoPageURL(video),attachmentIndex:attachment>=0?attachment+1:undefined,posterUrl:video.poster||undefined,kind:/\bGIF\b/i.test(box?.textContent||'')?'gif':'video',alt:'视频封面',href:url,
    display:displayBox(video),duration:Number.isFinite(video.duration)?`${Math.floor(video.duration/60)}:${String(Math.floor(video.duration%60)).padStart(2,'0')}`:clean(box?.querySelector('[data-testid="videoDuration"]')?.textContent)||undefined};
}
/** Logged-out desktop X (verified 2026-10-16): Tailwind markup without data-testid or <time>.
 * Identity comes from the post's own permalink and profile links. The quoted post is a nested
 * <article>, so every lookup excludes it; engagement controls are read, never clicked. */
function parseLoggedOutPost(el:Element,quoted:boolean,ownerId:string,depth:number):Post|undefined{
  if(depth>4)return;
  const quote=el.querySelector('article');const own=(selector:string)=>ownNodes(el,selector,quote);
  const permalinks=own('a[href*="/status/"]').filter(a=>!a.closest('[data-engagement-action]')&&!/\/(?:photo|video)\/\d/.test(a.getAttribute('href')||''));
  const stamp=permalinks.find(a=>!a.children.length&&clean(a.textContent));
  let url=[stamp,...permalinks].map(a=>sourceURL(a?.getAttribute('href')||'')).find(Boolean);
  if(!url&&quoted)url=sourceURL(el.parentElement?.closest('[role="link"][data-href]')?.getAttribute('data-href')||'');
  const id=url?postID(url):undefined;
  if(!id&&!quoted)return;
  const links=own('a[href]');
  const handleLink=links.find(a=>/^@[A-Za-z0-9_]+$/.test(clean(a.textContent)));
  const nameLink=links.find(a=>a!==handleLink&&a.getAttribute('href')===handleLink?.getAttribute('href')&&!a.querySelector('img')&&!!clean(a.textContent));
  let header=nameLink?.parentElement||null;while(header&&handleLink&&!header.contains(handleLink)&&header!==el)header=header.parentElement;
  const handle=clean(handleLink?.textContent).slice(1)||url?.match(/^https:\/\/x.com\/([^/]+)\/status/)?.[1]||'unknown';
  const mark=nameLink?.parentElement?.querySelector('[aria-haspopup="dialog"][aria-label] svg')||null;
  // The badge is a sprite reference (<use href="#icon-verified-…">); its paths live in the shared <symbol>.
  const sprite=mark?.querySelector('use')?.getAttribute('href')||mark?.querySelector('use')?.getAttribute('xlink:href')||'';
  const symbol=sprite.startsWith('#')?el.ownerDocument.getElementById(sprite.slice(1)):null;
  const author:Author={name:clean(nameLink?.textContent)||handle,handle,avatar:imageSrc(own('img[src*="profile_images"], img[src*="default_profile"]')[0]),verified:!!mark,
    badge:mark&&header?visibleBadge(header,symbol?.tagName.toLowerCase()==='symbol'?symbol:mark):undefined};
  const blocks:Block[]=[];
  const txt=own('div[dir="auto"]').find(d=>!d.closest('a,button'));const runs=txt?inlineRuns(txt):[];
  if(runs.length)blocks.push({kind:'text',runs});
  const media=own('video, img[src*="//pbs.twimg.com/media/"]');
  media.forEach((n,i)=>{
    if(n.tagName==='IMG'){const m=mediaFromImage(n as HTMLImageElement);m.textOrder=i;m.attachmentIndex=i+1;blocks.push({kind:'media',media:m});return;}
    const box=n.parentElement,m=videoMedia(n as HTMLVideoElement,box,url,i,i);
    // The duration badge has no test ID here; it is the m:ss leaf in the player overlay (00:00 = not loaded).
    if(!m.duration)m.duration=clean([...(box?.querySelectorAll('div,span')||[])].find(d=>!d.children.length&&/^\d{1,2}:\d{2}(?::\d{2})?$/.test(clean(d.textContent))&&/[1-9]/.test(d.textContent||''))?.textContent)||undefined;
    blocks.push({kind:'media',media:m});
  });
  const metrics:Record<string,string>={};
  for(const [key,action] of [['replies','reply'],['reposts','retweet'],['likes','like'],['bookmarks','bookmark']]){const n=own(`[data-engagement-action="${action}"]`)[0];if(n)metrics[key]=clean(n.textContent)||'—';}
  // Status page: views is the permalink beside the timestamp; timelines use a generic engagement pill.
  const views=permalinks.find(a=>a!==stamp&&a.children.length)?.firstElementChild||own('[data-engagement-action="generic"]')[0];
  if(views)metrics.views=clean(views.textContent)||'—';
  const warnings:string[]=[];
  if(quoted&&!url)warnings.push('引用原帖链接未识别；已保留当前页面可见的作者和内容，不会编造链接。');
  const p:Post={id:id||`visible-quote-${ownerId}-${depth}`,url:url||'',author,blocks,kind:'post',textStructure:'text-with-attachments',displayTime:clean(stamp?.textContent)||undefined,
    metrics,relationEvidence:'unknown',warnings,capturedAt:new Date().toISOString()};
  if(quote){const qp=parseLoggedOutPost(quote,true,p.id,depth+1);if(qp&&qp.id!==p.id){p.quote=qp;p.warnings.push(...qp.warnings);}else p.warnings.push('检测到引用卡片，但当前可见内容未能完整读取。');}
  if(!blocks.length&&!p.quote&&clean(el.textContent))p.warnings.push('未识别到正文内容；请确认帖子已加载。');
  for(const b of p.blocks)if(b.kind==='media')b.media.ownerId=p.id;
  return p;
}
export function parsePost(el:Element,quoted=false,ownerId='visible',depth=0):Post|undefined{
  if(depth>4)return;
  if(el.tagName==='ARTICLE'&&!el.hasAttribute('data-testid'))return parseLoggedOutPost(el,quoted,ownerId,depth);
  const quote=quoteNode(el);
  const times=ownNodes(el,'time',quote);const time=times[0];
  const linkCandidates=[time?.closest('a')?.getAttribute('href'),el.getAttribute('href'),el.getAttribute('data-href'),el.getAttribute('data-url'),...ownNodes(el,'a[href*="/status/"]',quote).map(a=>a.getAttribute('href'))];
  let url=linkCandidates.map(s=>sourceURL(s||'')).find(Boolean);
  const rawId=el.getAttribute('data-post-id')||el.getAttribute('data-tweet-id')||'';
  const id=(url?postID(url):undefined)||(/^\d+$/.test(rawId)?rawId:undefined);
  const author=readAuthor(el,quote,url);
  if(!id&&!quoted)return;
  if(!url&&id)url=author.handle!=='unknown'?sourceURL(`/${author.handle}/status/${id}`):sourceURL(`/i/web/status/${id}`);
  const txt=ownNodes(el,'[data-testid="tweetText"]',quote)[0];
  const inlineMedia=!!txt&&!![...txt.querySelectorAll('img,video,iframe')].find(n=>n.tagName!=='IMG'||!/emoji/.test((n as HTMLImageElement).src));
  const blocks:Block[]=txt?(inlineMedia?richBlocks(txt):[{kind:'text',runs:inlineRuns(txt)}]):[];
  // Text export can retain mixed photo/video DOM order without changing visual layout.
  const mediaOrder=ownNodes(el,'[data-testid="tweetPhoto"] img, video',quote);
  const attachmentNodes=mediaOrder.filter(n=>n.tagName==='VIDEO'||!n.closest('[data-testid="videoComponent"]')?.querySelector('video'));
  const images=ownNodes(el,'[data-testid="tweetPhoto"] img',quote) as HTMLImageElement[];
  const seen=new Set<string>();
  for(const img of images){if(inlineMedia&&txt?.contains(img)||img.closest('[data-testid="videoComponent"]')?.querySelector('video'))continue;const m=mediaFromImage(img);m.textOrder=mediaOrder.indexOf(img);if(m.src&&!seen.has(m.src)){seen.add(m.src);blocks.push({kind:'media',media:m});}}
  for(const video of ownNodes(el,'video',quote) as HTMLVideoElement[]){
    if(inlineMedia&&txt?.contains(video))continue;
    blocks.push({kind:'media',media:videoMedia(video,video.closest('[data-testid="videoComponent"]')||video.parentElement,url,mediaOrder.indexOf(video),attachmentNodes.indexOf(video))});
  }
  for(const f of ownNodes(el,'iframe',quote) as HTMLIFrameElement[]){if(inlineMedia&&txt?.contains(f))continue;const m=iframeMedia(f);if(m)blocks.push({kind:'media',media:m});}
  const metrics:Record<string,string>={};
  for(const [key,selector] of Object.entries({replies:'[data-testid="reply"]',reposts:'[data-testid="retweet"], [data-testid="unretweet"]',likes:'[data-testid="like"], [data-testid="unlike"]',bookmarks:'[data-testid="bookmark"], [data-testid="removeBookmark"]',views:'a[href$="/analytics"]'})){
    const n=ownNodes(el,selector,quote).find(n=>n.closest('[role="group"]'))||ownNodes(el,selector,quote)[0];
    if(n){const text=clean(n.textContent); const label=n.getAttribute('aria-label')||'';metrics[key]=text||label.match(/[\d,.]+(?:[KMB万亿])?/i)?.[0]||'—';}
  }
  const fullText=clean(el.textContent);
  const warnings:string[]=[];
  if(quoted&&!url)warnings.push('引用原帖链接未识别；已保留当前页面可见的作者和内容，不会编造链接。');
  if(ownNodes(el,'[data-testid="tweet-text-show-more-link"]',quote).length)warnings.push('正文可能折叠：请在详情页展开后重新采集。');
  const articleAnchor=ownNodes(el,'a[href*="/article/"]',quote)[0];
  if(articleAnchor)warnings.push('包含 Article 链接：当前可能只是预览卡；请打开文章全文后采集。');
  const parentId=el.getAttribute('data-in-reply-to-status-id')||undefined;
  const replyTo=ownNodes(el,'[data-testid="replying-to"] a',quote)[0];
  const note=ownNodes(el,'[data-testid="birdwatch-pivot"], [data-testid="communityNote"], [data-testid="birdwatch-pivot-footer"]',quote).map(n=>clean(n.textContent)).filter(Boolean).join('\n')||undefined;
  const p:Post={id:id||`visible-quote-${ownerId}-${depth}`,url:url||'',author,blocks,kind:'post',textStructure:inlineMedia?'interleaved':'text-with-attachments',published:time?.getAttribute('datetime')||undefined,displayTime:clean(time?.textContent)||undefined,
    metrics,poll:readPoll(el,quote),note,edited:clean(ownNodes(el,'a[href$="/history"], [data-testid="editHistory"]',quote)[0]?.textContent)||undefined,parentId,
    replyToHandle:replyTo?.textContent?.trim().replace(/^@/,''),relationEvidence:parentId?'dom':'unknown',warnings,capturedAt:new Date().toISOString()};
  if(quote){const qp=parsePost(quote,true,p.id,depth+1);if(qp&&qp.id!==p.id){p.quote=qp;p.warnings.push(...qp.warnings);}else p.warnings.push('检测到引用卡片，但当前可见内容未能完整读取。');}
  const card=ownNodes(el,'[data-testid="card.wrapper"], [data-testid="card.layoutLarge.media"], [data-testid="card.layoutSmall.media"]',quote)[0];
  if(card){const a=card.closest('a')||card.querySelector('a'); const href=safeLink(a?.getAttribute('href')||'');if(href)p.linkCard={url:href,title:clean(card.textContent)||href,image:imageSrc(card.querySelector('img'))};if(p.linkCard?.image)p.linkCard.media={...mediaFromImage(card.querySelector('img') as HTMLImageElement),ownerId:p.id,mediaRole:'embed'};}
  if(!blocks.length&&fullText&&!p.quote&&!p.linkCard)p.warnings.push('未识别到正文内容；请确认帖子已加载。');
  for(const b of p.blocks)if(b.kind==='media')b.media.ownerId=p.id;
  return p;
}
export function parseArticle(scope:Document|Element=document):Post|undefined{
  const body=scope.querySelector(richSelectors);if(!body)return;
  const container=body.closest('[data-testid="twitterArticleReadView"]')||body.closest('main')||body.parentElement!;
  const canonical=sourceURL(location.href)||sourceURL(scope.querySelector('link[rel="canonical"]')?.getAttribute('href')||'');
  if(!canonical)return;
  // Embedded posts belong to the article body, never to the article author/header.
  const mainPost=[...container.querySelectorAll('article[data-testid="tweet"]')].find(n=>!body.contains(n));const base=mainPost?parsePost(mainPost):undefined;
  const header=[...container.querySelectorAll(authorSelector)].find(n=>!body.contains(n));
  const handle=clean(header?.textContent).match(/@([\w]+)/)?.[1]||base?.author.handle||canonical.match(/x\.com\/([^/]+)\/status/)?.[1]||'unknown';
  const title=clean(container.querySelector('[data-testid="twitter-article-title"], [data-testid="twitterArticleTitle"], h1')?.textContent)||'X Article';
  const blocks=richBlocks(body);
  const cover=container.querySelector('[data-testid="twitterArticleCoverImage"] img') as HTMLImageElement|null;
  if(cover&&!body.contains(cover))blocks.unshift({kind:'media',media:{...mediaFromImage(cover),mediaRole:'cover'}});
  return {id:postID(canonical)!,url:canonical,kind:'article',textStructure:'interleaved',title,author:header?{name:clean(header.querySelector('a')?.textContent)||handle,handle,avatar:imageSrc([...container.querySelectorAll('img[src*="profile_images"]')].find(n=>!body.contains(n)))}:base?.author||{name:handle==='unknown'?'作者未识别':handle,handle},blocks,metrics:base?.metrics||{},published:base?.published,
    relationEvidence:'unknown',warnings:blocks.length?[]:['文章正文未加载。'],capturedAt:new Date().toISOString()};
}
export function collectDOM(scope:Document|Element=document):Post[]{
  const primary=scope.querySelector('[data-testid="primaryColumn"]')||scope.querySelector('main')||scope;
  const nodes=postNodes(primary);
  const posts=nodes.filter(el=>!el.closest(richSelectors)).map(el=>parsePost(el)).filter((p):p is Post=>!!p);
  const article=parseArticle(scope);if(article){const idx=posts.findIndex(p=>p.id===article.id);if(idx>=0)posts[idx]=article;else posts.unshift(article);}
  return [...new Map(posts.map(p=>[p.id,p])).values()];
}
