"""Public Stay 9b78d761 injection-mode regression, NOT an iOS/Stay emulator.

Run after build:
  XC_OLD_SCRIPT=/path/to/rc2.user.js XC_QA_OUT=/tmp/xc-stay-qa python tests/stay_startup_qa.py

No live X account, credentials, real posts, or requests to X are used.
CDP isolated-world execution is the trusted-content-script control. GM methods
are lexical fakes. The native Safari/Stay bridge and import flow remain untested.
"""
import asyncio, base64, hashlib, json, os, pathlib, re
from PIL import Image
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = pathlib.Path(os.environ.get('XC_QA_OUT', '/tmp/xc-stay-qa'))
OUT.mkdir(parents=True, exist_ok=True)
NEW = (ROOT/'dist/X-Capture-Studio.user.js').read_bytes().decode('utf-8')
OLD_PATH = pathlib.Path(os.environ['XC_OLD_SCRIPT'])
OLD = OLD_PATH.read_bytes().decode('utf-8')
URL = 'https://x.com/capture_test/status/93001'
checks = []

def check(name, ok, details=None):
    row = {'name': name, 'passed': bool(ok)}
    if details is not None: row['details'] = details
    checks.append(row)
    print(('PASS ' if ok else 'FAIL ')+name, flush=True)
    if not ok: raise AssertionError(json.dumps(row, ensure_ascii=False))

# Exact sets and matching expression in Stay/tampermonkey/Tampermonkey.m
# at public main 9b78d761d307234d4ed5ea72ac423804ea0c4301, 2022-06-15.
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

async def isolated(page, script, gm='normal'):
    cdp = await page.context.new_cdp_session(page)
    frame = (await cdp.send('Page.getFrameTree'))['frameTree']['frame']['id']
    context = (await cdp.send('Page.createIsolatedWorld', {'frameId':frame,'worldName':'stay-public-content-harness'}))['executionContextId']
    await eval_world(cdp, context, wrap(script, gm))
    return cdp, context

