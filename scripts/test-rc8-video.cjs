// rc.8 follow-up: shapes observed on logged-in desktop X (2026-10-16).
// 1) The tweet object is a prop of an ANCESTOR fiber of <article>, flattened
//    (id_str/full_text/extended_entities at top level, no `legacy`).
// 2) X empties the Performance resource timeline; a buffered PerformanceObserver
//    still receives each manifest. fMP4 init files (/vid/avc1/0/0/...) are segments.
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../dist/core-test.cjs');
const MID='7700000000000000001',POST='7700000000000000099';
const MASTER=`https://video.twimg.com/amplify_video/${MID}/pl/AbCdEfGh.m3u8?tag=29`;
const MP4=s=>`https://video.twimg.com/amplify_video/${MID}/vid/avc1/${s}/Zz${s.replace('x','_')}.mp4?tag=29`;
const POSTER=`https://pbs.twimg.com/amplify_video_thumb/${MID}/img/Poster01.jpg`;
const flatTweet=(id,extra={})=>({id_str:id,full_text:'Flattened body https://t.co/abc',conversation_id_str:id,created_at:'2026-10-15T05:09:11.000Z',
 entities:{urls:[]},user:{name:'Example Cats',screen_name:'example_cats',id_str:'1'},
 extended_entities:{media:[{type:'video',id_str:MID,media_key:'13_'+MID,media_url_https:POSTER,
  video_info:{variants:[{content_type:'application/x-mpegURL',url:MASTER},{content_type:'video/mp4',bitrate:432000,url:MP4('320x320')},
   {content_type:'video/mp4',bitrate:1280000,url:MP4('720x720')},{content_type:'video/mp4',bitrate:832000,url:MP4('540x540')}]}}]},...extra});
