const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../dist/core-test.cjs');
const hls='https://video.twimg.com/amplify_video/880001/pl/master.m3u8';
const fakeVideo=(tracks=[])=>({baseURI:'https://x.com/example/status/880010',currentSrc:hls,videoWidth:320,videoHeight:320,readyState:2,
 getAttribute:()=>null,querySelectorAll:()=>[],closest:()=>null,textTracks:tracks});
test('HLS dimensions: DOM playback size must not label manifest quality',()=>{
 const m=C.videoDOMResources(fakeVideo());assert.equal(m.variants[0].width,undefined);
 assert.equal(m.playbackDimensions.width,320);assert.equal(m.playbackDimensions.source,'video-element');
});
test('Subtitle evidence: an empty TextTrack is a hint, not confirmed in-band captions',()=>{
 const m=C.videoDOMResources(fakeVideo([{id:'',kind:'captions',language:'',label:'',mode:'disabled',cues:null}]));
 assert.equal(m.tracks[0].evidence,'hint');assert.notEqual(m.tracks[0].inBand,true);
});
const page='https://x.com/example/status/880010';
test('Network observer accepts only explicitly opened, bounded X tab sessions',()=>{
 const ledger=new C.ObservationLedger();
 assert.equal(ledger.record({tabId:7,frameId:0,initiator:'https://x.com',url:hls,type:'xmlhttprequest',requestId:'a'},1000),false);
 assert(ledger.begin({tabId:7,documentId:'doc1',page,sessionId:'test-session-01'},1000));
 assert(ledger.record({tabId:7,frameId:0,documentId:'doc1',initiator:'https://x.com',url:hls,type:'xmlhttprequest',requestId:'a'},1001));
 const s=ledger.poll({tabId:7,documentId:'doc1',page,sessionId:'test-session-01'},1002);
 assert.equal(s.records[0].url,hls);assert.equal(s.records.length,1);
 assert.equal(ledger.record({tabId:8,frameId:0,initiator:'https://x.com',url:hls,type:'media',requestId:'b'},1003),false);
 assert.equal(ledger.poll({tabId:7,documentId:'doc1',page,sessionId:'test-session-01'},32000).state,'expired');
});
test('Network association uses media identity, not post ID or request order',()=>{
 const m={kind:'video',src:'https://pbs.twimg.com/amplify_video_thumb/880001/img/poster.jpg',variants:[]};
 const p={id:'880010',url:page,author:{name:'Example',handle:'example'},kind:'post',blocks:[{kind:'media',media:m}],metrics:{},relationEvidence:'unknown',warnings:[],capturedAt:'2026-10-16'};
 const c={rootId:p.id,posts:[p],sourceUrl:page,capturedAt:'2026-10-16',collectionNotes:[]};
 const r=C.attachObservations(c,new Set([p.id]),[{url:hls,source:'network',observedAt:1001,frameId:0}],true);
 assert.equal(r.matched,1);assert.equal(m.variants[0].kind,'hls');assert.equal(m.variants[0].state,'observed');
});
const text=s=>({kind:'text',runs:[{text:s}]});const media={kind:'media',media:{kind:'image',src:'https://pbs.twimg.com/media/foo.jpg',alt:'图'}};
test('Folded body extends the last known text block, not all text ahead of media',()=>{
 const p={blocks:[text('第一段。'),media,text('第二段…')],warnings:['正文可能折叠：请展开。']};
 assert.equal(C.expandAnchoredText(p,'第一段。\n\n第二段完整补充。'),'expanded');
 assert.deepEqual(p.blocks.map(b=>b.kind),['text','media','text']);
 assert.equal(p.blocks[0].runs[0].text,'第一段。');assert(p.blocks[2].runs.map(r=>r.text).join('').includes('完整补充'));
 assert.strictEqual(p.blocks[1],media);
});
test('Unlocated expansion is flagged instead of moving every image to the end',()=>{
 const p={blocks:[text('第一段。'),media,text('第二段…')],warnings:['正文可能折叠']};const original=p.blocks;
 assert.equal(C.expandAnchoredText(p,'第一段。中间还有未定位内容。第二段完整补充。'),'uncertain');
 assert.strictEqual(p.blocks,original);assert(p.warnings.some(w=>w.includes('位置')));
});
const context={tabId:7,documentId:'doc1',page,sessionId:'test-session-01'};
const event={tabId:7,documentId:'doc1',frameId:0,initiator:'https://x.com',url:hls,type:'xmlhttprequest',requestId:'a'};
function opened(){const l=new C.ObservationLedger();l.begin(context,1000);return l;}
for(const [name,patch] of [
 ['wrong tab',{tabId:8}],['wrong frame',{frameId:1}],['wrong document',{documentId:'doc2'}],
 ['foreign initiator',{initiator:'https://other.example'}],['opaque initiator',{initiator:'null'}],['missing initiator',{initiator:undefined}],
 ['non-media request type',{type:'script'}],['not an approved CDN',{url:'https://evil.example/video.mp4'}],
 ['lookalike CDN',{url:'https://video.twimg.com.attacker.example/a.mp4'}],['localhost',{url:'https://127.0.0.1/a.mp4'}],
 ['credentials',{url:'https://u:p@video.twimg.com/a.mp4'}],['nonstandard port',{url:'https://video.twimg.com:8443/a.mp4'}]
])test('Observation isolation rejects '+name,()=>{const l=opened();assert.equal(l.record({...event,...patch},1001),false);assert.equal(l.poll(context,1002).records.length,0);});
test('Observation ignores events delivered from before a new session',()=>{const l=opened();assert.equal(l.record(event,999),false);});
test('Observation upper bounds, dedup and sanitized storage restore',()=>{
 const l=opened();for(let i=0;i<140;i++)l.record({...event,url:`https://video.twimg.com/amplify_video/${90000+i}/pl/a.m3u8`},1001);
 let s=l.poll(context,1002);assert.equal(s.records.length,96);assert(s.limited);
 l.record({...event,url:s.records[0].url,mime:'application/vnd.apple.mpegurl',statusCode:200},1002);
 assert.equal(l.poll(context,1003).records.length,96);
 const fresh=new C.ObservationLedger(l.dump(1003),1004);assert.equal(fresh.poll(context,1004).records.length,96);
 assert.equal(new C.ObservationLedger(l.dump(1003),50000).dump(50000).length,0);
 assert.equal(l.poll({...context,sessionId:'other-session'},1003).state,'scope-changed');
 assert.equal(l.poll({...context,page:page+'/other'},1003).records.length,0);
});
test('Segments are counts only; no segment exported as an entire file',()=>{
 const l=opened();l.record({...event,url:'https://video.twimg.com/amplify_video/880001/seg/part.ts'},1001);
 assert.equal(l.poll(context,1002).records.length,0);assert.equal(l.poll(context,1002).segments,1);
});
test('Extension and service worker initiators are not page playback traffic',()=>{
 const l=opened();assert(!l.record({...event,initiator:'chrome-extension://our-id'},1001));assert(!l.record({...event,tabId:-1},1001));
});
test('Observed HTTP success is not verified playable media',()=>{
 const l=opened();l.record({...event,statusCode:200},1001);assert.equal(l.poll(context,1001).records[0].status,200);
 assert(!JSON.stringify(l.dump(1001)).includes('verified'));
});
function post(id,medias){return {id,url:`https://x.com/example/status/${id}`,author:{name:'Example',handle:'example'},kind:'post',blocks:medias.map(m=>({kind:'media',media:m})),metrics:{},warnings:[],relationEvidence:'unknown',capturedAt:'2026-10-16'};}
function capture(posts){return {rootId:posts[0].id,sourceUrl:posts[0].url,posts,capturedAt:'2026-10-16',collectionNotes:[]};}
const video=id=>({kind:'video',src:`https://pbs.twimg.com/amplify_video_thumb/${id}/img/p.jpg`,variants:[],alt:'视频封面'});
const rec=(url,extra={})=>({url,source:'network',observedAt:2000,frameId:0,...extra});
test('Two videos and preloads never bind by arrival order',()=>{
 const a=video('880001'),b=video('880002'),c=capture([post('1',[a,b])]);
 const r=C.attachObservations(c,new Set(['1']),[rec('https://video.twimg.com/amplify_video/880002/pl/b.m3u8'),rec(hls),rec('https://video.twimg.com/amplify_video/999999/pl/unrelated.m3u8')]);
 assert.equal(r.matched,2);assert.equal(r.unmatched,1);assert(a.variants[0].url===hls);assert(b.variants[0].url.includes('880002'));
});
test('Unselected replies cannot be targets of a selected-post export',()=>{
 const a=video('880001'),b=video('880002'),c=capture([post('1',[a]),post('2',[b])]);
 const r=C.attachObservations(c,new Set(['1']),[rec('https://video.twimg.com/amplify_video/880002/pl/b.m3u8')]);assert.equal(r.matched,0);assert.equal(a.variants.length,0);
});
test('Quote media remain owned by quoted post',()=>{
 const a=video('880002'),b=video('880001'),p=post('1',[a]);p.quote=post('2',[b]);const c=capture([p]);
 assert.equal(C.attachObservations(c,new Set(['1']),[rec(hls)]).matched,1);assert.equal(b.ownerId,'2');assert.equal(a.variants.length,0);
});
test('Ambiguous identical media in two blocks are not assigned silently',()=>{
 const a=video('880001'),b=video('880001'),c=capture([post('1',[a,b])]);const r=C.attachObservations(c,new Set(['1']),[rec(hls)]);
 assert.equal(r.ambiguous,1);assert.equal(a.variants.length,0);assert.equal(b.variants.length,0);
});
test('MP4, HLS, DASH and MIME-only sources all retained once',()=>{
 const a=video('880001'),c=capture([post('1',[a])]);
 const list=[rec(hls),rec('https://video.twimg.com/amplify_video/880001/vid/a.mp4'),rec('https://video.twimg.com/amplify_video/880001/pl/a.mpd'),rec('https://video.twimg.com/amplify_video/880001/pl/entry',{mime:'application/vnd.apple.mpegurl'})];
 C.attachObservations(c,new Set(['1']),list);C.attachObservations(c,new Set(['1']),list);
 assert.equal(a.variants.length,4);assert.deepEqual(new Set(a.variants.map(v=>v.kind)),new Set(['hls','file','dash']));
});
test('Do not map generic poster URLs to an arbitrary video',()=>{
 const a={kind:'video',src:'https://pbs.twimg.com/media/generic.jpg'},c=capture([post('1',[a])]);assert.equal(C.attachObservations(c,new Set(['1']),[rec(hls)]).matched,0);
});
test('A structured media_key can match CDN identity with a different post ID',()=>{
 const a={kind:'video',src:'',mediaId:'13_880001'},c=capture([post('880010',[a])]);assert.equal(C.attachObservations(c,new Set(['880010']),[rec(hls)]).matched,1);
});
test('Performance fallback keeps approved recent media URLs without requiring TAO timing fields',()=>{
 const entries=[{name:hls,startTime:10},{name:'https://private.example/secret?token=do-not-copy',startTime:20},{name:hls,startTime:25},{name:'https://video.twimg.com/seg/a.ts',startTime:30}];
 assert.equal(C.performanceMediaEntries({timeOrigin:1000,getEntriesByType:()=>entries},2000).length,1);
 assert.equal(C.performanceMediaEntries({timeOrigin:1000,getEntriesByType:()=>entries},200000).length,0);
});
function eventBus(){const handlers=[];return {handlers,addListener(fn,...args){handlers.push({fn,args});},removeListener(fn){const i=handlers.findIndex(h=>h.fn===fn);if(i>=0)handlers.splice(i,1);},emit(...a){for(const h of handlers)h.fn(...a);}};}
function fakeChrome(memory={},permitted=true){const api={runtime:{id:'our-extension',getURL:p=>'chrome-extension://our-extension/'+p},
 storage:{session:{get:async key=>({[key]:memory[key]}),set:async o=>{Object.assign(memory,structuredClone(o));},remove:async k=>{delete memory[k];}}},
 permissions:{contains:async()=>permitted,onAdded:eventBus(),onRemoved:eventBus()},
 webRequest:{onBeforeRequest:eventBus(),onResponseStarted:eventBus(),onErrorOccurred:eventBus()},
 tabs:{onRemoved:eventBus(),onUpdated:eventBus(),created:[],create:async o=>{api.tabs.created.push(o);}},
 alarms:{onAlarm:eventBus(),create:async()=>{},clear:async()=>true}};return api;}