async def main():
    report = {'publicStayCommit': '9b78d761d307234d4ed5ea72ac423804ea0c4301',
              'environment': 'Chromium mobile viewport, CDP isolated-world execution, synthetic DOM/CSP; lexical GM fakes. NOT native Safari, not current Stay binary, not live X.',
              'flow': 'production userscript -> visible launcher/tweet action -> editor -> actual PNG and source metadata',
              'browserReason':'Browser plugin / browser skill not available; Playwright fallback.',
              'version':re.search(r'^//\s*@version\s+(.+)
              'oldSHA256': hashlib.sha256(OLD.encode()).hexdigest(),
              'newSHA256': hashlib.sha256(NEW.encode()).hexdigest()}
    try:
        old_mode = classify(OLD)
        without_grant = classify(re.sub(r'^//\s*@grant\s+unsafeWindow\s*$', '', OLD, flags=re.M))
        new_mode = classify(NEW)
        report['classification']={'rc2':old_mode,'rc2_without_grant':without_grant,'candidate':new_mode}
        check('Published Stay classifier selects page mode for delivered rc2', old_mode['mode']=='page')
        check('Removing only unsafeWindow still selects page mode', without_grant['mode']=='page' and bool(without_grant['rejectedTokens']))
        check('Published classifier selects content mode for candidate', new_mode['mode']=='content')
        check('Artifact has no unsafeWindow dependency and no remote executable require', 'unsafeWindow' not in new_mode['grants'] and not re.search(r'^//\s*@require', NEW, re.M))
        check('Original six site scopes retained',re.findall(r'^//\s*@match\s+(.+)$',NEW,re.M)==re.findall(r'^//\s*@match\s+(.+)$',OLD,re.M))
        check('Startup sentinel precedes bundle initialization',NEW.index('var __XC_STAY_BOOT__') < NEW.index("(function(){'use strict';const modules="))
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(executable_path=os.environ.get('XC_BROWSER','/usr/bin/chromium'), args=['--no-sandbox'])
            try:
                for strict in [False, True]:
                    page,errors,console,dialogs=await page_fixture(browser, strict)
                    await page.evaluate('code=>{var tag=document.createElement("script");tag.type="text/javascript";tag.appendChild(document.createTextNode(code));document.body.appendChild(tag);}', OLD)
                    await page.wait_for_timeout(400)
                    n=await page.locator('[data-xcapture-ui="launcher"]').count()
                    check('rc2 page injection '+('is blocked by strict CSP (red)' if strict else 'works without CSP (control)'), n==(0 if strict else 1),{'launcherCount':n})
                    if strict: check('The red case records an explicit CSP script rejection',any('Content Security Policy' in m['text'] for m in console))
                    await page.close()
                page,errors,console,dialogs=await page_fixture(browser)
                cdp,ctx=await isolated(page,NEW)
                await page.get_by_role('button',name='打开 X Capture',exact=True).wait_for()
                check('Candidate trusted isolated injection displays launcher despite page CSP',await page.locator('[data-xcapture-ui="launcher"]').count()==1)
                check('Actual per-tweet capture buttons mounted',await page.locator('[data-xcapture-ui="button"]').count()==2)
                check('Boot sentinel does not duplicate successful launcher',await page.locator('[data-xcapture-ui="stay-startup"]').count()==0)
                menus=await eval_world(cdp,ctx,'Object.keys(__stayHarness.menus)')
                check('Both Stay panel commands registered through lexical GM API',menus==['打开 X Capture','X Capture 启动自检'],menus)
                check('START and READY logged through official-style GM_log',await eval_world(cdp,ctx,"__stayHarness.logs.some(x=>x.includes(' START '))&&__stayHarness.logs.some(x=>x.includes(' READY '))"))
                check('Fixture page identity correct and not blank',await page.title()=='Stay 注入回归 · 本地虚构页面' and await page.locator('article[data-testid="tweet"]').count()==2)
                box=await page.get_by_role('button',name='打开 X Capture',exact=True).bounding_box()
                check('390x844 mobile launcher clear of bottom browser controls',box and box['x']>=0 and box['y']+box['height']<780,box)
                await page.screenshot(path=str(OUT/'mobile-launcher.png'))
                await page.get_by_role('button',name='打开 X Capture',exact=True).tap()
                await page.get_by_role('dialog',name='X Capture 编辑器',exact=True).wait_for()
                await page.locator('.xc-preview canvas').first.wait_for()
                check('Tap launcher opens real production editor with rendered preview',await page.locator('.xc-preview canvas').count()>0)
                await page.get_by_role('tab',name='内容',exact=True).tap()
                check('Content selection contains two parsed candidates',await page.locator('.xc-post-row').count()==2)
                await page.get_by_role('button',name='全部候选',exact=True).tap()
                check('Both root and reply can be selected in isolated world',await page.locator('.xc-post-row.is-selected').count()==2)
                await page.get_by_role('tab',name='外观',exact=True).tap()
                await page.wait_for_timeout(200)
                await page.screenshot(path=str(OUT/'mobile-editor.png'))
                await page.get_by_role('button',name='导出 PNG',exact=True).tap()
                await page.get_by_role('heading',name='高清图片已生成',exact=True).wait_for()
                encoded=await eval_world(cdp,ctx,'''(async()=>{const b=__stayHarness.lastBlob;if(!b)throw Error('no export Blob');return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=reject;r.readAsDataURL(b);});})()''')
                (OUT/'mobile-capture.png').write_bytes(base64.b64decode(encoded))
                image=Image.open(OUT/'mobile-capture.png');image.load()
                check('Real PNG export has 2x pixel dimensions', image.width==1520 and image.height>500,{'width':image.width,'height':image.height})
                check('Real PNG metadata retains selected source posts', URL in str(image.info) and 'https://x.com/reader_test/status/93002' in str(image.info))
                await page.get_by_role('button',name='关闭导出结果',exact=True).tap()
                await page.get_by_role('button',name='关闭编辑器',exact=True).tap()
                await page.locator('[data-xcapture-ui="button"]').first.tap()
                await page.get_by_role('dialog',name='X Capture 编辑器',exact=True).wait_for()
                await page.locator('.xc-preview canvas').first.wait_for()
                check('Per-tweet capture entry opens editor',await page.locator('.xc-preview canvas').count()>0)
                await page.get_by_role('button',name='关闭编辑器',exact=True).tap()
                await eval_world(cdp,ctx,"__stayHarness.menus['打开 X Capture']()")
                await page.get_by_role('dialog',name='X Capture 编辑器',exact=True).wait_for()
                check('Stay panel open command independently opens editor',await page.get_by_role('dialog',name='X Capture 编辑器').count()==1)
                await page.get_by_role('button',name='关闭编辑器',exact=True).tap()
                await eval_world(cdp,ctx,"__stayHarness.menus['X Capture 启动自检']()")
                check('Panel diagnostic returns a device-actionable report',bool(dialogs) and '管理器：Stay public-branch-harness' in dialogs[-1] and '独立入口：已挂载' in dialogs[-1])
                check('Diagnostics omit post body and full browsing URL', '这是一条虚构测试帖' not in dialogs[-1] and URL not in dialogs[-1] and 'Cookie' in dialogs[-1])
                check('Production startup/editor/export have no uncaught JS errors',not errors,errors)
                check('No framework/error overlay in application',await page.locator('vite-error-overlay, nextjs-portal').count()==0)
                check('No relevant console errors on successful branch',not [m for m in console if m['type']=='error'],[m for m in console if m['type']=='error'])
                await page.close()
                for mode in ['missing','throwing-menu','stalled']:
                    page,errors,console,dialogs=await page_fixture(browser)
                    cdp,ctx=await isolated(page,NEW,mode)
                    await page.get_by_role('button',name='打开 X Capture',exact=True).wait_for()
                    check('Launcher survives GM bridge condition: '+mode,await page.locator('[data-xcapture-ui="launcher"]').count()==1)
                    await page.get_by_role('button',name='打开 X Capture',exact=True).tap()
                    await page.get_by_role('dialog',name='X Capture 编辑器',exact=True).wait_for()
                    await page.locator('.xc-preview canvas').first.wait_for()
                    check('Editor survives GM bridge condition: '+mode,await page.locator('.xc-preview canvas').count()>0 and not errors,errors)
                    await page.close()
                # A page transition may clone UI host nodes without copying shadow roots.
                page,errors,console,dialogs=await page_fixture(browser)
                cdp,ctx=await isolated(page,NEW)
                await page.get_by_role('button',name='打开 X Capture',exact=True).wait_for()
                await page.evaluate('()=>{const b=document.body.cloneNode(true);document.body.replaceWith(b);}')
                await page.get_by_role('button',name='打开 X Capture',exact=True).wait_for()
                check('Replaced body recovers usable shadow-root launcher',await page.locator('[data-xcapture-ui="launcher"]').count()==1)
                await eval_world(cdp,ctx,wrap(NEW))
                await page.get_by_role('button',name='打开 X Capture',exact=True).wait_for()
                check('Same-world reinjection produces only one launcher',await page.locator('[data-xcapture-ui="launcher"]').count()==1 and not errors,errors)
                await page.close()
                # Deliberate pre-entry fault inside test wrapper, never in distributed script.
                faulty=NEW.replace("\ntry {\n(function(){'use strict';const modules=", "\ntry {\nthrow new Error('fixture bootstrap failure https://example.test/failure?secret=STRIP_ME');\n(function(){'use strict';const modules=",1)
                page,errors,console,dialogs=await page_fixture(browser)
                cdp,ctx=await isolated(page,faulty)
                await page.get_by_role('button',name='X Capture 启动自检',exact=True).wait_for()
                check('Early application failure leaves plain-DOM diagnostic entry',await page.locator('[data-xcapture-ui="stay-startup"]').count()==1)
                await page.get_by_role('button',name='X Capture 启动自检',exact=True).tap()
                check('Early failure report identifies BOOT_ERROR and strips URL query', 'BOOT_ERROR' in dialogs[-1] and 'fixture bootstrap failure' in dialogs[-1] and 'STRIP_ME' not in dialogs[-1])
                check('Stay panel diagnostic still registers before app initialization failure',await eval_world(cdp,ctx,"typeof __stayHarness.menus['X Capture 启动自检']==='function'"))
                await page.close()
            finally:
                await browser.close()
        report['complete']=True
    except Exception as e:
        report['executionError']=str(e)
        raise
    finally:
        report['passed']=sum(c['passed'] for c in checks);report['failed']=sum(not c['passed'] for c in checks)
        (OUT/'stay-startup-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
        print(json.dumps({'passed':report['passed'],'failed':report['failed']},ensure_ascii=False),flush=True)

if __name__=='__main__':asyncio.run(main())
,NEW,re.M).group(1),'checks':checks,'complete':False,
              'oldSHA256': hashlib.sha256(OLD.encode()).hexdigest(),
              'newSHA256': hashlib.sha256(NEW.encode()).hexdigest()}
    try:
        old_mode = classify(OLD)
        without_grant = classify(re.sub(r'^//\s*@grant\s+unsafeWindow\s*$', '', OLD, flags=re.M))
        new_mode = classify(NEW)
        report['classification']={'rc2':old_mode,'rc2_without_grant':without_grant,'rc3':new_mode}
        check('Published Stay classifier selects page mode for delivered rc2', old_mode['mode']=='page')
        check('Removing only unsafeWindow still selects page mode', without_grant['mode']=='page' and bool(without_grant['rejectedTokens']))
        check('Published classifier selects content mode for rc3', new_mode['mode']=='content')
        check('Artifact has no unsafeWindow dependency and no remote executable require', 'unsafeWindow' not in new_mode['grants'] and not re.search(r'^//\s*@require', NEW, re.M))
        check('Original six site scopes retained',re.findall(r'^//\s*@match\s+(.+)$',NEW,re.M)==re.findall(r'^//\s*@match\s+(.+)$',OLD,re.M))
        check('Startup sentinel precedes bundle initialization',NEW.index('var __XC_STAY_BOOT__') < NEW.index("(function(){'use strict';const modules="))
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(executable_path=os.environ.get('XC_BROWSER','/usr/bin/chromium'), args=['--no-sandbox'])
            try:
                for strict in [False, True]:
                    page,errors,console,dialogs=await page_fixture(browser, strict)
                    await page.evaluate('code=>{var tag=document.createElement("script");tag.type="text/javascript";tag.appendChild(document.createTextNode(code));document.body.appendChild(tag);}', OLD)
                    await page.wait_for_timeout(400)
                    n=await page.locator('[data-xcapture-ui="launcher"]').count()
                    check('rc2 page injection '+('is blocked by strict CSP (red)' if strict else 'works without CSP (control)'), n==(0 if strict else 1),{'launcherCount':n})
                    if strict: check('The red case records an explicit CSP script rejection',any('Content Security Policy' in m['text'] for m in console))
                    await page.close()
                page,errors,console,dialogs=await page_fixture(browser)
                cdp,ctx=await isolated(page,NEW)
                await page.get_by_role('button',name='打开 X Capture',exact=True).wait_for()
                check('rc3 trusted isolated injection displays launcher despite page CSP',await page.locator('[data-xcapture-ui="launcher"]').count()==1)
                check('Actual per-tweet capture buttons mounted',await page.locator('[data-xcapture-ui="button"]').count()==2)
                check('Boot sentinel does not duplicate successful launcher',await page.locator('[data-xcapture-ui="stay-startup"]').count()==0)
                menus=await eval_world(cdp,ctx,'Object.keys(__stayHarness.menus)')
                check('Both Stay panel commands registered through lexical GM API',menus==['打开 X Capture','X Capture 启动自检'],menus)
                check('START and READY logged through official-style GM_log',await eval_world(cdp,ctx,"__stayHarness.logs.some(x=>x.includes(' START '))&&__stayHarness.logs.some(x=>x.includes(' READY '))"))
                check('Fixture page identity correct and not blank',await page.title()=='Stay 注入回归 · 本地虚构页面' and await page.locator('article[data-testid="tweet"]').count()==2)
                box=await page.get_by_role('button',name='打开 X Capture',exact=True).bounding_box()
                check('390x844 mobile launcher clear of bottom browser controls',box and box['x']>=0 and box['y']+box['height']<780,box)
                await page.screenshot(path=str(OUT/'mobile-launcher.png'))
                await page.get_by_role('button',name='打开 X Capture',exact=True).tap()
                await page.get_by_role('dialog',name='X Capture 编辑器',exact=True).wait_for()
                await page.locator('.xc-preview canvas').first.wait_for()
                check('Tap launcher opens real production editor with rendered preview',await page.locator('.xc-preview canvas').count()>0)
                await page.get_by_role('tab',name='内容',exact=True).tap()
                check('Content selection contains two parsed candidates',await page.locator('.xc-post-row').count()==2)
                await page.get_by_role('button',name='全部候选',exact=True).tap()
                check('Both root and reply can be selected in isolated world',await page.locator('.xc-post-row.is-selected').count()==2)
                await page.get_by_role('tab',name='外观',exact=True).tap()
                await page.wait_for_timeout(200)
                await page.screenshot(path=str(OUT/'mobile-editor.png'))
                await page.get_by_role('button',name='导出 PNG',exact=True).tap()
                await page.get_by_role('heading',name='高清图片已生成',exact=True).wait_for()
                encoded=await eval_world(cdp,ctx,'''(async()=>{const b=__stayHarness.lastBlob;if(!b)throw Error('no export Blob');return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=reject;r.readAsDataURL(b);});})()''')
                (OUT/'mobile-capture.png').write_bytes(base64.b64decode(encoded))
                image=Image.open(OUT/'mobile-capture.png');image.load()
                check('Real PNG export has 2x pixel dimensions', image.width==1520 and image.height>500,{'width':image.width,'height':image.height})
                check('Real PNG metadata retains selected source posts', URL in str(image.info) and 'https://x.com/reader_test/status/93002' in str(image.info))
                await page.get_by_role('button',name='关闭导出结果',exact=True).tap()
                await page.get_by_role('button',name='关闭编辑器',exact=True).tap()
                await page.locator('[data-xcapture-ui="button"]').first.tap()
                await page.get_by_role('dialog',name='X Capture 编辑器',exact=True).wait_for()
                check('Per-tweet capture entry opens editor',await page.locator('.xc-preview canvas').count()>0)
                await page.get_by_role('button',name='关闭编辑器',exact=True).tap()
                await eval_world(cdp,ctx,"__stayHarness.menus['打开 X Capture']()")
                await page.get_by_role('dialog',name='X Capture 编辑器',exact=True).wait_for()
                check('Stay panel open command independently opens editor',await page.get_by_role('dialog',name='X Capture 编辑器').count()==1)
                await page.get_by_role('button',name='关闭编辑器',exact=True).tap()
                await eval_world(cdp,ctx,"__stayHarness.menus['X Capture 启动自检']()")
                check('Panel diagnostic returns a device-actionable report',bool(dialogs) and '管理器：Stay public-branch-harness' in dialogs[-1] and '独立入口：已挂载' in dialogs[-1])
                check('Diagnostics omit post body and full browsing URL', '这是一条虚构测试帖' not in dialogs[-1] and URL not in dialogs[-1] and 'Cookie' in dialogs[-1])
                check('Production startup/editor/export have no uncaught JS errors',not errors,errors)
                check('No framework/error overlay in application',await page.locator('vite-error-overlay, nextjs-portal').count()==0)
                check('No relevant console errors on successful branch',not [m for m in console if m['type']=='error'],[m for m in console if m['type']=='error'])
                await page.close()
                for mode in ['missing','throwing-menu','stalled']:
                    page,errors,console,dialogs=await page_fixture(browser)
                    cdp,ctx=await isolated(page,NEW,mode)
                    await page.get_by_role('button',name='打开 X Capture',exact=True).wait_for()
                    check('Launcher survives GM bridge condition: '+mode,await page.locator('[data-xcapture-ui="launcher"]').count()==1)
                    await page.get_by_role('button',name='打开 X Capture',exact=True).tap()
                    await page.get_by_role('dialog',name='X Capture 编辑器',exact=True).wait_for()
                    check('Editor survives GM bridge condition: '+mode,await page.locator('.xc-preview canvas').count()>0 and not errors,errors)
                    await page.close()
                # A page transition may clone UI host nodes without copying shadow roots.
                page,errors,console,dialogs=await page_fixture(browser)
                cdp,ctx=await isolated(page,NEW)
                await page.get_by_role('button',name='打开 X Capture',exact=True).wait_for()
                await page.evaluate('()=>{const b=document.body.cloneNode(true);document.body.replaceWith(b);}')
                await page.get_by_role('button',name='打开 X Capture',exact=True).wait_for()
                check('Replaced body recovers usable shadow-root launcher',await page.locator('[data-xcapture-ui="launcher"]').count()==1)
                await eval_world(cdp,ctx,wrap(NEW))
                await page.get_by_role('button',name='打开 X Capture',exact=True).wait_for()
                check('Same-world reinjection produces only one launcher',await page.locator('[data-xcapture-ui="launcher"]').count()==1 and not errors,errors)
                await page.close()
                # Deliberate pre-entry fault inside test wrapper, never in distributed script.
                faulty=NEW.replace("\ntry {\n(function(){'use strict';const modules=", "\ntry {\nthrow new Error('fixture bootstrap failure https://example.test/failure?secret=STRIP_ME');\n(function(){'use strict';const modules=",1)
                page,errors,console,dialogs=await page_fixture(browser)
                cdp,ctx=await isolated(page,faulty)
                await page.get_by_role('button',name='X Capture 启动自检',exact=True).wait_for()
                check('Early application failure leaves plain-DOM diagnostic entry',await page.locator('[data-xcapture-ui="stay-startup"]').count()==1)
                await page.get_by_role('button',name='X Capture 启动自检',exact=True).tap()
                check('Early failure report identifies BOOT_ERROR and strips URL query', 'BOOT_ERROR' in dialogs[-1] and 'fixture bootstrap failure' in dialogs[-1] and 'STRIP_ME' not in dialogs[-1])
                check('Stay panel diagnostic still registers before app initialization failure',await eval_world(cdp,ctx,"typeof __stayHarness.menus['X Capture 启动自检']==='function'"))
                await page.close()
            finally:
                await browser.close()
        report['complete']=True
    except Exception as e:
        report['executionError']=str(e)
        raise
    finally:
        report['passed']=sum(c['passed'] for c in checks);report['failed']=sum(not c['passed'] for c in checks)
        (OUT/'stay-startup-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
        print(json.dumps({'passed':report['passed'],'failed':report['failed']},ensure_ascii=False),flush=True)

if __name__=='__main__':asyncio.run(main())
