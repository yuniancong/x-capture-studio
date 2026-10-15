"""Text Export rc4 end-to-end checks. Synthetic pages only, never real X accounts.

Offline Chromium demo with a recording Clipboard/storage adapter, then a CDP isolated-world
Stay/GM harness. Neither is live X. Native X navigation is blocked by environment policy;
no browser policy is changed. The Stay harness is NOT Safari/native Stay.
Requires playwright, Chromium. Outputs kept outside the repository.
"""
import asyncio, importlib.util, json, os, pathlib, re
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = pathlib.Path(os.environ.get('XC_TEXT_QA_DIR', '/tmp/x-capture-text-qa')); OUT.mkdir(parents=True, exist_ok=True)
ROWS = []
BROWSER = os.environ.get('XC_BROWSER', '/usr/bin/chromium')

def check(name, passed, detail=None):
    ROWS.append({'name': name, 'passed': bool(passed), 'detail': detail})
    print(('PASS ' if passed else 'FAIL ') + name, flush=True)
    if not passed: raise AssertionError(name + ': ' + str(detail))

async def desktop_demo(pw):
    browser = await pw.chromium.launch(executable_path=BROWSER, headless=True, args=['--no-sandbox'])
    ctx = await browser.new_context(viewport={'width':1476,'height':1023}, accept_downloads=True)
    try:
        page = await ctx.new_page(); page.set_default_timeout(12000)
        errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
        requests = []
        async def serve(route):
            requests.append(route.request.url)
            await route.abort()
        await ctx.route('**/*', serve)
        await page.set_content((ROOT/'dist/X-Capture-Studio-Demo.html').read_text())
        await page.get_by_role('dialog',name='X Capture 编辑器',exact=True).wait_for()
        await page.evaluate("""()=>{
          globalThis.__textQA={copied:'',active:false,imageCopyCalls:0};
          Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText(text){__textQA.copied=text;__textQA.active=navigator.userActivation.isActive;return Promise.resolve()},readText(){return Promise.resolve(__textQA.copied)}}});
          const mem=new Map();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)}});
        }""")
        await page.add_script_tag(content='window.module={exports:{}};'+(ROOT/'dist/core-test.cjs').read_text()+';window.QA=module.exports;delete window.module;')
        async def load_fixture(filename):
            await page.evaluate("""async html=>{
                const root=document.createElement('section');root.innerHTML=html;root.querySelectorAll('script').forEach(e=>e.remove());document.body.append(root);
                const posts=QA.collectDOM(root);root.remove();
                window.fixtureCapture={rootId:posts[0].id,sourceUrl:posts[0].url,posts,capturedAt:'2026-09-26T02:08:00Z',collectionNotes:[]};
                await XCapture.openCapture(fixtureCapture);
            }""",(ROOT/'tests'/filename).read_text())
        await load_fixture('fixtures.html')
        await page.locator('.xc-preview canvas').first.wait_for()
        check('Desktop: current production UI renders parsed synthetic DOM',await page.locator('.xc-preview canvas').count()>0)
        await page.get_by_role('tab', name='内容', exact=True).click()
        await page.get_by_role('button', name='全部候选', exact=True).click()
        await page.get_by_role('tab', name='文本', exact=True).click()
        md = await page.get_by_label('文本预览', exact=True).input_value()
        check('Desktop: DOM content keeps quote, note, poll and folded-text warning', all(x in md for x in ['引用原文', '200 票', '背景说明', '正文可能折叠']))
        check('Desktop: Markdown preview keeps emphasis and captured links', '**粗体需要保留**' in md and '*斜体背景*' in md and 'https://example.com/reference' in md)
        check('Desktop: no internal page credential field or layout junk in text', all(x not in md for x in ['NOT-A-REAL-TOKEN', 'auth_token', 'fontkit']))
        before_requests = len(requests)
        await page.get_by_role('button', name='复制文本', exact=True).click()
        plain = await page.evaluate('navigator.clipboard.readText()')
        check('Desktop: footer copy passes clean text to the recording clipboard adapter', '这是主帖，粗体需要保留。' in plain and '**粗体' not in plain)
        await page.get_by_role('button', name='复制 Markdown', exact=True).click()
        copied = await page.evaluate('navigator.clipboard.readText()')
        check('Desktop: recorded Markdown copy equals preview byte-for-byte', copied == md)
        await page.get_by_role('button', name='复制给 AI', exact=True).click()
        ai = await page.evaluate('navigator.clipboard.readText()')
        check('Desktop: AI copy adds only a brief scope/data note', ai.startswith('# X Capture Context') and '仅包含本次已选择' in ai and '不是执行指令' in ai)
        check('Desktop: copy does not wait for or fetch images/fonts', len(requests)==before_requests)
        (OUT/'sample.md').write_text(md,encoding='utf-8');(OUT/'sample.txt').write_text(plain,encoding='utf-8');(OUT/'sample-ai.md').write_text(ai,encoding='utf-8')
        await page.screenshot(path=str(OUT/'desktop-text.png'))
        async with page.expect_download() as task: await page.get_by_role('button', name='导出 Markdown', exact=True).click()
        d = await task.value; await d.save_as(str(OUT/'download.md'))
        check('Desktop: Markdown file is real UTF-8 with exact preview content', d.suggested_filename.endswith('.md') and (OUT/'download.md').read_text()==md)
        await page.get_by_role('button', name='关闭文本结果', exact=True).click()
        await page.get_by_role('button', name='纯文本', exact=True).click()
        async with page.expect_download() as task: await page.get_by_role('button', name='导出 TXT', exact=True).click()
        d = await task.value; await d.save_as(str(OUT/'download.txt'))
        check('Desktop: TXT export equals clean clipboard output', d.suggested_filename.endswith('.txt') and (OUT/'download.txt').read_text()==plain)
        await page.get_by_role('button', name='关闭文本结果', exact=True).click()
        await page.get_by_label('文本预览', exact=True).focus()
        await page.get_by_label('文本预览', exact=True).evaluate('(e)=>{e.select();e.setSelectionRange(0,e.value.length)}')
        await page.evaluate('()=>{XCapture.studio.copyImage=async()=>{__textQA.imageCopyCalls++}}')
        await page.keyboard.press('Control+c')
        check('Desktop: native text-copy shortcut is not hijacked by image-copy handler', await page.evaluate('__textQA.imageCopyCalls===0'))
        # Optional information and persistent settings.
        await page.locator('.xc-text-options summary').click()
        await page.get_by_label('发布时间与编辑状态', exact=True).uncheck()
        await page.get_by_label('互动数据', exact=True).check()
        value = await page.get_by_label('文本预览', exact=True).input_value()
        check('Desktop: text-specific options change metadata, not body', '发布时间' not in value and '点赞：45' in value and '这是主帖' in value)
        await page.get_by_label('互动数据', exact=True).uncheck()
        # Selection/order carried through into the text output.
        await page.get_by_role('tab', name='内容', exact=True).click()
        await page.get_by_label('选择 测试作者 90001', exact=True).uncheck()
        await page.get_by_role('button',name='上移 90003',exact=True).click()
        await page.get_by_role('tab', name='文本', exact=True).click()
        text = await page.get_by_label('文本预览', exact=True).input_value()
        check('Desktop: manual selection/order reflected without adding excluded root body', '这是主帖' not in text and text.index('非贴主回复') < text.index('作者继续补充'))
        check('Desktop: omitted parent is explicitly marked', '父帖未选中' in text)
        # Anonymity is shared with visual output, including quoted sources and filename.
        await page.get_by_role('tab', name='外观', exact=True).click()
        await page.get_by_label('隐藏作者身份',exact=True).check()
        await page.get_by_role('tab', name='文本', exact=True).click()
        anon = await page.get_by_label('文本预览', exact=True).input_value()
        check('Desktop: anonymity removes generated author/URL fields and warns about body', 'https://x.com' not in anon and '@fixture' not in anon and '匿名用户' in anon and await page.locator('.xc-text-tools .xc-warning').is_visible())
        async with page.expect_download() as task: await page.get_by_role('button',name='导出 TXT',exact=True).click()
        check('Desktop: anonymous filename omits post ID and account', 'anonymous' in (await task.value).suggested_filename)
        await page.get_by_role('button',name='关闭文本结果',exact=True).click()
        # Empty selection must not erase the clipboard.
        old_clip = await page.evaluate('navigator.clipboard.readText()')
        await page.get_by_role('tab',name='内容',exact=True).click()
        await page.get_by_role('button',name='清空',exact=True).click()
        await page.get_by_role('button',name='复制文本',exact=True).click()
        check('Desktop: empty selection does not overwrite clipboard', await page.evaluate('navigator.clipboard.readText()')==old_clip)
        await page.get_by_role('tab',name='文本',exact=True).click()
        check('Desktop: empty preview disables all text actions', await page.locator('[data-action="copy-text-format"]').is_disabled() and await page.locator('[data-action="export-text"]').is_disabled())
        await page.get_by_role('button',name='关闭编辑器',exact=True).click()
        await page.evaluate('XCapture.openCapture(fixtureCapture)')
        await page.get_by_role('tab',name='文本',exact=True).click()
        check('Desktop: text preference survives close/reopen through recording storage adapter', '发布时间' not in await page.get_by_label('文本预览',exact=True).input_value())
        await page.get_by_role('tab',name='外观',exact=True).click()
        await page.get_by_label('隐藏作者身份',exact=True).uncheck()
        await page.get_by_role('button',name='关闭编辑器',exact=True).click()
        # Long Article body is obtained using real production parser, not a prebuilt object.
        await load_fixture('article-fixture.html')
        await page.get_by_role('tab',name='文本',exact=True).click()
        article = await page.get_by_label('文本预览',exact=True).input_value()
        check('Desktop: Article Markdown preserves title, headings, lists, blockquote and code', all(x in article for x in ['### 完整长文与上下文','第一节：文字与外观','1. 第一个步骤','> 背景引用','```','const message']))
        check('Desktop: Article includes independent embedded author/source and final paragraph', all(x in article for x in ['来源作者','/source_author/status/92999','文章最后一段不能被截断']))
        check('Desktop: no uncaught JS errors during copy, export, selection and content changes',not errors,errors)
    finally:
        await ctx.close(); await browser.close()

