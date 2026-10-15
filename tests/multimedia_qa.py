"""rc.7 media discovery/inspection/copy/download UI contract tests.

Production Chromium bundle with a recording runtime bridge; production Stay bundle
in a CDP isolated world with lexical GM stubs. Native resource request logic and
image decoding are real; HTTP is an explicit deterministic fixture adapter.
NOT live X, native Safari, installed Stay, or actual system clipboard testing.
"""
import asyncio, base64, io, json, os, pathlib, importlib.util
from PIL import Image, ImageDraw
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=pathlib.Path(os.environ.get('XC_MM_QA_DIR','/tmp/xc-media-rc7'));OUT.mkdir(parents=True,exist_ok=True)
ROWS=[]
POST='https://x.com/capture_test/status/97001'
IMAGE='https://pbs.twimg.com/media/fixture_mm.png?format=png&name=small'
HLS='https://video.twimg.com/mm/master.m3u8'
MPD='https://video.twimg.com/mm/manifest.mpd'
MP4='https://video.twimg.com/mm/movie.mp4'
def check(name,ok,detail=None):
 ROWS.append({'name':name,'passed':bool(ok),'detail':detail});print(('PASS ' if ok else 'FAIL ')+name,flush=True)
 if not ok:raise AssertionError(name+': '+str(detail))
def ordered(text,parts):
 last=-1
 for s in parts:
  i=text.find(s)
  if i<=last:return False
  last=i
 return True
