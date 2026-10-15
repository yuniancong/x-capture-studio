import {Capture,Host,Post} from './model';
import {collectDOM} from './parser';
import {mergePosts} from './selection';
import {enrichMediaLinks} from './media-links';
import {sameMediaKey,mergeMediaResources} from '../media/resources';
/** A visible card poster is identity evidence; an unrelated card never inherits video variants. */
function enrichCard(p:Post,raw:unknown){
 if(!p.linkCard?.image||!Array.isArray(raw))return;const key=sameMediaKey({src:p.linkCard.image});
 const matches=raw.filter(m=>m&&m.kind!=='image'&&key&&sameMediaKey(m)===key);
 if(matches.length!==1)return;const source=matches[0];
 const m={...source,src:p.linkCard.image,ownerId:p.id,mediaRole:'embed' as const};
 if(p.linkCard.media)mergeMediaResources(m,p.linkCard.media);p.linkCard.media=m;
}
import {postID,sourceURL,plainText} from './urls';
/** Enrich an observed quote without overwriting translated/currently-visible text. */
export function enrichQuote(visible:Post|undefined,raw:any,capturedAt:string,depth=0):Post|undefined {
  if(depth>3||!raw||typeof raw.id!=='string'||!/^\d+$/.test(raw.id))return visible;
  if(visible&&/^\d+$/.test(visible.id)&&visible.id!==raw.id)return visible;
  const author=raw.author&&typeof raw.author.name==='string'&&typeof raw.author.handle==='string'?raw.author:{name:'引用作者',handle:'unknown'};
  const q:Post=visible?{...visible,author:{...author,...visible.author,avatar:visible.author.avatar||author.avatar,name:visible.author.name&&visible.author.name!=='unknown'&&visible.author.name!==visible.author.handle?visible.author.name:author.name,handle:visible.author.handle!=='unknown'?visible.author.handle:author.handle,verified:visible.author.verified||author.verified}}:
    {id:raw.id,url:'',kind:'post',author,blocks:[],metrics:{},relationEvidence:'data',warnings:[],capturedAt};
  q.id=raw.id;q.url=sourceURL(raw.url||'')||q.url||`https://x.com/i/web/status/${raw.id}`;
  if(!q.published&&typeof raw.published==='string')q.published=raw.published;
  if(!q.blocks.some(b=>b.kind==='text')&&typeof raw.fullText==='string')q.blocks.unshift({kind:'text',runs:[{text:raw.fullText.slice(0,400000)}]});
  if(!q.blocks.some(b=>b.kind==='media')&&Array.isArray(raw.media))for(const m of raw.media.slice(0,8))if(m&&['image','video','gif'].includes(m.kind)&&typeof m.src==='string')q.blocks.push({kind:'media',media:m});
  enrichMediaLinks(q.blocks,raw.media);enrichCard(q,raw.media);
  q.warnings=q.warnings.filter(w=>!w.includes('引用原帖链接未识别'));q.quote=enrichQuote(q.quote,raw.quote,capturedAt,depth+1);
  return q;
}
const delay=(ms:number,signal?:AbortSignal)=>new Promise<void>((res,rej)=>{const done=()=>{signal?.removeEventListener('abort',stop);res();};const t=setTimeout(done,ms);const stop=()=>{clearTimeout(t);signal?.removeEventListener('abort',stop);rej(new DOMException('已取消','AbortError'));};if(signal?.aborted)stop();else signal?.addEventListener('abort',stop,{once:true});});
export class Collector {
  posts:Post[]=[]; private url=location.href;
  constructor(private host:Host){}
  async scan():Promise<Post[]>{
    const fresh=collectDOM();
    if(this.host.probe&&fresh.length){
      try{const data=await this.host.probe(fresh.map(p=>p.id));for(const raw of data as any[]){
        const p=fresh.find(p=>p.id===raw.id);if(!p)continue;
        enrichMediaLinks(p.blocks,raw.media);enrichCard(p,raw.media);
        if(raw.parentId&&/^\d+$/.test(raw.parentId))p.parentId=raw.parentId;
        if(raw.conversationId&&/^\d+$/.test(raw.conversationId))p.conversationId=raw.conversationId;
        if(p.parentId)p.relationEvidence='data';
        if(raw.quote){p.quote=enrichQuote(p.quote,raw.quote,p.capturedAt);if(p.quote?.url)p.warnings=p.warnings.filter(w=>!w.includes('引用原帖链接未识别'));}
        else if(p.quote&&!p.quote.url&&/^\d+$/.test(raw.quotedId||'')){p.quote.id=raw.quotedId;p.quote.url=`https://x.com/i/web/status/${raw.quotedId}`;p.quote.warnings=p.quote.warnings.filter(w=>!w.includes('引用原帖链接未识别'));p.warnings=p.warnings.filter(w=>!w.includes('引用原帖链接未识别'));}
        if(typeof raw.fullText==='string'&&p.warnings.some(w=>w.includes('正文可能折叠'))&&raw.fullText.length>p.blocks.filter(b=>b.kind==='text').map(b=>b.kind==='text'?b.runs.map(r=>r.text).join(''):'').join('').length&&p.kind==='post'){
          const visible=p.blocks.filter(b=>b.kind==='text').map(b=>b.kind==='text'?b.runs.map(r=>r.text).join(''):'').join('');
          const prefix=visible.replace(/[\s…]+$/g,'').slice(0,24);
          if(prefix&&!raw.fullText.startsWith(prefix))continue;
          const media=p.blocks.filter(b=>b.kind!=='text');p.blocks=[{kind:'text',runs:[{text:raw.fullText}]},...media];p.warnings=p.warnings.filter(w=>!w.includes('正文可能折叠'));
        }
      }}catch{/* DOM fallback remains truthful about missing relation evidence. */}
    }
    this.posts=mergePosts(this.posts,fresh);return this.posts;
  }
  reset(){this.posts=[];this.url=location.href;}
  async capture(rootId?:string):Promise<Capture>{
    if(this.url!==location.href){this.reset();}
    await this.scan();
    const root=rootId||postID(location.href)||this.posts[0]?.id||'';
    return {rootId:root,posts:[...this.posts],sourceUrl:sourceURL(location.href)||this.posts.find(p=>p.id===root)?.url||'',capturedAt:new Date().toISOString(),collectionNotes:['候选来自当前页面与本次滚动采集；不保证包含 X 上全部回复。']};
  }
  async loadMore(maxPosts:number,maxScrolls:number,signal:AbortSignal,onProgress:(n:number,step:number)=>void):Promise<void>{
    const pos={x:window.scrollX,y:window.scrollY};const limit=this.posts.length+maxPosts;
    try{
      // Capture earlier visible context before following replies downward.
      if(window.scrollY>0){window.scrollTo(0,0);await delay(600,signal);await this.scan();}
      let stale=0,lastSize=this.posts.length;
      for(let i=0;i<maxScrolls;i++){
        if(signal.aborted)throw new DOMException('已取消','AbortError');
        const primary=document.querySelector('[data-testid="primaryColumn"]')||document.querySelector('main')||document.body;
        // Only benign, explicit expansion controls. Never click engagement buttons.
        const expand=[...primary.querySelectorAll<HTMLElement>('[data-testid="tweet-text-show-more-link"],button,[role="button"]')].filter(n=>{
          if(n.closest('[data-xcapture-ui]'))return false;
          const txt=(n.textContent||'').trim();return /^(Show more replies|Show additional replies|显示更多回复|顯示更多回覆|查看更多回复|展开更多回复)$/.test(txt)||n.dataset.testid==='tweet-text-show-more-link'&&n.tagName!=='A';
        });
        for(const b of expand.slice(0,3))b.click();
        window.scrollBy(0,Math.max(500,window.innerHeight*.82));await delay(700,signal);await this.scan();
        onProgress(this.posts.length,i+1);
        if(this.posts.length>=limit)break;
        stale=this.posts.length===lastSize?stale+1:0;lastSize=this.posts.length;
        if(stale>=4&&window.scrollY+window.innerHeight>=document.documentElement.scrollHeight-40)break;
      }
    }finally{window.scrollTo(pos.x,pos.y);}
  }
}
