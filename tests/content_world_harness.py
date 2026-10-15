"""Minimal content-world QA adapter; NOT Safari, not a real Stay binary.

Production userscripts run in a Chromium CDP isolated world. GM APIs and
clipboard are test shims. No live X navigation, accounts, cookies or requests.
Kept separate from historical one-off startup QA runners for reproducibility.
"""
import re

PROP = '''clientInformation navigator closed console customElements crypto devicePixelRatio document event external frameElement frames fullScreen history innerHeight innerWidth length location locationbar localStorage menubar messageManager mozInnerScreenX mozInnerScreenY name opener outerHeight outerWidth pageXOffset pageYOffset parent performance personalbar screen screenX screenY scrollbars scrollMaxX scrollMaxY scrollX scrollY self sessionStorage sidebar speechSynthesis status statusbar toolbar top visualViewport window content defaultStatus orientation returnValue'''.split()

METHOD = '''alert blur cancelAnimationFrame cancelIdleCallback clearImmediate close confirm dump find focus getComputedStyle getDefaultComputedStyle getSelection matchMedia moveBy moveTo open postMessage print prompt requestAnimationFrame requestIdleCallback resizeBy resizeTo scroll scrollBy scrollByLines scrollByPages scrollTo setImmediate setResizable sizeToContent showOpenFilePicker showSaveFilePicker showDirectoryPicker stop updateCommands back captureEvents forward home openDialog releaseEvents showModalDialog'''.split()

ALLOWED = {'window.'+s for s in PROP} | {'window.'+s+'()' for s in METHOD}

def classify(code):
    grants = re.findall(r'^//\s*@grant\s+(\S+)', code, re.M)
    stripped = re.sub(r'^//.*', '', code, flags=re.M).strip('\n')
    tokens = re.findall(r'(window\.[a-z|A-z|\(|\)]*)', stripped)
    rejected = sorted(set(tokens)-ALLOWED)
    return {'mode': 'page' if 'unsafeWindow' in grants or rejected else 'content',
            'grants': grants, 'rejectedTokens': rejected}

async def eval_world(cdp, context, expression):
    result = await cdp.send('Runtime.evaluate', {'expression': expression, 'contextId': context,
                                                 'returnByValue': True, 'awaitPromise': True})
    if 'exceptionDetails' in result:
        raise RuntimeError(str(result['exceptionDetails']))
    return result.get('result', {}).get('value')

def wrap(code, gm='normal'):
    prelude = '''globalThis.__stayHarness={logs:[],menus:{},lastBlob:null};
    const savedCreateURL=URL.createObjectURL.bind(URL);
    URL.createObjectURL=function(blob){globalThis.__stayHarness.lastBlob=blob;return savedCreateURL(blob);};\n'''
    if gm != 'missing':
        read = 'new Promise(()=>{})' if gm=='stalled' else 'fallback'
        menu = "throw Error('fixture menu bridge unavailable')" if gm=='throwing-menu' else 'globalThis.__stayHarness.menus[label]=fn;return label'
        prelude += '''const GM_info={scriptHandler:'Stay',version:'public-branch-harness'};
        const GM_log=function(message){globalThis.__stayHarness.logs.push(String(message));};
        const GM_getValue=function(key,fallback){return READ;};
        const GM_setValue=function(){};
        const GM_registerMenuCommand=function(label,fn){ MENU; };
        '''.replace('READ', read).replace('MENU', menu)
    return '(async function(){\n'+prelude+'\n'+code+'\n})();'

async def isolated(page, script, gm='normal'):
    cdp = await page.context.new_cdp_session(page)
    frame = (await cdp.send('Page.getFrameTree'))['frameTree']['frame']['id']
    context = (await cdp.send('Page.createIsolatedWorld', {'frameId':frame,'worldName':'stay-public-content-harness'}))['executionContextId']
    await eval_world(cdp, context, wrap(script, gm))
    return cdp, context


# Reusable synthetic two-post page; no dependency on historical startup-run scripts.
URL = 'https://x.com/capture_test/status/93001'

CSP = "script-src 'self'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; object-src 'none'"

HTML = '''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Stay 注入回归 · 本地虚构页面</title>
<meta http-equiv="Content-Security-Policy" content="__CSP__">
<style>body{margin:0;background:#f5f7f9;color:#17202a;font:16px -apple-system,Arial,sans-serif}header{padding:24px 18px 12px;font-size:14px;color:#607485}article{background:white;border:1px solid #dde4eb;border-radius:16px;margin:12px;padding:18px;line-height:1.6}a{color:inherit;text-decoration:none}[data-testid="User-Name"]{font-weight:600;display:flex;gap:8px}[data-testid="tweetText"]{margin-top:14px}[role="group"]{display:flex;justify-content:space-between;margin-top:18px}[role="group"]>button{border:0;background:transparent;color:#617282}time{color:#637685;font-size:12px}</style></head><body>
<header>本地测试页面 · 不是 iPhone / Stay 真机截图</header><main><div data-testid="primaryColumn">
<article data-testid="tweet" data-post-id="93001">
<div data-testid="User-Name"><a href="/capture_test">示例作者</a><a href="/capture_test">@capture_test</a></div>
<a href="/capture_test/status/93001"><time datetime="2026-09-25T04:00:00Z">9月25日</time></a>
<div data-testid="tweetText">这是一条虚构测试帖。<br>验证 Safari 用户脚本的启动路径：入口、选帖、预览和高清导出。<br>内容与图片只在本地处理。</div>
<div role="group"><button data-testid="reply">2</button><button data-testid="retweet">1</button><button data-testid="like">6</button></div></article>
<article data-testid="tweet" data-post-id="93002" data-in-reply-to-status-id="93001">
<div data-testid="User-Name"><a href="/reader_test">示例读者</a><a href="/reader_test">@reader_test</a></div>
<a href="/reader_test/status/93002"><time datetime="2026-09-25T04:01:00Z">9月25日</time></a>
<div data-testid="tweetText">这条回复提供背景信息，可以在内容面板中手动选中。</div>
<div role="group"><button data-testid="reply">0</button><button data-testid="like">3</button></div></article>
</div></main></body></html>'''

async def page_fixture(browser, strict=True):
    page = await browser.new_page(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True)
    page.set_default_timeout(15000)
    errors, console, dialogs = [], [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: console.append({'type': m.type, 'text': m.text}))
    async def dialog_handler(d):
        dialogs.append(d.message)
        await d.accept()
    page.on('dialog', dialog_handler)
    html = HTML.replace('__CSP__', CSP if strict else '').replace('href="/', 'href="https://x.com/')
    async def route_handler(route):
        if route.request.url == URL: await route.fulfill(status=200, content_type='text/html', body=html)
        else: await route.abort()
    await page.route('**/*', route_handler)
    # This environment restricts navigating X. Use a local about:blank document,
    # absolute synthetic source anchors, and no network navigation instead.
    await page.set_content(html, wait_until='domcontentloaded')
    return page, errors, console, dialogs
