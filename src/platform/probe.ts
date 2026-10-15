/** Best-effort, read-only access to already-present page render data. No API calls,
 * cookie reads, credentials, hidden endpoint requests or account automation.
 * Function is self-contained because Chromium executes it in MAIN world. */
export function pageProbe(ids:string[],suppliedWindow?:any):any[]{
  const win=suppliedWindow||window, wanted=new Set(ids.slice(0,250));const found=new Map<string,any>();
  // Self-contained for MAIN-world execution. Read only variants already present
  // in the page; do not call an X endpoint or request video bytes.
  const publicMedia=(subject:any,href:string)=>{
    const valid=(s:any):string|undefined=>{
      if(typeof s!=='string'||s.length>12000||!/^https?:\/\//i.test(s)||/[\u0000-\u0020\u007f]/.test(s))return;
      try{const u=new URL(s);if(u.username||u.password||u.port||!/(^|\.)twimg\.com$/i.test(u.hostname))return;return u.href;}catch{return;}
    };
    const finite=(v:any)=>Number.isFinite(Number(v))&&Number(v)>0?Number(v):undefined;
    const string=(v:any)=>typeof v==='string'?v.replace(/[\u0000-\u001f]/g,'').slice(0,240):undefined;
    const legacy=subject?.legacy||subject;
    let raw=legacy?.extended_entities?.media||subject?.media_entities||subject?.article?.media_entities||subject?.article_results?.result?.media_entities||[];
    // API-v2-shaped data is accepted only when explicitly attached to this same object.
    if(!raw.length&&Array.isArray(subject?.attachments?.media_keys)&&Array.isArray(subject?.includes?.media))raw=subject.includes.media.filter((m:any)=>subject.attachments.media_keys.includes(m.media_key));
    if(!Array.isArray(raw))raw=[];
    return raw.slice(0,64).filter((m:any)=>m&&typeof m==='object').map((m:any,index:number)=>{
      const info=m.media_info||m,video=info.video_info||m.video_info||info;
      const type=info.type||m.type||info.__typename;const kind=type==='photo'||type==='image'||/Image/.test(type)?'image':type==='animated_gif'?'gif':'video';
      const src=valid(m.media_url_https)||valid(info.original_img_url)||valid(info.media_url_https)||valid(info.preview_image_url)||valid(m.preview_image_url)||(kind==='image'?valid(info.url):undefined)||'';
      const width=finite(info.original_info?.width||info.width),height=finite(info.original_info?.height||info.height);
      const variants=(Array.isArray(video.variants)?video.variants:Array.isArray(info.variants)?info.variants:[]).slice(0,128).map((v:any)=>{
        const url=valid(v?.url);if(!url)return;const mime=string(v.content_type||v.mime_type||v.mime);
        const path=new URL(url).pathname,ext=path.match(/\.(\w+)$/)?.[1]?.toLowerCase();
        const k=/mpegurl/i.test(mime||'')||ext==='m3u8'?'hls':mime?.split(';')[0].toLowerCase()==='application/dash+xml'||ext==='mpd'?'dash':/video\//i.test(mime||'')||['mp4','m4v','mov','webm','ogv','ogg'].includes(ext||'')?'file':undefined;
        if(!k)return;const size=path.match(/\/vid\/(?:[a-z0-9.]+\/)?(\d+)x(\d+)\//i);
        return {url,kind:k,mime,width:finite(v.width)||finite(size?.[1]),height:finite(v.height)||finite(size?.[2]),bitrate:finite(v.bitrate??v.bit_rate),codecs:string(v.codecs),frameRate:finite(v.frame_rate),state:'observed',source:'page-data'};
      }).filter(Boolean);
      if(kind==='image'&&src)variants.push({url:src,kind:'image',width,height,state:'observed',source:'page-data'});
      const list=video.subtitles||info.subtitles||video.subtitle_info?.subtitles||info.subtitle_info?.subtitles||[];
      const tracks=(Array.isArray(list)?list:[]).slice(0,64).map((t:any,i:number)=>{
        const url=valid(t?.url||t?.src);const language=string(t?.language||t?.language_code||t?.lang);if(!url&&!language)return;
        return {id:string(t.id)||'data-sub-'+i,kind:'subtitles',url,language,label:string(t.label||t.name),mime:string(t.content_type),default:t.default===true,forced:t.forced===true,inBand:!url,state:'observed',source:'page-data'};
      }).filter(Boolean);
      const mediaId=string(m.media_key||m.id_str||m.media_id||m.rest_id||m.media_id_str||info.id);
      return {mediaId,src,kind,alt:string(m.ext_alt_text||info.alt_text)||'引用帖媒体',href,attachmentIndex:index+1,variants,tracks,
        ...(kind!=='image'?{posterUrl:src,sourceUrl:variants.filter((v:any)=>v.kind==='file').sort((a:any,b:any)=>(b.width||0)*(b.height||0)-(a.width||0)*(a.height||0)||((a.codecs||'')===(b.codecs||'')?(b.bitrate||0)-(a.bitrate||0):0))[0]?.url||variants[0]?.url,playbackUrl:typeof m.expanded_url==='string'?m.expanded_url:undefined}: {sourceUrl:src})};
    });
  };
  const cardMedia=(subject:any,href:string)=>{
    const values=subject?.card?.legacy?.binding_values||subject?.card?.binding_values||[];
    const entries=Array.isArray(values)?values:Object.entries(values).map(([key,value])=>({key,value}));
    const byKey:any={};for(const item of entries.slice(0,80))if(item&&typeof item.key==='string'&&/^(?:amplify_url_vmap|player_stream_url|player_url|video_url|player_image|thumbnail_image)$/.test(item.key))byKey[item.key]=item.value;
    const vars=[];for(const k of ['amplify_url_vmap','player_stream_url','video_url']){const url=byKey[k]?.string_value;if(typeof url==='string'&&/^https:\/\/(?:video|pbs)\.twimg\.com\//.test(url))vars.push({url,kind:k==='amplify_url_vmap'?'vmap':/\.m3u8(?:\?|$)/.test(url)?'hls':/\.mpd(?:\?|$)/.test(url)?'dash':'file',source:'page-data',state:'observed'});}
    const src=byKey.player_image?.image_value?.url||byKey.thumbnail_image?.image_value?.url;
    return vars.length&&typeof src==='string'?[{kind:'video',src,posterUrl:src,href,variants:vars,alt:'嵌入视频'}]:[];
  };
  const publicQuote=(item:any,depth=0):any=>{
    if(depth>3||!item||typeof item!=='object')return;
    const q=item.tweet||item,legacy=q.legacy||q,id=String(q.rest_id||legacy.id_str||'');
    if(!/^\d+$/.test(id))return;
    const user=q.core?.user_results?.result||q.user,userLegacy=user?.legacy||user||{},name=user?.core?.name||userLegacy.name,handle=user?.core?.screen_name||userLegacy.screen_name;
    const fullText=q.note_tweet?.note_tweet_results?.result?.text||q.note_tweet?.text||legacy.full_text;
    const result:any={id,url:/^[A-Za-z0-9_]+$/.test(handle||'')?`https://x.com/${handle}/status/${id}`:`https://x.com/i/web/status/${id}`};
    if(typeof name==='string'&&typeof handle==='string')result.author={name:name.slice(0,200),handle:handle.slice(0,40),avatar:user?.avatar?.image_url||userLegacy.profile_image_url_https,verified:!!(user?.is_blue_verified||userLegacy.verified)};
    if(typeof fullText==='string')result.fullText=fullText.slice(0,400000);
    const date=new Date(legacy.created_at);if(!isNaN(+date))result.published=date.toISOString();
    result.media=publicMedia(q,result.url);
    const nested=publicQuote(q.quoted_status_result?.result||q.quoted_status,depth+1);if(nested)result.quote=nested;
    return result;
  };
  const nodes=[...win.document.querySelectorAll('article[data-testid="tweet"], [data-testid="twitterArticleReadView"], [data-testid="twitterArticleRichTextView"]')];
  for(const el of nodes){
    const own=Object.keys(el).filter(k=>k.startsWith('__reactFiber$')||k.startsWith('__reactProps$'));if(!own.length)continue;
    const queue:[any,number][]=[],seen=new WeakSet<object>();let budget=3200;
    // Desktop X (2026) passes a flattened tweet as a prop of an ANCESTOR component.
    // Read only those ancestors' props, shallowly; results stay keyed by wanted post IDs.
    const fiberKey=own.find(k=>k.startsWith('__reactFiber$'));let fiber:any;try{fiber=fiberKey?el[fiberKey]?.return:undefined;}catch{fiber=undefined;}
    for(let hop=0;fiber&&hop<16;hop++){let props:any;try{props=fiber.memoizedProps;fiber=fiber.return;}catch{break;}if(props&&typeof props==='object')queue.push([props,5]);}
    for(const k of own)queue.push([el[k],0]);
    while(queue.length&&budget-->0){
      const [obj,depth]=queue.shift()!;if(!obj||typeof obj!=='object'||seen.has(obj))continue;seen.add(obj);
      let id:string|undefined;
      try{id=String(obj.rest_id||obj.id_str||obj.legacy?.id_str||obj.id||'');}catch{continue;}
      const flat=!obj.legacy&&typeof obj.id_str==='string'&&(obj.full_text!==undefined||obj.extended_entities);
      if(id&&wanted.has(id)&&!found.has(id)&&(obj.legacy&&(obj.legacy.full_text!==undefined||obj.note_tweet)||flat||obj.media_entities||obj.article?.media_entities||obj.article_results?.result?.media_entities||obj.attachments?.media_keys)){
        const l=obj.legacy||(flat?obj:{}),n=obj.note_tweet?.note_tweet_results?.result||(typeof obj.note_tweet?.text==='string'?obj.note_tweet:undefined);
        const text=typeof n?.text==='string'?n.text:typeof l.full_text==='string'?l.full_text:undefined;
        const data:any={id,relationEvidence:'data',media:[...publicMedia(obj,`https://x.com/i/web/status/${id}`),...cardMedia(obj,`https://x.com/i/web/status/${id}`)]};
        if(/^\d+$/.test(l.in_reply_to_status_id_str||''))data.parentId=l.in_reply_to_status_id_str;
        if(/^\d+$/.test(l.conversation_id_str||''))data.conversationId=l.conversation_id_str;
        if(text&&text.length<400000){
          // Expanded URLs and exact Unicode text are preferred over shortened t.co text.
          const entities=n?.entity_set||l.entities||{};
          let expanded=text;
          for(const u of entities.urls||[])if(u.url&&u.expanded_url)expanded=expanded.split(u.url).join(u.expanded_url);
          data.fullText=expanded;
        }
        const q=publicQuote(obj.quoted_status_result?.result||(flat?obj.quoted_status:undefined));if(q)data.quote=q;
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