photo=Image.new('RGB',(640,360),'#dceaf0');draw=ImageDraw.Draw(photo)
for i in range(6):draw.rounded_rectangle((22+i*102,38,107+i*102,322),12,fill=['#112233','#186a8d','#d6cabc','#6e748b','#ccd8e3','#347d77'][i])
b=io.BytesIO();photo.save(b,format='PNG');PNG=base64.b64encode(b.getvalue()).decode()
HTML=f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>多媒体回归 · 虚构测试页面</title>
<style>body{{margin:0;background:#f3f6fa;font:16px Arial,sans-serif}}header{{padding:15px;color:#475569}}article{{background:white;max-width:650px;padding:22px;margin:14px auto;border:1px solid #ddd;border-radius:14px}}img,video{{max-width:100%;height:auto}}[data-testid="User-Name"]{{display:flex;gap:8px}}a{{color:inherit}}[role=group]{{display:flex;gap:35px;margin-top:18px}}[role=group]button{{border:0;background:none;padding:10px}}</style></head><body>
<header>本地合成页面 · 不是真实 X 或 iPhone 截图</header><main><div data-testid="primaryColumn"><article data-testid="tweet" data-post-id="97001">
<div data-testid="User-Name"><a href="https://x.com/capture_test">示例作者</a><a href="https://x.com/capture_test">@capture_test</a></div><a href="{POST}"><time datetime="2026-10-15T08:00:00Z">10月15日</time></a>
<div data-testid="tweetText"><p>原文第一段：高清图片不可用时应自动降级。</p><img src="{IMAGE}" alt="测试图片" width="640" height="360"><p>原文第二段：同时保留文件、播放流及字幕。</p>
<video preload="none" poster="https://pbs.twimg.com/media/video_poster.png" data-href="{POST}/video/2"><source src="{MP4}" type="video/mp4"><source src="{HLS}" type="application/vnd.apple.mpegurl"><source src="{MPD}" type="application/dash+xml"><track src="https://video.twimg.com/mm/sub/zh.vtt" srclang="zh-Hans" label="中文" kind="subtitles"></video><p>原文最后一段：位置与顺序保持不变。</p></div>
<div role="group"><button data-testid="reply">1</button><button data-testid="retweet">2</button><button data-testid="like">3</button></div></article></div></main></body></html>'''
MASTER='''#EXTM3U
#EXT-X-VERSION:7
#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="sub",NAME="English",LANGUAGE="en",DEFAULT=YES,URI="sub/en.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English audio",LANGUAGE="en",DEFAULT=YES,URI="audio/main.m3u8"
#EXT-X-MEDIA:TYPE=CLOSED-CAPTIONS,GROUP-ID="cc",NAME="Captions",LANGUAGE="en",INSTREAM-ID="CC1"
#EXT-X-STREAM-INF:BANDWIDTH=4000000,AVERAGE-BANDWIDTH=3600000,RESOLUTION=1920x1080,CODECS="avc1.640028,mp4a.40.2",FRAME-RATE=30,AUDIO="audio",SUBTITLES="sub",CLOSED-CAPTIONS="cc"
1080/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1200000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2",AUDIO="audio",SUBTITLES="sub"
720/index.m3u8
'''
DASH='''<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static"><Period id="p1"><AdaptationSet contentType="video" mimeType="video/mp4" codecs="avc1.640028"><SegmentTemplate media="$RepresentationID$/$Number$.m4s" initialization="$RepresentationID$/init.mp4" duration="4"/><Representation id="dash1080" bandwidth="3500000" width="1920" height="1080"/></AdaptationSet><AdaptationSet contentType="text" mimeType="application/ttml+xml" lang="zh"><Role value="main"/><Representation id="zhsub" codecs="stpp.ttml.im1t"><BaseURL>sub/zh.ttml</BaseURL></Representation></AdaptationSet></Period></MPD>'''
CHILD='#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nseg-1.ts\n#EXT-X-ENDLIST'
SUB='#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nseg-1.vtt\n#EXT-X-ENDLIST'
# Pure boundary adapter, deliberately omits network access. All other code is production.
PRELUDE='''globalThis.__mm={requests:[],copied:'',blobs:[],mem:new Map(),shares:[]};
const __body=Uint8Array.from(atob(__PNG_JSON__),c=>c.charCodeAt(0));
globalThis.fetch=async function(input,options={}){
 const url=String(input),u=new URL(url);__mm.requests.push({url,method:options.method||'GET',credentials:options.credentials,redirect:options.redirect,referrer:options.referrerPolicy});
 if(options.signal?.aborted)throw new DOMException('cancelled','AbortError');
 if(u.hostname==='pbs.twimg.com'){
  if(u.pathname.includes('fixture_mm')&&['orig','4096x4096'].includes(u.searchParams.get('name')))return new Response('not available',{status:404});
  return new Response(__body.slice(),{status:200,headers:{'Content-Type':'image/png'}});
 }
 if(u.pathname==='/mm/master.m3u8')return new Response(__MASTER_JSON__,{headers:{'Content-Type':'application/vnd.apple.mpegurl'}});
 if(u.pathname==='/mm/manifest.mpd')return new Response(__MPD_JSON__,{headers:{'Content-Type':'application/dash+xml'}});
 if(u.pathname.endsWith('.m3u8'))return new Response(u.pathname.includes('/sub/')?__SUB_JSON__:__CHILD_JSON__,{headers:{'Content-Type':'application/vnd.apple.mpegurl'}});
 if(u.pathname.endsWith('.mp4'))return options.method==='HEAD'?new Response(null,{status:405}):new Response(new Uint8Array([0]),{status:206,headers:{'Content-Type':'video/mp4'}});
 return new Response('not found',{status:404});
};
const __createURL=URL.createObjectURL.bind(URL);URL.createObjectURL=b=>{__mm.blobs.push(b);return __createURL(b);};
Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:t=>{__mm.copied=t;return Promise.resolve()},write:async items=>{__mm.copied=await (await items[0].getType('text/plain')).text()}}});
Object.defineProperty(globalThis,'ClipboardItem',{configurable:true,value:class {constructor(data){this.data=data}async getType(k){return await this.data[k]}}});
'''.replace('__PNG_JSON__',json.dumps(PNG)).replace('__MASTER_JSON__',json.dumps(MASTER)).replace('__MPD_JSON__',json.dumps(DASH)).replace('__CHILD_JSON__',json.dumps(CHILD)).replace('__SUB_JSON__',json.dumps(SUB))
CHROME='''globalThis.chrome={storage:{local:{get:async k=>({[k]:__mm.mem.get(k)}),set:async o=>{for(const[k,v]of Object.entries(o))__mm.mem.set(k,v)}}},runtime:{onMessage:{addListener(){}},sendMessage:async m=>{
 if(m.type==='xc:probe')return {ok:true,data:[]};
 if(m.type==='xc:resource-cancel')return {ok:true};
 if(m.type==='xc:resource'){const r=await QA.nativeResource(m.request);let bin='';for(const x of r.bytes)bin+=String.fromCharCode(x);return {ok:true,response:{...r,bytes:undefined},data:btoa(bin)};}
 if(m.type==='xc:asset'){const r=await fetch(m.url,{credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});if(!r.ok)return {ok:false,error:'fixture asset error'};let bin='';for(const x of new Uint8Array(await r.arrayBuffer()))bin+=String.fromCharCode(x);return {ok:true,data:btoa(bin)};}
 return {ok:false};
}}};'''
async def core(page):
 await page.add_script_tag(content='globalThis.module={exports:{}};'+(ROOT/'dist/core-test.cjs').read_text()+';globalThis.QA=module.exports;delete globalThis.module;')
async def eval_world(cdp,world,code):
 result=await cdp.send('Runtime.evaluate',{'expression':code,'contextId':world,'returnByValue':True,'awaitPromise':True})
 if 'exceptionDetails' in result:raise RuntimeError(str(result['exceptionDetails']))
 return result.get('result',{}).get('value')
async def dom_cases(browser):
 page=await browser.new_page();await page.route('**/*',lambda r:r.abort());await page.set_content(HTML);await core(page)
 parsed=await page.evaluate('''()=>{const p=QA.parsePost(document.querySelector('article'));return {post:p,text:QA.serializeText({rootId:p.id,posts:[p],sourceUrl:p.url,capturedAt:'2026-10-15',collectionNotes:[]},new Set([p.id]),[p.id],QA.TEXT_DEFAULTS).text}}''')
 b=parsed['post']['blocks'];check('DOM: actual inline text/image/text/video/text block order',[x['kind'] for x in b]==['text','media','text','media','text'])
 check('DOM: all source elements retained without choosing just MP4',set(v['kind'] for v in b[3]['media']['variants'])=={'file','hls','dash'})
 check('DOM: track language, resource and own video association',b[3]['media']['tracks'][0]['language']=='zh-Hans' and b[3]['media']['tracks'][0]['url'].endswith('/zh.vtt'))
 check('DOM: display-sized HTML attributes not used as proven original pixels',all('width' not in v for v in b[1]['media']['variants']))
 check('DOM: no generated orig address is claimed before validation','name=orig' not in parsed['text'])
 # API-v2 shape requires exact attached media-key membership; independent probe is serialized as Chrome MAIN does.
 raw={'id':'97001','attachments':{'media_keys':['3_good']},'includes':{'media':[{'media_key':'3_good','type':'video','preview_image_url':'https://pbs.twimg.com/media/video_poster.png','variants':[{'url':MP4,'content_type':'video/mp4','bit_rate':3000000},{'url':HLS,'content_type':'application/x-mpegURL'},{'url':MPD,'content_type':'application/dash+xml'}]},{'media_key':'3_other','type':'video','preview_image_url':'https://pbs.twimg.com/media/other.jpg','variants':[{'url':'https://video.twimg.com/other.mp4','content_type':'video/mp4'}]}]}}
 data=await page.evaluate('''raw=>{document.querySelector('article')['__reactProps$qa']={raw};const fn=(0,eval)('('+QA.pageProbe.toString()+')');return fn(['97001']);}''',raw)
 check('Probe: standalone MAIN-world function recognizes v2 id and explicit media keys',len(data)==1 and len(data[0]['media'])==1)
 check('Probe: all video formats and bit_rate retained',len(data[0]['media'][0]['variants'])==3 and data[0]['media'][0]['variants'][0]['bitrate']==3000000)
 check('Probe: unattached other media cannot contaminate post','other.mp4' not in json.dumps(data))
 enhanced=await page.evaluate('''async()=>{const c=new QA.Collector({kind:'demo',probe:async ids=>QA.pageProbe(ids)});const p=(await c.scan())[0];return p.blocks.filter(b=>b.kind==='media').map(b=>b.media);}''')
 check('Collector: repeated resource observations merge rather than replace HLS',any(v['kind']=='hls' for v in enhanced[1]['variants']) and any(v['kind']=='file' for v in enhanced[1]['variants']))
 # Article paragraph has inline image and video. Keep surrounding text, cover and separate video slots.
 article=f'''<link rel="canonical" href="https://x.com/i/article/97999"><main data-testid="twitterArticleReadView"><h1>合成文章</h1><div data-testid="twitterArticleCoverImage"><img src="https://pbs.twimg.com/media/cover.png"></div><div data-testid="twitterArticleRichTextView"><p>文章 A<img src="{IMAGE}" alt="插图">文章 B<video poster="https://pbs.twimg.com/media/a.png"><source src="{HLS}" type="application/vnd.apple.mpegurl"></video>文章 C</p><p>文章 D<video poster="https://pbs.twimg.com/media/b.png"><source src="{MPD}" type="application/dash+xml"></video>文章 E</p></div></main>'''
 await page.set_content(article);await core(page)
 pa=await page.evaluate('''()=>{const p=QA.parseArticle();return {p,t:QA.serializeText({rootId:p.id,posts:[p],sourceUrl:p.url,capturedAt:'2026-10-15',collectionNotes:[]},new Set([p.id]),[p.id],QA.TEXT_DEFAULTS).text};}''')
 check('Article: cover role distinct from body image',pa['p']['blocks'][0]['media']['mediaRole']=='cover')
 check('Article: multiple videos stay between correct surrounding paragraphs',ordered(pa['t'],['文章 A',IMAGE,'文章 B',HLS,'文章 C','文章 D',MPD,'文章 E']))
 check('Article: no invented /article/id/video/1','/article/97999/video' not in pa['t'])
 # Visible card with a corresponding structured VMAP address, no hidden ad trackers.
 cardhtml='''<article data-testid="tweet"><div data-testid="User-Name"><a href="https://x.com/card_test">Card author</a><a href="https://x.com/card_test">@card_test</a></div><a href="https://x.com/card_test/status/97002"><time datetime="2026-10-15T00:00:00Z">Today</time></a><div data-testid="tweetText">Card before</div><a href="https://example.com/video"><div data-testid="card.wrapper">Card title<img src="https://pbs.twimg.com/media/card.png"></div></a></article>'''
 await page.set_content(cardhtml);await core(page)
 c=await page.evaluate('''async()=>{document.querySelector('article')['__reactProps$qa']={tweet:{rest_id:'97002',legacy:{full_text:'Card before'},card:{legacy:{binding_values:[{key:'amplify_url_vmap',value:{string_value:'https://video.twimg.com/amplify_video/test/vmap.xml'}},{key:'player_image',value:{image_value:{url:'https://pbs.twimg.com/media/card.png'}}}]}}}};const p=(await new QA.Collector({kind:'demo',probe:async ids=>QA.pageProbe(ids)}).scan())[0];return {m:p.linkCard?.media,t:QA.serializeText({rootId:p.id,posts:[p],sourceUrl:p.url,capturedAt:'2026-10-15',collectionNotes:[]},new Set([p.id]),[p.id],QA.TEXT_DEFAULTS).text};}''')
 check('Card: visible poster associates VMAP resources without loading ads',c['m']['kind']=='video' and any(v['kind']=='vmap' for v in c['m']['variants']))
 check('Card: text presents VMAP as media description, not a complete video','VMAP 媒体描述' in c['t'] and 'vmap.xml' in c['t'])
 await page.close()
async def mode(browser,kind):
 mobile=kind=='Stay';ctx=await browser.new_context(viewport={'width':390 if mobile else 1476,'height':844 if mobile else 1023},is_mobile=mobile,has_touch=mobile,accept_downloads=True)
 await ctx.route('**/*',lambda r:r.abort());page=await ctx.new_page();page.set_default_timeout(20000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)));await page.set_content(HTML)
 cdp=await ctx.new_cdp_session(page);frame=(await cdp.send('Page.getFrameTree'))['frameTree']['frame']['id'];world=(await cdp.send('Page.createIsolatedWorld',{'frameId':frame,'worldName':kind+'-isolated-fixture'}))['executionContextId']
 corejs='globalThis.module={exports:{}};'+(ROOT/'dist/core-test.cjs').read_text()+';globalThis.QA=module.exports;delete globalThis.module;'
 if mobile:
  spec=importlib.util.spec_from_file_location('stayh',ROOT/'tests/content_world_harness.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
  code=(ROOT/'dist/X-Capture-Studio.user.js').read_text();check('Stay: production artifact remains isolated with no unsafeWindow',mod.classify(code)['mode']=='content')
  await eval_world(cdp,world,corejs);await eval_world(cdp,world,mod.wrap(PRELUDE+'\n'+code))
 else:
  await eval_world(cdp,world,corejs);await eval_world(cdp,world,PRELUDE+'\n'+CHROME+'\n'+(ROOT/'dist/extension/content.js').read_text())
 await page.get_by_role('button',name='打开 X Capture',exact=True).click();await page.get_by_role('dialog',name='X Capture 编辑器',exact=True).wait_for()
 await page.get_by_role('tab',name='文本',exact=True).click()
 # Ensure real PNG decoding and bounded fallback finished, not a timed sleep guessing success.
 await page.get_by_text('媒体资源与高清检查',exact=True).click()
 await page.locator('.xc-media-options [role=status]').filter(has_text='次有界请求').wait_for()
 text=await page.get_by_label('文本预览',exact=True).input_value();large='https://pbs.twimg.com/media/fixture_mm?format=png&name=large'
 (OUT/(kind.lower()+'-initial.txt')).write_text(text)
 (OUT/(kind.lower()+'-requests.json')).write_text(json.dumps(await eval_world(cdp,world,'__mm.requests'),indent=2))
 check(kind+': real production editor finishes validated image fallback',large in text and 'name=orig' not in text)
 check(kind+': MP4 and HLS and DASH coexist in default copy',all(u in text for u in [MP4,HLS,MPD]))
 check(kind+': HTML, HLS and DASH subtitles all belong to inline video',all(s in text for s in ['zh-Hans','en.m3u8','CEA-608','zh.ttml']))
 check(kind+': inline positions preserved after asynchronous media verification',ordered(text,['原文第一段',large,'原文第二段',HLS,'原文最后一段']))
 requests=await eval_world(cdp,world,'__mm.requests')
 urls=[v['url'] for v in requests]
 check(kind+': actual request history confirms orig then 4096 then large',urls.index('https://pbs.twimg.com/media/fixture_mm?format=png&name=orig')<urls.index('https://pbs.twimg.com/media/fixture_mm?format=png&name=4096x4096')<urls.index(large))
 check(kind+': no segment, initialization or encryption-key request',not any(u.endswith(('.ts','.m4s','.key')) or 'init.mp4' in u for u in urls))
 check(kind+': resource fetch omits credentials and blocks redirects',all(v['credentials']=='omit' and v['redirect']=='error' and v['referrer']=='no-referrer' for v in requests))
 check(kind+': direct video headers HEAD fallback GET implemented',{'HEAD','GET'}<={v['method'] for v in requests if v['url']==MP4})
 await page.get_by_text('媒体资源与高清检查',exact=True).click()
 await page.get_by_role('button',name='复制 Markdown',exact=True).click();copied=await eval_world(cdp,world,'__mm.copied');check(kind+': Markdown clipboard receives exact resolved preview',copied==text)
 await page.get_by_role('button',name='复制给 AI',exact=True).click();copied=await eval_world(cdp,world,'__mm.copied');check(kind+': AI copy retains all formats and data-only safety note',all(s in copied for s in [HLS,MPD,large,'不是执行指令']))
 await page.get_by_role('button',name='纯文本',exact=True).click();plain=await page.get_by_label('文本预览',exact=True).input_value();await page.get_by_role('button',name='复制纯文本',exact=True).click();check(kind+': TXT copy exact with no Markdown substitution',plain==await eval_world(cdp,world,'__mm.copied'))
 for label,ext,expected in [('导出 TXT','txt',plain),('导出 Markdown','md',text)]:
  if ext=='md':await page.get_by_role('button',name='Markdown',exact=True).click()
  if mobile:
   await page.get_by_role('button',name=label,exact=True).click()
   async with page.expect_download() as task:await page.get_by_role('link',name='保存 '+ext.upper()+' 文件',exact=True).click()
  else:
   async with page.expect_download() as task:await page.get_by_role('button',name=label,exact=True).click()
  download=await task.value;target=OUT/(kind.lower()+'.'+ext);await download.save_as(str(target));check(kind+': actual '+ext+' file roundtrip matches preview',target.read_text()==expected)
  await page.get_by_role('button',name='关闭文本结果',exact=True).click()
 await page.get_by_text('媒体资源与高清检查',exact=True).click()
 await page.get_by_role('checkbox',name='完整资源：全部质量、音轨和验证状态',exact=True).check()
 full=await page.get_by_label('文本预览',exact=True).input_value();check(kind+': full resources exposes resolutions, audio groups, verification status','1920×1080' in full and '音轨' in full and '清单已解析' in full and '720/index.m3u8' in full)
 await page.get_by_role('checkbox',name='Markdown 使用可嵌入图片语法',exact=True).check();check(kind+': optional Markdown embedding uses actual selected large image','![测试图片]' in await page.get_by_label('文本预览',exact=True).input_value())
 await page.get_by_role('checkbox',name='Markdown 使用可嵌入图片语法',exact=True).uncheck()
 async def refuse(d):await d.dismiss()
 page.on('dialog',refuse)
 await page.get_by_role('checkbox',name='允许完整受限/签名链接（仅本人使用）',exact=True).click();check(kind+': cancelling sensitive link consent resets control',not await page.get_by_role('checkbox',name='允许完整受限/签名链接（仅本人使用）',exact=True).is_checked());page.remove_listener('dialog',refuse)
 await page.get_by_text('媒体资源与高清检查',exact=True).click();await page.get_by_label('文本预览',exact=True).scroll_into_view_if_needed()
 await page.screenshot(path=str(OUT/(kind.lower()+'-text.png')))
 check(kind+': no page horizontal overflow',await page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
 await page.get_by_role('tab',name='外观',exact=True).click();await page.get_by_role('checkbox',name='隐藏作者身份',exact=True).check();await page.get_by_role('tab',name='文本',exact=True).click()
 anonymous=await page.get_by_label('文本预览',exact=True).input_value();check(kind+': anonymity removes every media/player/subtitle URL','https://' not in anonymous and '匿名用户' in anonymous)
 check(kind+': no uncaught production errors in tested interactions',not errors,errors)
 await ctx.close()
async def main():
 report={'version':'1.0.0-rc.7','checks':ROWS,'environment':'Playwright Chromium; production bundles, recording native/resource runtime and clipboard boundary adapters; no Safari/Stay native or live X claims','complete':False}
 try:
  async with async_playwright() as pw:
   browser=await pw.chromium.launch(executable_path=os.environ.get('XC_BROWSER','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
   try:await dom_cases(browser);await mode(browser,'Chromium');await mode(browser,'Stay')
   finally:await browser.close()
  report['complete']=True
 except Exception as e:report['error']=str(e);raise
 finally:
  report['passed']=sum(r['passed'] for r in ROWS);report['failed']=sum(not r['passed'] for r in ROWS);(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps({k:report[k] for k in ['complete','passed','failed']}),flush=True)
if __name__=='__main__':asyncio.run(main())
