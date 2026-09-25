/* Unit/contract tests. These do not claim a live X/Stay integration test. */
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../dist/core-test.cjs');
const post=(id,handle='alice',parentId,text='正文')=>({id:String(id),url:`https://x.com/${handle}/status/${id}`,author:{name:handle,handle},blocks:[{kind:'text',runs:[{text}]}],kind:'post',metrics:{},parentId:parentId?String(parentId):undefined,relationEvidence:parentId?'data':'unknown',warnings:[],capturedAt:'2026-09-25T00:00:00Z'});
const cap=posts=>({rootId:posts[0]?.id||'',posts,sourceUrl:posts[0]?.url||'',capturedAt:'2026-09-25T00:00:00Z',collectionNotes:[]});
const ids=s=>[...s].sort();
const c=cap([post(1),post(2,'alice',1),post(3,'bob',1),post(4,'alice',3),post(5,'alice',2),post(6,'carol',3),post(7)]);
const measure={font:'',measureText(text){return {width:Array.from(text).reduce((n,ch)=>n+(ch.charCodeAt(0)>255?19:10),0)};}};
const lay=(p,o={},order=p.posts.map(p=>p.id),selected=new Set(order))=>C.layoutCapture(p,selected,order,C.normalizeOptions({...C.DEFAULTS,...o}),new Map(),measure);
const tests=[
 ['defaults keep single long PDF and 2x PNG',()=>{assert.equal(C.DEFAULTS.pdfMode,'long');assert.equal(C.DEFAULTS.scale,2);assert.equal(C.DEFAULTS.mode,'stack');}],
 ['only explicit parent links establish author thread',()=>assert.deepEqual(ids(C.authorChain(c)),['1','2','5'])],
 ['find known thread ancestors from middle post',()=>assert.deepEqual(ids(C.authorChain({...c,rootId:'2'})),['1','2','5'])],
 ['direct reply rule excludes replies to a nonauthor reply',()=>assert.deepEqual(ids(C.selectByRule(c,'direct')),['1','2','3','5'])],
 ['same-author candidate rule is not called a thread',()=>assert.deepEqual(ids(C.selectByRule(c,'author')),['1','2','4','5','7'])],
 ['single rule only selects anchor',()=>assert.deepEqual(ids(C.selectByRule(c,'single')),['1'])],
 ['all rule includes all loaded records',()=>assert.equal(C.selectByRule(c,'all').size,7)],
 ['manual selection is cloned and preserved',()=>{const a=new Set(['3','4']);const b=C.selectByRule(c,'manual',a);assert.deepEqual(ids(b),['3','4']);assert.notEqual(a,b);}],
 ['circular parent data terminates safely',()=>assert.deepEqual(ids(C.authorChain(cap([post(1,'alice',2),post(2,'alice',1)]))),['1','2'])],
 ['empty capture safely selects nothing',()=>assert.equal(C.selectByRule(cap([]),'all').size,0)],
 ['role classification distinguishes author answering someone',()=>{assert.equal(C.postRole(c.posts[3],c),'authorReply');assert.equal(C.postRole(c.posts[4],c),'continuation');}],
 ['dedup preserves longer body when later DOM is shorter',()=>{const a=post(1,'alice',undefined,'完整正文'.repeat(30));const b=post(1,'alice',undefined,'缩略');assert.equal(C.plainText(C.mergePosts([a],[b])[0]),C.plainText(a));}],
 ['merge updates explicit reply relation independently',()=>{const a=post(2,'alice',undefined,'完整正文'.repeat(10));const b=post(2,'alice',1,'短');assert.equal(C.mergePosts([a],[b])[0].parentId,'1');}],
 ['canonical URL removes tracking and media suffix',()=>assert.equal(C.sourceURL('https://twitter.com/alice/status/123/photo/1?s=20'),'https://x.com/alice/status/123')],
 ['article URL has its own canonical form',()=>assert.equal(C.sourceURL('https://x.com/i/article/123?foo=bar'),'https://x.com/i/article/123')],
 ['reject hostile scheme and lookalike host',()=>{assert.equal(C.sourceURL('javascript:alert(1)'),undefined);assert.equal(C.sourceURL('https://x.com.attacker.test/alice/status/123'),undefined);}],
 ['reject malformed post ID suffix',()=>assert.equal(C.sourceURL('https://x.com/alice/status/123evil'),undefined)],
 ['only HTTP(S) links survive',()=>{assert.equal(C.safeLink('data:text/html,evil'),undefined);assert.equal(C.safeLink('javascript:evil'),undefined);assert.equal(C.safeLink('/alice/status/12'),'https://x.com/alice/status/12');}],
 ['asset allowlist admits twimg only plus exact fixed font',()=>{assert(C.allowedAsset('https://pbs.twimg.com/media/test.jpg'));assert(C.allowedAsset(C.FONT_URL));assert(!C.allowedAsset('https://raw.githubusercontent.com/other/repo/font.ttf'));}],
 ['asset allowlist rejects credentials, ports, lookalikes',()=>{for(const u of ['https://pbs.twimg.com.evil.test/a','http://pbs.twimg.com/a','https://u:p@pbs.twimg.com/a','https://pbs.twimg.com:444/a','https://127.0.0.1/a'])assert(!C.allowedAsset(u));}],
 ['presets whitelist keys, enums and CSS colors',()=>{const v=C.normalizeOptions(JSON.parse('{"__proto__":{"bad":true},"width":20000,"bg1":"url(evil)","scale":9,"anonymize":"yes"}'));assert.equal(v.width,1800);assert.equal(v.bg1,C.DEFAULTS.bg1);assert.equal(v.scale,2);assert.equal(v.anonymize,false);assert.equal(v.bad,undefined);}],
 ['numeric NaN and invalid container do not poison options',()=>{assert.deepEqual(C.normalizeOptions([]),C.DEFAULTS);assert.equal(C.normalizeOptions({lineHeight:NaN}).lineHeight,C.DEFAULTS.lineHeight);}],
 ['narrow canvas cannot collapse under oversized outer margins',()=>{const o=C.normalizeOptions({width:320,padding:160});assert.equal(o.padding,40);const s=lay(cap([post(1)]),o);assert(s.cards[0].w>=240);assert(s.commands.every(c=>!('w' in c)||c.w>=0));}],
 ['source metadata includes selected records only',()=>{const p=C.provenance(c,new Set(['1','3']),C.DEFAULTS);assert.equal(p.sources.length,2);assert.deepEqual(p.sources.map(v=>v.id),['1','3']);}],
 ['anonymous default removes IDs and URLs from provenance',()=>{const p=C.provenance(c,new Set(['1','3']),{...C.DEFAULTS,anonymize:true});assert.equal(p.sources.length,0);assert.equal(p.root,undefined);assert(!JSON.stringify(p).includes('alice'));}],
 ['anonymous explicit override restores sources',()=>assert.equal(C.provenance(c,new Set(['1']),{...C.DEFAULTS,anonymize:true,anonymousSources:true}).sources.length,1)],
 ['metadata opt-out removes source metadata only',()=>assert.equal(C.provenance(c,new Set(['1']),{...C.DEFAULTS,sourceMetadata:false}).sources.length,0)],
 ['CRC32 reference vector',()=>assert.equal(C.crc32(new TextEncoder().encode('123456789')),0xcbf43926)],
 ['invalid PNG rejected instead of silently outputting',()=>assert.throws(()=>C.addPngMetadata(new Uint8Array(4),C.provenance(c,new Set(['1']),C.DEFAULTS),2))],
 ['Retina dimensions are actual scaled pixels',()=>{const b=C.exportBudget(760,1200,3,false);assert.equal(b.width,2280);assert.equal(b.height,3600);assert(b.ok);}],
 ['oversize image triggers safety warning not scale change',()=>{const b=C.exportBudget(1800,30000,4,true);assert.equal(b.width,7200);assert.equal(b.height,120000);assert.equal(b.ok,false);}],
 ['graphemes keep emoji family and accents together',()=>{assert.equal(C.graphemes('👨‍👩‍👧‍👦').length,1);assert.equal(C.graphemes('e\u0301').length,1);}],
 ['layout selection/order is exact and duplicates removed',()=>{const s=lay(c,{},['3','1','3'],new Set(['1','3']));assert.deepEqual(s.cards.map(v=>v.id),['3','1']);}],
 ['fixed ratio expands and centers instead of cropping',()=>{const x=cap([post(1,'alice',undefined,'正文\n'.repeat(80))]);const a=lay(x),b=lay(x,{ratio:'1:1'});assert.equal(b.width,b.height);assert.equal(b.texts.join(),a.texts.join());assert(b.cards[0].x>a.cards[0].x);assert.equal(b.cards[0].h,a.cards[0].h);}],
 ['long Latin URL wraps and remains text',()=>{const token='https://example.com/'+('a'.repeat(500));const s=lay(cap([post(1,'alice',undefined,token)]),{width:390});const v=s.commands.filter(c=>c.type==='text').map(c=>c.text).join('');assert(v.includes(token));for(const c of s.commands.filter(c=>c.type==='text'))assert(c.x+c.width<=s.width+1);}],
 ['anonymous visual removes header names and backlinks',()=>{const s=lay(c,{anonymize:true});assert.equal(s.links.length,0);assert(!s.commands.some(c=>c.type==='text'&&c.text.includes('@alice')));}],
 ['missing media creates explicit warning',()=>{const p=post(1);p.blocks.push({kind:'media',media:{kind:'video',src:'',alt:'视频封面'}});assert(lay(cap([p])).warnings.some(w=>w.includes('视频封面')));}],
 ['context text retains quote, poll, note and link card',()=>{const p=post(1);p.quote=post(9,'other',undefined,'引用全文');p.poll={options:[{text:'方案甲',percent:67}],summary:'3票'};p.note='补充背景';p.linkCard={title:'官方说明',url:'https://example.com/'};const t=C.contextText(p);for(const s of ['引用全文','方案甲 67%','补充背景','官方说明','https://x.com/other/status/9'])assert(t.includes(s));}],
 ['embedded Article posts remain in layout text',()=>{const p=post(1);p.kind='article';p.blocks.push({kind:'embed',post:post(9,'other',undefined,'嵌入正文要保留')});assert(lay(cap([p])).commands.some(c=>c.type==='text'&&c.text==='嵌入正文要保留'));}],
 ['svg: absolute lines preserve relative geometry',()=>assert.equal(C.absolutePath('m2 3h4v5l-4 0z'),'M2 3 L6 3 L6 8 L2 8 Z')],
 ['svg: quadratic converts to cubic geometry',()=>assert.equal(C.absolutePath('M0 0 Q3 3 6 0'),'M0 0 C2 2 4 2 6 0')],
 ['svg: elliptical arc ends at the same endpoint',()=>{const p=C.absolutePath('M0 10 A10 10 0 0 1 10 0');assert(p.startsWith('M0 10 C'));assert(p.endsWith('10 0'));}],
 ['svg: implicit repeated moveto becomes lines',()=>assert.equal(C.absolutePath('M0 0 2 2 4 0z'),'M0 0 L2 2 L4 0 Z')],
 ['svg: malicious, incomplete and out-of-budget paths rejected',()=>{for(const p of ['<svg onload=evil()>','M0 0 H','M0 0 A2 2 0 9 0 2 2','M1e20 0 L0 0','M0 0 P2 2'])assert.equal(C.absolutePath(p),undefined);}],
 ['svg: computed color normalizes without CSS values',()=>{assert.equal(C.hexColor('rgb(29, 155, 240)'),'#1d9bf0');assert.equal(C.hexColor('#abc'),'#aabbcc');assert.equal(C.hexColor('url(evil)'),'#1d9bf0');}],
 ['metadata: homepage never used as a primary source',()=>{const p=post(1);p.url='https://x.com/';const v=C.provenance({...cap([p]),sourceUrl:'https://x.com/'},new Set(['1']),C.DEFAULTS);assert.equal(v.root,undefined);assert.deepEqual(v.sources,[]);}],
 ['metadata: selected permalink used when anchor excluded',()=>assert.equal(C.provenance(c,new Set(['3']),C.DEFAULTS).root,'https://x.com/bob/status/3')],
 ['metadata: quoted links are preserved and deduplicated',()=>{const p=post(1);p.quote=post(9);p.blocks.push({kind:'embed',post:post(9)});const v=C.provenance(cap([p]),new Set(['1']),C.DEFAULTS);assert.deepEqual(v.embeddedSources,['https://x.com/alice/status/9']);assert.deepEqual(C.sourceList(v),['https://x.com/alice/status/1','https://x.com/alice/status/9']);}],
 ['metadata: anonymous hides quoted as well as main URLs',()=>{const p=post(1);p.quote=post(9);const v=C.provenance(cap([p]),new Set(['1']),{...C.DEFAULTS,anonymize:true});assert.deepEqual(C.sourceList(v),[]);}],
 ['background: settings whitelist local bitmap only',()=>{for(const src of ['https://example.com/bg.jpg','data:image/svg+xml;base64,PHN2Zy8+','javascript:evil'])assert.equal(C.normalizeOptions({bgImage:src}).bgImage,'');assert.equal(C.normalizeOptions({bgImage:'data:image/png;base64,AQID'}).bgImage,'data:image/png;base64,AQID');}],
 ['background: crop and softness bounded',()=>{const o=C.normalizeOptions({bgImageX:-5,bgImageY:200,bgBlur:90,bgDim:-1});assert.equal(o.bgImageX,0);assert.equal(o.bgImageY,100);assert.equal(o.bgBlur,40);assert.equal(o.bgDim,0);}],
 ['background: scene places image before cards',()=>{const s=C.layoutCapture(cap([post(1)]),new Set(['1']),['1'],C.normalizeOptions({background:'image',bgImage:'data:image/png;base64,AQID',bgBlur:10}),new Map([['data:image/png;base64,AQID',{width:40,height:40}]]),measure);assert.equal(s.commands[1].type,'image');assert.equal(s.commands[1].blur,10);assert.equal(s.commands[1].h,s.height);}],
 ['background: image placement honors crop position',()=>{const p=C.imagePlacement({x:0,y:0,w:100,h:100,fit:'cover',positionX:100,positionY:0},{width:200,height:100});assert.deepEqual(p,{x:-100,y:0,w:200,h:100});}],
 ['quote: data enrichment preserves visible translated text',()=>{const p=post('visible-quote-1-1','unknown',undefined,'当前显示的中文翻译');p.url='';const q=C.enrichQuote(p,{id:'9',url:'https://x.com/bob/status/9',author:{name:'Bob',handle:'bob',avatar:'https://pbs.twimg.com/profile_images/bob.jpg'},fullText:'Original English'},p.capturedAt);assert.equal(C.plainText(q),'当前显示的中文翻译');assert.equal(q.author.name,'Bob');assert.equal(q.author.handle,'bob');assert.equal(q.id,'9');}],
 ['quote: incompatible post IDs are not merged',()=>{const p=post(8);assert.equal(C.enrichQuote(p,{id:'9',fullText:'Different'},p.capturedAt),p);}],
 ['quote: complete author header includes avatar and source badge',()=>{const p=post(1);p.quote=post(9,'bob');p.quote.author.avatar='avatar-fixture';p.quote.author.verified=true;p.quote.author.badge={viewBox:[0,0,22,22],paths:[{path:'M0 0 L22 0 L11 22 Z',color:'#1d9bf0'}]};const assets=new Map([['avatar-fixture',{width:40,height:40}]]);const s=C.layoutCapture(cap([p]),new Set(['1']),['1'],C.DEFAULTS,assets,measure);assert(s.commands.some(c=>c.type==='image'&&c.src==='avatar-fixture'));assert(s.commands.some(c=>c.type==='path'&&c.path==='M0 0 L22 0 L11 22 Z'&&c.viewBox[2]===22));assert(s.commands.some(c=>c.type==='text'&&c.text==='bob'&&c.color==='#0f1419'));assert(!s.commands.some(c=>c.type==='text'&&c.text==='✓'));}],
 ['quote: anonymization removes avatar and badge shapes',()=>{const p=post(1);p.quote=post(9,'bob');p.quote.author={...p.quote.author,avatar:'avatar-fixture',verified:true};const s=lay(cap([p]),{anonymize:true});assert(!s.commands.some(c=>c.type==='image'&&c.src==='avatar-fixture'));assert(!s.texts.join('').includes('bob'));assert.equal(s.links.length,0);}],
 ['quote: merge preserves avatar when next partial scan omits it',()=>{const a=post(1);a.quote=post(9,'bob');a.quote.author.avatar='avatar-fixture';const b=post(1);b.quote=post(9,'bob');assert.equal(C.mergePosts([a],[b])[0].quote.author.avatar,'avatar-fixture');}],
 ['native media: horizontal four-tile geometry not changed into grid',()=>{const p=post(1);p.blocks=[0,1,2,3].map(i=>({kind:'media',media:{kind:'image',src:'image'+i,alt:'display',display:{x:100+i*100,y:200,width:98,height:200,fit:'cover'}}}));const a=new Map(p.blocks.map(b=>[b.media.src,{width:100,height:200}]));const s=C.layoutCapture(cap([p]),new Set(['1']),['1'],C.DEFAULTS,a,measure),imgs=s.commands.filter(c=>c.type==='image');assert.equal(imgs.length,4);assert.equal(new Set(imgs.map(c=>c.y)).size,1);assert(imgs.every(c=>c.fit==='cover'));}]

];
for(const [name,fn]of tests)test(name,fn);
