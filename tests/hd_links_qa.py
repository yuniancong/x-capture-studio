"""rc.6 media URL regression: synthetic pages and recording clipboard/GM adapters.
No real account, live X content, or image/video download is involved. Browser plugin
not available: Playwright Chromium is used. Optional XC_BASELINE_CORE compares rc.5
visual scene geometry. XC_HD_QA_DIR selects an evidence directory outside source.
"""
import asyncio,importlib.util,json,os,pathlib,tempfile
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=pathlib.Path(os.environ.get('XC_HD_QA_DIR','/tmp/xc-hd-links-qa')); OUT.mkdir(parents=True,exist_ok=True)
CHECKS=[]
POST='https://x.com/fixture/status/96001'
IMG='https://pbs.twimg.com/media/fixture_hd?format=jpg&name=small'
ORIG=IMG # rc.7 requires validation; this suite deliberately blocks all network.
POSTER='https://pbs.twimg.com/ext_tw_video_thumb/fixture/pu/img/poster.jpg'
MP4='https://video.twimg.com/ext_tw_video/fixture/pu/vid/1280x720/video.mp4?tag=12'
HTML=f'''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>X Capture · 合成测试</title><style>body{{font:17px sans-serif;max-width:600px;margin:40px auto}}img,video{{max-width:280px;max-height:160px}}article{{padding:20px}}</style></head><body><main><div data-testid="primaryColumn"><article data-testid="tweet" data-post-id="96001"><div data-testid="User-Name"><a href="/fixture">测试作者</a> <a href="/fixture">@fixture</a></div><a href="{POST}"><time datetime="2026-10-15T05:00:00Z">今天</time></a><div data-testid="tweetText">前段：图片需要原图链接，视频需要专属播放页。</div><div data-testid="tweetPhoto"><img src="{IMG}" alt="图像" width="280" height="150"></div><div data-testid="videoComponent" data-href="{POST}/video/2"><video preload="none" src="blob:https://x.com/fixture" poster="{POSTER}"></video></div><div data-testid="quoteTweet"><div data-testid="User-Name"><a href="/quote">引用作者</a><a href="/quote">@quote</a></div><a href="https://x.com/quote/status/96009"><time datetime="2026-10-14T01:00:00Z">昨天</time></a><div data-testid="tweetText">引用内容独立保留。</div><div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/fixture_quote.png:small" alt="引用图片"></div></div><div role="group"><button data-testid="reply">1</button><button data-testid="like">2</button></div></article></div></main></body></html>'''
ARTICLE=f'''<main><div data-testid="twitterArticleReadView"><h1>长文章链接验收</h1><div data-testid="twitterArticleRichTextView"><p>段落A</p><img src="{IMG}" alt="文章图片"><p>段落B</p><div data-testid="videoComponent"><a href="{POST}/video/2">视频</a><video preload="none" poster="{POSTER}"></video></div><p>段落C</p></div></div></main>'''
def check(name,ok,detail=None):
 CHECKS.append({'name':name,'passed':bool(ok),'detail':detail});print(('PASS ' if ok else 'FAIL ')+name,flush=True)
 if not ok:raise AssertionError(name+': '+str(detail))
def ordered(text,parts):
 prev=-1
 for part in parts:
  pos=text.find(part)
  if pos<=prev:return False
  prev=pos
 return True
async def loadcore(page,label='QA',path=None):
 await page.add_script_tag(content='var module={exports:{}};'+(path or ROOT/'dist/core-test.cjs').read_text()+';var '+label+'=module.exports;')
