"""Logged-out desktop X markup (observed 2026-10-16) — offline fixture QA.

tests/logged-out-fixtures.html mirrors the real Tailwind markup and the Relay
hook-snapshot shape; it is served at a synthetic x.com URL by route
interception. No live X navigation, account, cookie or network request.

  XC_BROWSER=/path/to/chromium python tests/logged_out_qa.py
"""
import os, asyncio, json, pathlib, importlib.util
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
BROWSER=os.environ.get('XC_BROWSER','/usr/bin/chromium')
URL='https://x.com/logged_out_author/status/91001'
VB='https://video.twimg.com/amplify_video/7710000000000000001'
checks=[]
def check(name,passed,detail=None):
    checks.append({'name':name,'passed':bool(passed),'detail':detail})
    print(('PASS ' if passed else 'FAIL ')+name,'' if detail is None else detail)
    if not passed: raise AssertionError(name+': '+str(detail))
def text(p): return '|'.join(''.join(r['text'] for r in b['runs']) for b in p['blocks'] if b['kind']=='text')
def media(p): return [b['media'] for b in p['blocks'] if b['kind']=='media']
async def open_fixture(browser):
    page=await browser.new_page(viewport={'width':1280,'height':1000})
    html=(ROOT/'tests/logged-out-fixtures.html').read_text()
    async def serve(route):
        if route.request.url==URL: await route.fulfill(status=200,content_type='text/html',body=html)
        else: await route.abort()
    await page.route('**/*',serve)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    await page.goto(URL,wait_until='domcontentloaded')
    return page,errors
async def main():
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(executable_path=BROWSER,headless=True,args=['--no-sandbox'])
        page,errors=await open_fixture(browser)
        js=(ROOT/'dist/core-test.cjs').read_text()
        await page.add_script_tag(content='window.module={exports:{}};'+js+';window.QA=module.exports;delete window.module;')
        posts=await page.evaluate('QA.collectDOM()')
        check('DOM: three logged-out posts; nested quote and decoy article excluded',[p['id'] for p in posts]==['91001','91002','91003'],[p['id'] for p in posts])
        main_post,reply,quote_post=posts
        a=main_post['author']
        check('DOM: author from profile links',a['handle']=='logged_out_author' and a['name']=='🐱 Fixture Cats' and 'profile_images' in (a.get('avatar') or ''),a)
        check('DOM: sprite verified badge resolved to symbol paths',a['verified'] and a.get('badge') and len(a['badge']['paths'])==1)
        check('DOM: permalink and visible timestamp without <time>',main_post['url']==URL and main_post['displayTime']=='13:09 · 2026年10月15日')
        check('DOM: media-only post keeps no empty text block',text(main_post)=='' and not main_post['warnings'],main_post['warnings'])
        v=media(main_post)
        check('DOM: video attachment with poster and overlay duration',len(v)==1 and v[0]['kind']=='video' and 'FixturePoster' in v[0]['src'] and v[0]['duration']=='00:07',v)
        check('DOM: engagement read from data-engagement-action, views from permalink',main_post['metrics']=={'replies':'7','reposts':'142','likes':'1262','bookmarks':'333','views':'3.2万'},main_post['metrics'])
        check('DOM: reply text and cashtag link retained',text(reply)=='Какой он хорошенький, watching $AMZN.' and any(r.get('href','').startswith('https://x.com/search') for b in reply['blocks'] if b['kind']=='text' for r in b['runs']),text(reply))
        check('DOM: reply metrics, timeline views pill',reply['metrics']['likes']=='64' and reply['metrics']['views']=='354' and reply['metrics']['reposts']=='—',reply['metrics'])
        check('DOM: own body excludes quoted body',text(quote_post)=='Taking on Amazon? 👀 What do you think?' and not media(quote_post),text(quote_post))
        q=quote_post.get('quote') or {}
        check('DOM: nested article parsed as quote with its own identity',q.get('id')=='91999' and q['author']['handle']=='quoted_source' and q['url']=='https://x.com/quoted_source/status/91999',q.get('id'))
        check('DOM: quote photos and text stay with the quote',[m['kind'] for m in media(q)]==['image','image'] and '引用原文' in text(q))
        probe=await page.evaluate('QA.pageProbe(["91001","91002","91003"])')
        by={r['id']:r for r in probe}
        check('Probe: sensitive keys never read','TOKEN-SHOULD-NOT-LEAK' not in json.dumps(probe))
        check('Probe: quoted post video not attached to outer post',by['91003']['media']==[],by['91003']['media'])
        check('Probe: Relay text, parent and timestamp read by record ID',by['91002']['parentId']=='91001' and by['91001']['published']=='2026-10-15T05:09:11.000Z' and by['91001']['fullText']=='https://t.co/fixture')
        scanned=await page.evaluate('''async()=>{const c=new QA.Collector({kind:'demo',probe:async ids=>QA.pageProbe(ids)});return c.scan();}''')
        m=media(scanned[0])[0];kinds=sorted((x['kind'],x.get('width')) for x in m['variants'])
        check('Collector: largest MP4 comes from video_download_url',m['sourceUrl']==VB+'/vid/avc1/720x720/Fixture720.mp4?tag=',m.get('sourceUrl'))
        check('Collector: HLS master and every progressive MP4 kept as variants',kinds==[('file',320),('file',540),('file',720),('hls',None)],kinds)
        check('Collector: reply relation now comes from data',scanned[1]['parentId']=='91001' and scanned[1]['relationEvidence']=='data')
        check('Collector: published time filled from Relay data',scanned[0]['published']=='2026-10-15T05:09:11.000Z')
        check('Read-only: no page errors',not errors,errors)
        await page.close()
        # Production userscript in a CDP isolated world: one capture button per top-level post bar.
        spec=importlib.util.spec_from_file_location('stayqa',ROOT/'tests/content_world_harness.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
        page,errors=await open_fixture(browser)
        await mod.isolated(page,(ROOT/'dist/X-Capture-Studio.user.js').read_text())
        await page.wait_for_function('document.querySelectorAll(\'[data-xcapture-ui="button"]\').length>=3',timeout=10000)
        placed=await page.evaluate('''()=>[...document.querySelectorAll('[data-xcapture-ui="button"]')].map(b=>({post:b.closest('article').id,inQuote:!!b.closest('article').parentElement.closest('article'),bar:!!b.parentElement.querySelector(':scope > [data-engagement-action="reply"]')}))''')
        check('Userscript: capture button in each logged-out post bar, none in quote or decoy',sorted(p['post'] for p in placed)==['main-post','quote-post','reply-post'] and all(p['bar'] and not p['inQuote'] for p in placed),placed)
        check('Userscript: no page errors',not errors,errors)
        await browser.close()
    print(json.dumps({'passed':sum(c['passed'] for c in checks),'failed':sum(not c['passed'] for c in checks)}))
asyncio.run(main())