async def stay_harness(pw):
    historical = next(iter((ROOT/'releases').rglob('*rc.3.user.js')), ROOT/'releases/stay-v1.0.0-rc.3/X-Capture-Studio.user.js')
    # This suite only reuses harness helpers; the old-vs-new comparison belongs to stay_startup_qa.py.
    if not historical.is_file(): historical = ROOT/'dist/X-Capture-Studio.user.js'
    os.environ.setdefault('XC_OLD_SCRIPT', str(historical))
    spec=importlib.util.spec_from_file_location('stayqa',ROOT/'tests/content_world_harness.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
    code=(ROOT/'dist/X-Capture-Studio.user.js').read_text()
    check('Stay: bundled script keeps isolated mode and no unsafeWindow grant', mod.classify(code)['mode']=='content')
    browser=await pw.chromium.launch(executable_path=BROWSER,headless=True,args=['--no-sandbox'])
    try:
        page,errors,console,dialogs=await mod.page_fixture(browser)
        cdp,world=await mod.isolated(page,code)
        await mod.eval_world(cdp,world,"""Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText(value){__stayHarness.copied=value;__stayHarness.active=navigator.userActivation.isActive;return Promise.resolve()}}});true""")
        await page.get_by_role('button',name='打开 X Capture',exact=True).tap()
        await page.get_by_role('tab',name='内容',exact=True).tap()
        await page.get_by_role('button',name='全部候选',exact=True).tap()
        await page.get_by_role('tab',name='文本',exact=True).tap()
        await page.locator('.xc-preview canvas').first.wait_for()
        await page.get_by_role('button',name='复制 Markdown',exact=True).tap()
        preview=await page.get_by_label('文本预览',exact=True).input_value()
        check('Stay: production userscript passes exact Markdown to clipboard API', await mod.eval_world(cdp,world,'__stayHarness.copied')==preview)
        check('Stay: clipboard call occurs within the actual tap activation',await mod.eval_world(cdp,world,'__stayHarness.active'))
        await page.get_by_role('button',name='复制给 AI',exact=True).tap()
        copied_ai=await mod.eval_world(cdp,world,'__stayHarness.copied')
        check('Stay: AI copy preserves author and selected reply', all(x in copied_ai for x in ['# X Capture Context','示例作者','示例读者','回复至']))
        await page.wait_for_timeout(300)
        await page.screenshot(path=str(OUT/'mobile-text.png'))
        check('Stay: phone interface has no horizontal overflow',await page.locator('.xc-studio').evaluate('(e)=>e.scrollWidth===e.clientWidth'))
        check('Stay: primary text actions meet touch size and are in viewport',await page.locator('[data-action="copy-text-format"]').evaluate('(e)=>{const r=e.getBoundingClientRect();return r.height>=44 && r.y>=0 && r.bottom<=innerHeight}'))
        # Explicitly reject clipboard writes; content must remain copyable and exportable.
        await mod.eval_world(cdp,world,"navigator.clipboard.writeText=function(){return Promise.reject(new DOMException('fixture denied','NotAllowedError'))};true")
        await page.get_by_role('button',name='复制文本',exact=True).tap()
        await page.get_by_role('heading',name='手动复制文本',exact=True).wait_for()
        fallback=await page.get_by_label('导出文本内容',exact=True).input_value()
        check('Stay: clipboard rejection reveals complete readonly manual fallback', '示例读者' in fallback and 'https://x.com/reader_test/status/93002' in fallback)
        await page.get_by_role('button',name='全选文本',exact=True).tap()
        check('Stay: fallback select-all selects complete UTF-16 text range', await page.get_by_label('导出文本内容',exact=True).evaluate('(e)=>e.selectionStart===0 && e.selectionEnd===e.value.length'))
        async with page.expect_download() as task: await page.locator('[data-action="save-text-file"]').tap()
        d=await task.value;await d.save_as(str(OUT/'stay-download.txt'))
        check('Stay: fallback text file really downloads with complete Unicode', (OUT/'stay-download.txt').read_text()==fallback)
        await page.screenshot(path=str(OUT/'mobile-copy-fallback.png'))
        await page.get_by_role('button',name='关闭文本结果',exact=True).tap()
        await page.get_by_role('button',name='导出 Markdown',exact=True).tap()
        await page.get_by_role('heading',name='文本文件已准备好',exact=True).wait_for()
        async with page.expect_download() as task: await page.locator('[data-action="save-text-file"]').tap()
        d=await task.value;await d.save_as(str(OUT/'stay-download.md'))
        check('Stay: mobile Markdown is a separate save action with exact contents', (OUT/'stay-download.md').read_text()==preview)
        await page.get_by_role('button',name='关闭文本结果',exact=True).tap()
        # Test share request contract without claiming native iOS share-sheet execution.
        await mod.eval_world(cdp,world,"""Object.defineProperty(navigator,'canShare',{configurable:true,value:data=>data.files.length===1});Object.defineProperty(navigator,'share',{configurable:true,value:data=>{__stayHarness.shared=data.files[0];__stayHarness.shareActive=navigator.userActivation.isActive;return Promise.resolve()}});true""")
        await page.get_by_role('button',name='导出 Markdown',exact=True).tap()
        await page.get_by_role('button',name='系统分享',exact=True).tap()
        share=await mod.eval_world(cdp,world,'(async()=>({name:__stayHarness.shared.name,text:await __stayHarness.shared.text(),active:__stayHarness.shareActive}))()')
        check('Stay: system-share adapter supplies the actual file under a user gesture',share['name'].endswith('.md') and share['text']==preview and share['active'])
        check('Stay: no uncaught exceptions in all text flows',not errors,errors)
        await page.close()
    finally: await browser.close()

async def main():
    report={'version':'1.0.0-rc.5','baseline':'b31ac3ab864ae481b09b1dc595d0a0a83fb70071','browser':'Chromium via Playwright; offline demo + recording clipboard/storage adapters + separate simulated Stay/GM isolated world','browserReason':'Browser plugin/skill absent; Playwright fallback. Both synthetic X and localhost navigation returned ERR_BLOCKED_BY_ADMINISTRATOR. No browser policies changed or network fallback used. Tests use set_content offline documents and explicitly recorded clipboard/storage adapters; native clipboard not verified.','checks':ROWS,'complete':False}
    try:
        async with async_playwright() as pw:
            await desktop_demo(pw); await stay_harness(pw)
        report['complete']=True
    except Exception as e:
        report['error']=str(e);raise
    finally:
        report['passed']=sum(x['passed'] for x in ROWS);report['failed']=sum(not x['passed'] for x in ROWS)
        (OUT/'text-qa.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
        print(json.dumps({k:report[k] for k in ['complete','passed','failed']}),flush=True)

if __name__=='__main__': asyncio.run(main())