/** Real React chain: article fiber -> 10 wrapper fibers -> component whose props.tweet is the data. */
function fakePage(tweet,{hops=11,extraArticles=[]}={}){
 class Node{}
 const make=t=>{
  let top={memoizedProps:{forwardPivotInfo:null,tweet:t,children:{}},return:null};
  let f=top;for(let i=0;i<hops;i++)f={memoizedProps:{role:'link','aria-labelledby':'x'+i},return:f};
  return {'__reactFiber$test':f,'__reactProps$test':{onClick(){},children:{}}};
 };
 const arts=[make(tweet),...extraArticles.map(make)];
 return {Node,document:{querySelectorAll:()=>arts}};
}
test('Probe reads a flattened tweet held by an ancestor fiber (real logged-in X shape)',()=>{
 const r=C.pageProbe([POST],fakePage(flatTweet(POST)));
 assert.equal(r.length,1);const m=r[0].media[0];
 assert.equal(m.kind,'video');assert.equal(m.src,POSTER);
 assert.deepEqual(m.variants.map(v=>v.kind).sort(),['file','file','file','hls']);
 assert(m.variants.some(v=>v.url===MASTER));
 assert.equal(m.sourceUrl,MP4('720x720'),'largest progressive MP4 is the direct file');
 assert.deepEqual(m.variants.filter(v=>v.kind==='file').map(v=>v.width).sort((a,b)=>a-b),[320,540,720],'codec-prefixed /vid/avc1/WxH/ path gives dimensions');
 assert.equal(r[0].conversationId,POST);assert.equal(r[0].fullText,'Flattened body https://t.co/abc');
});
test('Probe ancestor walk stays keyed by post ID: another post\'s video is never attached',()=>{
 const other=flatTweet('7700000000000000555');
 const r=C.pageProbe([POST],fakePage(other));
 assert.equal(r.length,0);
});
test('Probe reads a flattened quoted_status with its own author',()=>{
 const quoted=flatTweet('7700000000000000777',{full_text:'Quoted body',user:{name:'Quoted Person',screen_name:'quoted_person'},extended_entities:undefined});
 const r=C.pageProbe([POST],fakePage(flatTweet(POST,{quoted_status:quoted,quoted_status_id_str:'7700000000000000777'})));
 assert.equal(r[0].quote.id,'7700000000000000777');assert.equal(r[0].quote.author.handle,'quoted_person');
 assert.equal(r[0].quote.url,'https://x.com/quoted_person/status/7700000000000000777');assert.equal(r[0].quote.fullText,'Quoted body');
});
test('Probe is still a self-contained function for chrome.scripting MAIN world',()=>{
 const fn=(0,eval)('('+C.pageProbe.toString()+')');
 assert.equal(fn([POST],fakePage(flatTweet(POST)))[0].media[0].sourceUrl,MP4('720x720'));
});
test('Collector: probe data replaces the /video/1-only fallback in text export',async()=>{
 const video={kind:'video',src:POSTER,posterUrl:POSTER,alt:'视频封面',attachmentIndex:1,variants:[],domSourceKind:'blob'};
 const blocks=[{kind:'text',runs:[{text:'Flattened body'}]},{kind:'media',media:video}];
 C.enrichMediaLinks(blocks,C.pageProbe([POST],fakePage(flatTweet(POST)))[0].media);
 assert.equal(video.sourceUrl,MP4('720x720'));assert(video.variants.some(v=>v.url===MASTER));
});
test('Enrichment also matches by CDN media ID when poster renditions differ',()=>{
 const video={kind:'video',src:POSTER.replace('.jpg','?format=webp&name=medium'),posterUrl:POSTER.replace('.jpg','?format=webp&name=medium'),alt:'',variants:[]};
 C.enrichMediaLinks([{kind:'media',media:video}],C.pageProbe([POST],fakePage(flatTweet(POST)))[0].media);
 assert.equal(video.sourceUrl,MP4('720x720'));
});
test('X fMP4 init/range files are segments, progressive MP4 is a file',()=>{
 assert.equal(C.classifyResource(`https://video.twimg.com/amplify_video/${MID}/vid/avc1/0/0/720x720/Init01.mp4`),'segment');
 assert.equal(C.classifyResource(`https://video.twimg.com/amplify_video/${MID}/aud/mp4a/0/0/128000/Init02.mp4`),'segment');
 assert.equal(C.classifyResource(`https://video.twimg.com/ext_tw_video/${MID}/pu/vid/avc1/0/3000/720x1280/Seg.m4s`),'segment');
 assert.equal(C.classifyResource(MP4('720x720')),'file');
 assert.equal(C.classifyResource(`https://video.twimg.com/ext_tw_video/${MID}/pu/vid/avc1/720x1280/File.mp4?tag=12`),'file');
});
function fakeObserverCtor(){
 const made=[];
 class PO{constructor(cb){this.cb=cb;this.on=false;made.push(this);}observe(o){this.on=true;this.opts=o;}disconnect(){this.on=false;}
  emit(names){this.cb({getEntries:()=>names.map((name,i)=>({name,startTime:i}))});}}
 return {PO,made};
}
test('Passive log keeps manifests after X clears the timeline; drops segments, foreign hosts, page data',()=>{
 const {PO,made}=fakeObserverCtor(),log=new C.PassiveMediaLog(4);
 assert(log.start(PO,1000));assert.equal(made[0].opts.type,'resource');assert.equal(made[0].opts.buffered,true);
 made[0].emit([MASTER,`https://video.twimg.com/amplify_video/${MID}/vid/avc1/0/0/720x720/Init01.mp4`,
  `https://video.twimg.com/amplify_video/${MID}/vid/avc1/0/3000/720x720/S.m4s`,'https://evil.example/a.m3u8','https://x.com/i/api/graphql/abc',
  `https://video.twimg.com/amplify_video/${MID}/pl/avc1/720x720/Child.m3u8`]);
 assert.deepEqual(log.entries().map(r=>r.url).sort(),[MASTER,`https://video.twimg.com/amplify_video/${MID}/pl/avc1/720x720/Child.m3u8`].sort());
 assert(log.entries().every(r=>r.source==='performance'&&r.frameId===0));
 made[0].emit(['a','b','c','d','e','f'].map(s=>`https://video.twimg.com/amplify_video/1${s.charCodeAt(0)}/pl/${s}.m3u8`));
 assert.equal(log.entries().length,4,'bounded');
 log.stop();assert.equal(made[0].on,false);assert.equal(log.entries().length,0,'memory cleared on stop');
});
test('Passive log without PerformanceObserver fails closed',()=>{
 const log=new C.PassiveMediaLog();assert.equal(log.start(null,0),false);assert.deepEqual(log.entries(),[]);
});
test('Passive entries attach only by media identity; another video stays pending',()=>{
 const {PO,made}=fakeObserverCtor(),log=new C.PassiveMediaLog();log.start(PO,1000);
 made[0].emit([MASTER,'https://video.twimg.com/amplify_video/7700000000000000888/pl/Other.m3u8?tag=29']);
 const m={kind:'video',src:POSTER,posterUrl:POSTER,variants:[]};
 const p={id:POST,url:'https://x.com/example_cats/status/'+POST,author:{name:'E',handle:'example_cats'},kind:'post',blocks:[{kind:'media',media:m}],metrics:{},relationEvidence:'unknown',warnings:[],capturedAt:'2026-10-16'};
 const r=C.attachObservations({rootId:POST,posts:[p],sourceUrl:p.url,capturedAt:'2026-10-16',collectionNotes:[]},new Set([POST]),log.entries(),true);
 assert.equal(r.matched,1);assert.equal(r.unmatched,1);assert.deepEqual(m.variants.map(v=>v.url),[MASTER]);
});
