/** Best-effort, read-only access to already-present page render data. No API calls,
 * cookie reads, credentials, hidden endpoint requests or account automation.
 * Function is self-contained because Chromium executes it in MAIN world. */
export function pageProbe(ids:string[],suppliedWindow?:any):any[]{
  const win=suppliedWindow||window, wanted=new Set(ids.slice(0,250));const found=new Map<string,any>();
  // Self-contained for MAIN-world execution. Read only variants already present
  // in the page; do not call an X endpoint or request video bytes.
  const publicMedia=(legacy:any,href:string)=>{
    const valid=(s:any,video=false):string|undefined=>{
      if(typeof s!=='string'||!/^https?:\/\//i.test(s)||/[\u0000-\u0020\u007f]/.test(s))return;
      try{const u=new URL(s);if(u.username||u.password||!/(^|\.)twimg\.com$/i.test(u.hostname))return;
        if(video&&!/\.(?:mp4|m4v|mov|webm|ogv|ogg|m3u8|mpd)$/i.test(u.pathname))return;
        return u.href;
      }catch{return;}
    };
    const media=legacy?.extended_entities?.media;
    return (Array.isArray(media)?media:[]).slice(0,8).filter((m:any)=>m&&valid(m.media_url_https)).map((m:any)=>{
      const kind=m.type==='photo'?'image':m.type==='animated_gif'?'gif':'video';
      const variants=Array.isArray(m.video_info?.variants)?m.video_info.variants:[];
      const choices=variants.slice(0,32).map((v:any)=>({url:valid(v?.url,true),bitrate:Number(v?.bitrate)||0}))
        .filter((v:any)=>v.url).sort((a:any,b:any)=>{
          const rank=(u:string)=>/\.mp4$/i.test(new URL(u).pathname)?2:/\.(?:m3u8|mpd)$/i.test(new URL(u).pathname)?0:1;
          return rank(b.url)-rank(a.url)||b.bitrate-a.bitrate;
        });
      return {src:m.media_url_https,kind,alt:m.ext_alt_text||'引用帖媒体',href,
        ...(kind!=='image'?{posterUrl:m.media_url_https,sourceUrl:choices[0]?.url}: {})};
    });
  };
  const publicQuote=(item:any,depth=0):any=>{
    if(depth>3||!item||typeof item!=='object')return;
    const q=item.tweet||item,legacy=q.legacy||{},id=String(q.rest_id||legacy.id_str||'');
    if(!/^\d+$/.test(id))return;
    const user=q.core?.user_results?.result,userLegacy=user?.legacy||{},name=user?.core?.name||userLegacy.name,handle=user?.core?.screen_name||userLegacy.screen_name;
    const fullText=q.note_tweet?.note_tweet_results?.result?.text||legacy.full_text;
    const result:any={id,url:/^[A-Za-z0-9_]+$/.test(handle||'')?`https://x.com/${handle}/status/${id}`:`https://x.com/i/web/status/${id}`};
    if(typeof name==='string'&&typeof handle==='string')result.author={name:name.slice(0,200),handle:handle.slice(0,40),avatar:user?.avatar?.image_url||userLegacy.profile_image_url_https,verified:!!(user?.is_blue_verified||userLegacy.verified)};
    if(typeof fullText==='string')result.fullText=fullText.slice(0,400000);
    const date=new Date(legacy.created_at);if(!isNaN(+date))result.published=date.toISOString();
    result.media=publicMedia(legacy,result.url);
    const nested=publicQuote(q.quoted_status_result?.result,depth+1);if(nested)result.quote=nested;
    return result;
  };
  const nodes=[...win.document.querySelectorAll('article[data-testid="tweet"]')];
  for(const el of nodes){
    const key=Object.keys(el).find(k=>k.startsWith('__reactFiber$')||k.startsWith('__reactProps$'));if(!key)continue;
    const queue:[any,number][]=[[el[key],0]],seen=new WeakSet<object>();let budget=2200;
    while(queue.length&&budget-->0){
      const [obj,depth]=queue.shift()!;if(!obj||typeof obj!=='object'||seen.has(obj))continue;seen.add(obj);
      let id:string|undefined;
      try{id=String(obj.rest_id||obj.id_str||obj.legacy?.id_str||'');}catch{continue;}
      if(id&&wanted.has(id)&&obj.legacy&&(obj.legacy.full_text!==undefined||obj.note_tweet)){
        const l=obj.legacy,n=obj.note_tweet?.note_tweet_results?.result;
        const text=typeof n?.text==='string'?n.text:typeof l.full_text==='string'?l.full_text:undefined;
        const data:any={id,relationEvidence:'data',media:publicMedia(l,`https://x.com/i/web/status/${id}`)};
        if(/^\d+$/.test(l.in_reply_to_status_id_str||''))data.parentId=l.in_reply_to_status_id_str;
        if(/^\d+$/.test(l.conversation_id_str||''))data.conversationId=l.conversation_id_str;
        if(text&&text.length<400000){
          // Expanded URLs and exact Unicode text are preferred over shortened t.co text.
          const entities=n?.entity_set||l.entities||{};
          let expanded=text;
          for(const u of entities.urls||[])if(u.url&&u.expanded_url)expanded=expanded.split(u.url).join(u.expanded_url);
          data.fullText=expanded;
        }
        const q=publicQuote(obj.quoted_status_result?.result);if(q)data.quote=q;
        if(/^\d+$/.test(l.quoted_status_id_str||''))data.quotedId=l.quoted_status_id_str;
        found.set(id,data);
      }
      if(depth>=9)continue;
      let keys:string[];try{keys=Object.keys(obj);}catch{continue;}
      for(const k of keys){
        if(['return','stateNode','alternate','ownerDocument','parentNode','_owner','ref','updateQueue','dependencies'].includes(k))continue;
        if(/token|cookie|session|auth|password/i.test(k))continue;
        try{const val=obj[k];if(val&&typeof val==='object'&&!(val instanceof win.Node))queue.push([val,depth+1]);}catch{}
      }
    }
  }
  return [...found.values()];
}