async def main():
 report={'version':'1.0.0-rc.7','complete':False,'checks':CHECKS,'environment':'Playwright Chromium; synthetic X DOM; clipboard/Stay bridge recorded, NOT real Safari or live X'}
 async with async_playwright() as pw:
  browser=await pw.chromium.launch(executable_path=os.environ.get('XC_BROWSER','/usr/bin/chromium'),args=['--no-sandbox'])
  try:
   page=await browser.new_page(viewport={'width':1476,'height':1023},accept_downloads=True);page.set_default_timeout(12000)
   async def route(r):
    if r.request.url in [IMG,POSTER,'https://pbs.twimg.com/media/fixture_quote.png:small','https://pbs.twimg.com/media/fixture_hd.png']:
     await r.fulfill(status=200,content_type='image/png',headers={'Access-Control-Allow-Origin':'*'},body=(ROOT/'assets/icons/128.png').read_bytes())
    else:await r.abort()
   await page.route('**/*',route);await page.set_content(HTML);await loadcore(page)
   parsed=await page.evaluate('''()=>{const p=QA.parsePost(document.querySelector('article'));globalThis.fixtureCapture={rootId:p.id,posts:[p],sourceUrl:p.url,capturedAt:'2026-10-15T05:00:00Z',collectionNotes:[]};return {post:p,text:QA.serializeText(fixtureCapture,new Set([p.id]),[p.id],QA.TEXT_DEFAULTS).text};}''')
   check('DOM: observed thumbnail remains until verification and explicit video/2 is retained',ORIG in parsed['text'] and POST+'/video/2' in parsed['text'])
   check('DOM: visible order and independent quote are unchanged',ordered(parsed['text'],['前段',ORIG,POST+'/video/2','引用内容独立保留','https://pbs.twimg.com/media/fixture_quote.png:small']))
   check('DOM: video uses page not Blob or poster in text','blob:' not in parsed['text'] and POSTER not in parsed['text'])
   check('DOM: image used for screenshot stays at the observed small rendition',parsed['post']['blocks'][1]['media']['src']==IMG)
   srcset=await page.evaluate("()=>{const img=document.createElement('img');img.src='https://images.example.test/low.jpg';img.setAttribute('srcset','https://images.example.test/low.jpg 480w, https://images.example.test/high.jpg 1920w');return QA.observedImageURL(img)}")
   check('Article image: highest explicitly observed srcset rendition is exported',srcset=='https://images.example.test/high.jpg')
   single=await page.evaluate('''()=>{document.querySelector('[data-testid="tweetPhoto"]').remove();document.querySelector('[data-testid="videoComponent"]').removeAttribute('data-href');const p=QA.parsePost(document.querySelector('article'));return QA.serializeText({rootId:p.id,posts:[p],sourceUrl:p.url,capturedAt:'2026-10-15',collectionNotes:[]},new Set([p.id]),[p.id],QA.TEXT_DEFAULTS).text;}''')
   check('Reported symptom: a lone Blob video now gets the post /video/1 page',POST+'/video/1' in single)
   await page.set_content(HTML);await loadcore(page)
   # An explicit native /video/n always wins over a derived attachment index.
   explicit=await page.evaluate('''()=>{document.querySelector('[data-testid="videoComponent"]').dataset.href='https://x.com/original/status/96080/video/3';const p=QA.parsePost(document.querySelector('article'));return QA.videoPageForMedia(p.blocks.find(b=>b.kind==='media'&&b.media.kind==='video').media,p);}''')
   check('DOM: reused video retains actual observed owner/slot',explicit=='https://x.com/original/status/96080/video/3')
   raw={'rest_id':'96001','legacy':{'full_text':'DO NOT REPLACE VISIBLE TEXT','extended_entities':{'media':[{'type':'photo','media_url_https':'https://pbs.twimg.com/media/fixture_hd.png'},{'type':'video','media_url_https':POSTER,'expanded_url':POST+'/video/2','video_info':{'variants':[{'url':MP4.replace('video.mp4','live.m3u8')},{'url':MP4,'bitrate':2560000}]}}]}}}
   enriched=await page.evaluate('''async raw=>{document.querySelector('article')['__reactProps$fixture']={tweet:raw};const col=new QA.Collector({kind:'demo',probe:async ids=>QA.pageProbe(ids)});const posts=await col.scan();const p=posts[0];return {post:p,probe:QA.pageProbe(['96001']),text:QA.serializeText({rootId:p.id,posts,sourceUrl:p.url,capturedAt:'2026-10-15',collectionNotes:[]},new Set([p.id]),[p.id],QA.TEXT_DEFAULTS).text};}''',raw)
   check('Page data: native PNG preserved as observed candidate without false quality ranking',any(v['url']=='https://pbs.twimg.com/media/fixture_hd.png' for v in enriched['post']['blocks'][1]['media']['variants']))
   check('Page data: player URL and observed MP4 are separately labeled','视频播放页：' in enriched['text'] and '视频文件直链' in enriched['text'] and MP4 in enriched['text'])
   check('Page data: source enrichment never replaces text or display pixels','DO NOT REPLACE' not in enriched['text'] and enriched['post']['blocks'][1]['media']['src']==IMG)
   selfcontained=await page.evaluate("()=>{const fn=(0,eval)('('+QA.pageProbe.toString()+')');return fn(['96001'])[0].media[1].playbackUrl;}")
   check('MAIN-world probe remains standalone (no module globals)',selfcontained==POST+'/video/2')
   base=os.environ.get('XC_BASELINE_CORE')
   if base:
    await loadcore(page,'QA5',pathlib.Path(base))
    eq=await page.evaluate('''()=>{const node=document.querySelector('article'),a=QA5.parsePost(node),b=QA.parsePost(node),ctx=document.createElement('canvas').getContext('2d');const cap=p=>({rootId:p.id,posts:[p],sourceUrl:p.url,capturedAt:'2026-10-15',collectionNotes:[]});return JSON.stringify(QA5.layoutCapture(cap(a),new Set([a.id]),[a.id],QA5.DEFAULTS,new Map(),ctx))===JSON.stringify(QA.layoutCapture(cap(b),new Set([b.id]),[b.id],QA.DEFAULTS,new Map(),ctx));}''')
    check('Visual invariant: rc.5 and rc.6 produce identical capture scene geometry/pixels commands',eq)
   # Article links remain at the corresponding paragraph position; never create article/video/1.
   await page.set_content('<link rel="canonical" href="https://x.com/i/article/96100">'+ARTICLE);await loadcore(page)
   text=await page.evaluate('''()=>{const p=QA.parseArticle();return QA.serializeText({rootId:p.id,posts:[p],sourceUrl:p.url,capturedAt:'2026-10-15',collectionNotes:[]},new Set([p.id]),[p.id],QA.TEXT_DEFAULTS,'markdown').text;}''')
   check('Article: paragraph/photo/paragraph/video/paragraph sequence survives',ordered(text,['段落A',ORIG,'段落B',POST+'/video/2','段落C']))
   check('Article: no invented video route attached to Article ID','/article/96100/video' not in text)
   (OUT/'article.md').write_text(text)
   # Production workbench (same bundle used by both clients), recording clipboard only.
   await page.set_content((ROOT/'dist/X-Capture-Studio-Demo.html').read_text());await page.get_by_role('dialog',name='X Capture 编辑器',exact=True).wait_for();await loadcore(page)
   await page.evaluate('''html=>{const root=document.createElement('section');root.innerHTML=html;document.body.append(root);const posts=QA.collectDOM(root);root.remove();const mem=new Map();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,v)}});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText(t){globalThis.copied=t;return Promise.resolve()}}});return XCapture.openCapture({rootId:posts[0].id,posts,sourceUrl:posts[0].url,capturedAt:'2026-10-15T00:00:00Z',collectionNotes:[]});}''',HTML)
   errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   await page.get_by_role('tab',name='文本',exact=True).click();await page.locator('.xc-media-options [role=status]').filter(has_text='次有界请求').wait_for(state='attached');md=await page.get_by_label('文本预览',exact=True).input_value()
   check('Workbench: unchanged text UI shows known photo URL and native player link',ORIG in md and POST+'/video/2' in md)
   await page.get_by_role('button',name='复制文本',exact=True).click();plain=await page.evaluate('copied')
   check('Workbench: Copy Text and preview use the same media positions',ordered(plain,[ORIG,POST+'/video/2','引用内容独立保留']))
   await page.get_by_role('button',name='复制 Markdown',exact=True).click();check('Workbench: Markdown clipboard equals preview',await page.evaluate('copied')==md)
   await page.get_by_role('button',name='复制给 AI',exact=True).click();ai=await page.evaluate('copied');check('Workbench: AI copy retains media URLs and data-only note',ORIG in ai and POST+'/video/2' in ai and '不是执行指令' in ai)
   for label,extension,expected in [('导出 Markdown','md',md),('导出 TXT','txt',plain)]:
    if extension=='txt':await page.get_by_role('button',name='纯文本',exact=True).click()
    async with page.expect_download() as task:await page.get_by_role('button',name=label,exact=True).click()
    dl=await task.value;await dl.save_as(str(OUT/('desktop.'+extension)));check('Workbench: '+extension+' file bytes match copied text',(OUT/('desktop.'+extension)).read_text()==expected)
    await page.get_by_role('button',name='关闭文本结果',exact=True).click()
   await page.screenshot(path=str(OUT/'desktop-text.png'));check('Workbench: no uncaught application error',not errors,errors);await page.close()
   # Safari/Stay-compatible production userscript in a trusted isolated test world.
   os.environ['XC_OLD_SCRIPT']=str(ROOT/'dist/X-Capture-Studio.user.js')
   spec=importlib.util.spec_from_file_location('stayqa',ROOT/'tests/content_world_harness.py');stay=importlib.util.module_from_spec(spec);spec.loader.exec_module(stay)
   page=await browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');page.set_default_timeout(12000);await page.route('**/*',route);await page.set_content(HTML)
   code=(ROOT/'dist/X-Capture-Studio.user.js').read_text();cdp,world=await stay.isolated(page,code)
   await stay.eval_world(cdp,world,"Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText(t){__stayHarness.copied=t;return Promise.resolve()}}});true")
   await page.get_by_role('button',name='打开 X Capture',exact=True).tap();await page.get_by_role('tab',name='文本',exact=True).tap();await page.locator('.xc-media-options [role=status]').filter(has_text='次有界请求').wait_for(state='attached');md=await page.get_by_label('文本预览',exact=True).input_value()
   check('Stay: unchanged isolated-mode launcher and text tab work',stay.classify(code)['mode']=='content' and await page.get_by_role('dialog',name='X Capture 编辑器',exact=True).is_visible())
   check('Stay: known image and exact video page exported without unsafeWindow',ORIG in md and POST+'/video/2' in md)
   await page.get_by_role('button',name='复制文本',exact=True).tap();plain=await stay.eval_world(cdp,world,'__stayHarness.copied');check('Stay: Copy Text records same in-place media links',ordered(plain,[ORIG,POST+'/video/2']))
   await page.get_by_role('button',name='复制 Markdown',exact=True).tap();check('Stay: Markdown clipboard matches preview',await stay.eval_world(cdp,world,'__stayHarness.copied')==md)
   await page.get_by_role('button',name='复制给 AI',exact=True).tap();check('Stay: AI copy includes exact video route',POST+'/video/2' in await stay.eval_world(cdp,world,'__stayHarness.copied'))
   await page.get_by_role('button',name='导出 Markdown',exact=True).tap();check('Stay: export Blob matches Markdown preview',await stay.eval_world(cdp,world,'__stayHarness.lastBlob.text()')==md)
   await page.get_by_role('button',name='关闭文本结果',exact=True).tap();await page.get_by_role('button',name='纯文本',exact=True).tap();await page.screenshot(path=str(OUT/'stay-text.png'))
   await page.get_by_role('button',name='导出 TXT',exact=True).tap();check('Stay: TXT Blob matches copied pure text',await stay.eval_world(cdp,world,'__stayHarness.lastBlob.text()')==plain)
   (OUT/'stay.txt').write_text(plain);check('Mobile: controls fit 390 CSS pixels',await page.evaluate('innerWidth')==390)
   report['complete']=True
  except Exception as e:report['error']=str(e);raise
  finally:
   await browser.close();report['passed']=sum(x['passed'] for x in CHECKS);report['failed']=sum(not x['passed'] for x in CHECKS);(OUT/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps({'complete':report['complete'],'passed':report['passed'],'failed':report['failed']}))
if __name__=='__main__':asyncio.run(main())