const sender={id:'our-extension',frameId:0,documentId:'doc1',url:page,tab:{id:7,url:page}};
test('Real adapter policy: listeners registered synchronously; no blocking or request-body access',async()=>{
 const api=fakeChrome();const bridge=new C.ChromeObservationBridge(api,()=>1000);
 assert.equal(api.webRequest.onBeforeRequest.handlers.length,1);
 assert.deepEqual(api.webRequest.onResponseStarted.handlers[0].args,[{urls:['https://video.twimg.com/*'],types:['media','xmlhttprequest','other']},['responseHeaders']]);
 assert(!JSON.stringify(api.webRequest.onBeforeRequest.handlers[0].args).includes('blocking'));
 await bridge.settled();
});
test('Adapter persists only approved event fields and restores across worker restart',async()=>{
 let now=1000;const mem={},api=fakeChrome(mem);const bridge=new C.ChromeObservationBridge(api,()=>now);
 await bridge.command('start',sender,'test-session-01');now=1001;
 api.webRequest.onResponseStarted.emit({...event,statusCode:200,responseHeaders:[{name:'Content-Type',value:'application/vnd.apple.mpegurl'},{name:'Set-Cookie',value:'PRIVATE-NOT-TO-STORE'}],requestHeaders:[{name:'Authorization',value:'PRIVATE-TOKEN'}],requestBody:'PRIVATE-BODY'});
 await bridge.settled();assert(!JSON.stringify(mem).includes('PRIVATE'));
 const fresh=new C.ChromeObservationBridge(fakeChrome(mem),()=>1002);const r=await fresh.command('poll',sender,'test-session-01');assert.equal(r.records.length,1);assert.equal(r.records[0].mime,'application/vnd.apple.mpegurl');
 await fresh.command('stop',sender,'test-session-01');assert.equal(Object.keys(mem).length,0);
});
test('Permission denied does not open an observation session',async()=>{
 const mem={},api=fakeChrome(mem,false),bridge=new C.ChromeObservationBridge(api,()=>1000);
 assert.equal((await bridge.command('start',sender,'test-session-01')).state,'permission-required');
 api.webRequest.onBeforeRequest.emit(event);await bridge.settled();assert.equal(Object.keys(mem).length,0);
});
test('Stop, tab close, navigation, and alarm expiry clean session storage',async()=>{
 for(const mode of ['stop','removed','navigation','expiry','permission']){
  const mem={},api=fakeChrome(mem);let now=1000;const b=new C.ChromeObservationBridge(api,()=>now);
  await b.command('start',sender,'test-session-01');api.webRequest.onBeforeRequest.emit(event);await b.settled();
  if(mode==='stop')await b.command('stop',sender,'test-session-01');
  if(mode==='removed')api.tabs.onRemoved.emit(7);
  if(mode==='navigation')api.tabs.onUpdated.emit(7,{url:'https://x.com/example/status/OTHER'});
  if(mode==='expiry'){now=40000;api.alarms.onAlarm.emit({name:'xc-media-observation-expiry'});}
  if(mode==='permission')api.permissions.onRemoved.emit({permissions:['webRequest']});
  await b.settled();assert.equal(Object.keys(mem).length,0,mode);
 }
});
test('Forged sender, stale route, subframe, and stale token cannot read or stop another session',async()=>{
 const b=new C.ChromeObservationBridge(fakeChrome(),()=>1000);await b.command('start',sender,'test-session-01');
 for(const s of [{...sender,id:'other'},{...sender,frameId:1},{...sender,url:page+'/wrong'},{...sender,documentId:'another-document'}]){
   assert.notEqual((await b.command('poll',s,'test-session-01')).state,'active');
 }
 await b.command('stop',sender,'wrong-token');assert.equal((await b.command('poll',sender,'test-session-01')).state,'active');await b.command('stop',sender,'test-session-01');
});
test('Longtext restores a plain trailing attachment and does not duplicate on repeat',()=>{
 const p={blocks:[text('Hello…'),media],warnings:['正文可能折叠']};assert.equal(C.expandAnchoredText(p,'Hello and more'),'expanded');
 assert.equal(p.blocks[0].runs.map(r=>r.text).join(''),'Hello and more');assert.equal(p.blocks[1],media);
 assert.equal(C.expandAnchoredText(p,'Hello and more'),'unchanged');
});
test('Longtext refuses translation mismatch and a truncated middle anchor',()=>{
 for(const p of [{blocks:[text('中文…'),media],warnings:['正文可能折叠']},{blocks:[text('Start…'),media,text('End…')],warnings:['正文可能折叠']}]){
  assert.equal(C.expandAnchoredText(p,'Start changed English with some long content End full text'),'uncertain');
 }
});
test('Subtitle hint -> cue confirmed strengthens evidence without asserting in-band origin',()=>{
 const a={id:'1',kind:'captions',source:'track',state:'observed',evidence:'hint',language:'en',label:'English'};
 const t=C.mergeTracks([a],[{...a,evidence:'cue-confirmed',cueCount:3}],[a]);assert.equal(t.length,1);assert.equal(t[0].evidence,'cue-confirmed');assert.notEqual(t[0].inBand,true);
});
test('Different caption services/languages are never deduplicated into one',()=>{
 const a={id:'cc1',kind:'captions',source:'hls',state:'observed',inBand:true,language:'en',label:'English'};
 assert.equal(C.mergeTracks([a,{...a,id:'cc2'},{...a,id:'cc3',language:'es'}]).length,3);
});
test('HLS master never inherits active video size during resource merge or export',()=>{
 const m=video('880001');m.variants=C.mergeVariants([{url:hls,kind:'hls',source:'dom',state:'observed',width:320,height:320}],[{url:hls,kind:'hls',source:'hls',state:'verified',playlist:'master'}]);
 assert.equal(m.variants[0].width,undefined);
 const t=C.mediaTextLines(m,post('1',[m]),{all:true,images:false,subtitles:true,sensitive:false,markdown:false,links:true,sources:true});assert(!t.text.includes('320×320'));
});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function clientFixture(host,refresh=async()=>{}){
 const m=video('880001'),c=capture([post('880010',[m])]);let snap={capture:c,selected:new Set(['880010']),quotes:true,private:false},url=page,done=0;
 const changed=[];const client=new C.MediaDiscoveryClient(host,()=>snap,refresh,s=>changed.push(s),()=>{done++;},()=>url,()=>[],{callTimeoutMs:30});
 return {client,m,c,changed,get done(){return done;},setScope:s=>{snap={...snap,...s};},setURL:u=>{url=u;}};
}
test('Client: host failure falls back, does not leave checking state stuck',async()=>{
 const f=clientFixture({observe:async()=>{throw Error('bridge offline');}});await f.client.start();assert(!f.client.active);assert.equal(f.client.status.state,'unavailable');f.client.dispose();
});
test('Client: unavailable bridge times out instead of hanging the editor',async()=>{
 const f=clientFixture({observe:()=>new Promise(()=>{})});await f.client.start();assert(!f.client.active);f.client.dispose();
});
test('Client: current selection change rejects a delayed observation result',async()=>{
 const d=deferred(),calls=[];const f=clientFixture({observe:async(a,id)=>{calls.push(a);return a==='start'?d.promise:{state:'stopped',records:[]};}});
 const start=f.client.start();await new Promise(r=>setTimeout(r,0));f.setScope({selected:new Set()});d.resolve({state:'active',expiresAt:Date.now()+30000,records:[{url:hls,source:'network',observedAt:Date.now(),frameId:0}]});await start;
 assert(!f.m.variants?.length);assert(calls.includes('stop'));f.client.dispose();
});
test('Client: playback observations merge and stop with immediate manual return',async()=>{
 const record={url:hls,source:'network',observedAt:Date.now(),frameId:0};const calls=[];
 const f=clientFixture({observe:async(a,id)=>{calls.push(a);return {state:a==='stop'?'stopped':'active',expiresAt:Date.now()+30000,records:a==='poll'?[record]:[]};}});
 await f.client.start();await f.client.stop(true);assert.equal(f.client.status.matched,1);assert(f.m.variants.some(v=>v.url===hls));assert(calls.includes('stop'));f.client.dispose();
});
test('Client: late results after disposal cannot mutate the capture',async()=>{
 const d=deferred();const f=clientFixture({observe:async a=>a==='poll'?d.promise:{state:a==='start'?'active':'stopped',expiresAt:Date.now()+30000,records:[]}});
 await f.client.start();const poll=f.client.poll();f.client.dispose();d.resolve({state:'active',records:[{url:hls,source:'network',observedAt:Date.now(),frameId:0}]});await poll;assert(!f.m.variants?.length);
});
test('Inline trailing media: a full-text string does not reveal its missing offset',()=>{
 const p={blocks:[text('Before…'),media],warnings:['正文可能折叠'],textStructure:'interleaved'};
 assert.equal(C.expandAnchoredText(p,'Before and additional text after the image'),'uncertain');assert.equal(p.blocks[1],media);
});
test('Same HLS root observed by network and manifest becomes one variant, not duplicate roots',()=>{
 const a={url:hls,kind:'hls',source:'network',state:'observed'},b={...a,source:'hls',role:'video',playlist:'master',state:'verified'};
 assert.equal(C.mergeVariants([a],[b]).length,1);
 assert.equal(C.mergeVariants([a],[b,{...b,role:'audio'}]).length,2);
});
test('Production MV3 background bundle initializes without window/document globals',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),api=fakeChrome();api.runtime.onMessage=eventBus();
 const context={chrome:api,URL,Map,Set,Date,Promise,Math,Number,Array,Object,String,RegExp,Uint8Array,AbortController,TextDecoder,TextEncoder,URLSearchParams,setTimeout,clearTimeout,console,fetch,atob,btoa,crypto};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../dist/extension/background.js'),'utf8'),context,{timeout:1000});
 assert.equal(api.webRequest.onBeforeRequest.handlers.length,1);assert.equal(api.runtime.onMessage.handlers.length,1);
 await new Promise(r=>setTimeout(r,0));
});
