"""Offline browser + exported-file integration tests.

Uses bundled local HTML and synthetic DOM fixtures, not a live X account.
Requires Python: playwright, Pillow, PyMuPDF. Chromium executable and an
independently obtained, embeddable CJK font are explicit environment inputs.
No font file is included in the source or release package.

  XC_BROWSER=/path/to/chromium XC_TEST_FONT=/path/to/font.otf \
  XC_QA_DIR=/tmp/x-capture-qa python tests/browser_qa.py
"""
import os, asyncio, json, base64, pathlib, struct, zlib
from PIL import Image
import fitz
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=pathlib.Path(os.environ.get('XC_QA_DIR','/tmp/x-capture-qa')); OUT.mkdir(parents=True,exist_ok=True)
FONT=os.environ.get('XC_TEST_FONT')
BROWSER=os.environ.get('XC_BROWSER','/usr/bin/chromium')
checks=[]
def check(name,passed,detail=None):
    checks.append({'name':name,'passed':bool(passed),'detail':detail})
    print(('PASS ' if passed else 'FAIL ')+name,detail or '')
    if not passed: raise AssertionError(name+': '+str(detail))
async def core(page):
    js=(ROOT/'dist/core-test.cjs').read_text()
    await page.add_script_tag(content='window.module={exports:{}};'+js+';window.QA=module.exports;delete window.module;')
async def get_blob(page,expr='window.XCapture.studio.lastResult.blob'):
    return base64.b64decode(await page.evaluate('''async expr=>{const blob=expr.split('.').slice(1).reduce((o,k)=>o[k],window); const a=new Uint8Array(await blob.arrayBuffer());let s='';for(let i=0;i<a.length;i+=16384)s+=String.fromCharCode(...a.subarray(i,i+16384));return btoa(s);}''',expr))
async def dump_blob(page,path,expr='window.XCapture.studio.lastResult.blob'):
    b=await get_blob(page,expr);path.write_bytes(b);return b
async def demo(page):
    await page.set_content((ROOT/'dist/X-Capture-Studio-Demo.html').read_text())
    await page.get_by_role('dialog',name='X Capture 编辑器').wait_for()
    await page.wait_for_timeout(800)
async def close_result(page):
    await page.get_by_role('button',name='关闭导出结果',exact=True).click()
async def png_check(path,expected):
    im=Image.open(path);im.load();check(path.name+' pixel dimensions',im.size==tuple(expected),list(im.size))
    data=path.read_bytes();i=8;order=[]
    while i+12<=len(data):
        n=struct.unpack('>I',data[i:i+4])[0];key=data[i+4:i+8];pay=data[i+8:i+8+n];crc=struct.unpack('>I',data[i+8+n:i+12+n])[0]
        if zlib.crc32(key+pay)&0xffffffff!=crc:raise AssertionError('PNG CRC '+key.decode())
        order.append(key.decode());i+=12+n
    check(path.name+' chunk CRCs and pHYs placement',order.index('pHYs')<order.index('IDAT'))
    return im
async def main():
    async with async_playwright() as pw:
        browser=await pw.chromium.launch(executable_path=BROWSER,headless=True,args=['--no-sandbox'])
        page=await browser.new_page(viewport={'width':1476,'height':1023},device_scale_factor=1)
        await page.route('http://**/*',lambda route:route.abort())
        await page.route('https://**/*',lambda route:route.abort())
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('dialog',lambda d:d.accept('测试预设' if d.type=='prompt' else None))
        # DOM extraction and page-prop adapter with synthetic records.
        await page.set_content((ROOT/'tests/fixtures.html').read_text(),wait_until='domcontentloaded');await core(page)
        posts=await page.evaluate('QA.collectDOM()')
        check('DOM: four outer posts, quoted post not duplicated',len(posts)==4,len(posts))
        p=posts[0];check('DOM: main identity is not quoted author',p['author']['handle']=='fixture_author')
        check('DOM: own rich body excludes quote body','引用原文' not in ''.join(r['text'] for b in p['blocks'] if b['kind']=='text' for r in b['runs']))
        check('DOM: quote body and source recovered',p['quote']['id']=='90999')
        check('DOM: rich emphasis retained',any(r.get('bold') for b in p['blocks'] if b['kind']=='text' for r in b['runs']))
        check('DOM: poll percentages and community note',p['poll']['options'][0]['percent']==65 and '背景说明' in p['note'])
        check('DOM: stats retained, not guessed',p['metrics']=={'replies':'12','reposts':'4','likes':'45','views':'2,100'},p['metrics'])
        check('DOM: folded text explicitly flagged',any('正文可能折叠' in w for w in posts[3]['warnings']))
        probe=await page.evaluate('QA.pageProbe(["90004"])')
        check('Probe: explicit parent and full text read',probe[0]['parentId']=='90002' and '最后一段' in probe[0]['fullText'])
        check('Probe: unrelated sensitive prop excluded','TOKEN' not in json.dumps(probe) and 'auth_token' not in json.dumps(probe))
        merged=await page.evaluate('''async()=>{const c=new QA.Collector({kind:'demo',probe:async ids=>QA.pageProbe(ids)});return c.scan();}''')
        check('Collector: full text replaces visible truncation',any('最后一段' in r['text'] for b in merged[3]['blocks'] if b['kind']=='text' for r in b['runs']))
        check('Collector: folded warning cleared only after replacement',not any('正文可能折叠' in w for w in merged[3]['warnings']))
        chain=await page.evaluate('''async()=>{const c=new QA.Collector({kind:'demo',probe:async ids=>QA.pageProbe(ids)});const posts=await c.scan();return [...QA.authorChain({posts,rootId:'90001'})];}''')
        check('Collector: actual relation connects author continuation',set(chain)=={'90001','90002','90004'},chain)
        # Read-only nature: original buttons stay intact.
        check('DOM parser: no engagement action performed',await page.locator('[data-testid="like"]').count()==4)
        await page.set_content((ROOT/'tests/article-fixture.html').read_text(),wait_until='domcontentloaded');await core(page)
        art=await page.evaluate('QA.parseArticle()');kinds=[b['kind'] for b in art['blocks']]
        check('Article: title, source and body detected',art['title']=='完整长文与上下文' and art['id']=='92001')
        check('Article: author is not an embedded-post author',art['author']['handle']=='article_author' and art.get('published') is None,art['author'])
        check('Article: embedded post not duplicated as outer candidate',len(await page.evaluate('QA.collectDOM()'))==1)
        check('Article: headings, list, code and embed retained',all([any(b.get('level')==2 for b in art['blocks']),any(b.get('list') for b in art['blocks']),any(b.get('code') for b in art['blocks']),'embed' in kinds]))
        check('Article: final paragraph retained','文章最后一段不能被截断' in art['blocks'][-1]['runs'][0]['text'])
        # Studio controls and actual PNG/PDF generation.
        await demo(page);await page.screenshot(path=str(OUT/'desktop.png'))
        initial=await page.evaluate('({width:XCapture.studio.scene.width,height:XCapture.studio.scene.height,selected:[...XCapture.studio.selected],cards:XCapture.studio.scene.cards.length})')
        check('Studio: live cards render with three author posts',initial['cards']==3,initial)
        check('Studio: no white browser focus outline',await page.locator('.xc-studio').evaluate("n=>getComputedStyle(n).outlineStyle")=='none')
        await page.get_by_role('button',name='背景：薄荷',exact=True).click();await page.wait_for_timeout(180)
        check('Studio: background changes actual scene',await page.evaluate("XCapture.studio.options.bg1==='#43dbaa'"))
        await page.get_by_role('button',name='背景：鸢尾紫',exact=True).click()
        await page.get_by_role('button',name='3×',exact=True).click();await page.wait_for_timeout(100)
        check('Studio: resolution multiplier updates',await page.evaluate('XCapture.studio.options.scale===3'))
        await page.get_by_role('button',name='2×',exact=True).click()
        await page.get_by_role('tab',name='内容',exact=True).click()
        await page.get_by_role('button',name='全部候选',exact=True).click()
        check('Selection: include nonauthor contextual reply',await page.evaluate('XCapture.studio.selected.size===4'))
        await page.get_by_role('button',name='上移 1000000000000000004',exact=True).click()
        check('Selection: manual order changes scene',await page.evaluate("XCapture.studio.scene.cards[2].id==='1000000000000000004'"))
        await page.get_by_role('button',name='作者串',exact=True).click()
        check('Selection: author rule excludes nonauthor again',await page.evaluate("!XCapture.studio.selected.has('1000000000000000004')"))
        # Restore exact normal order before export.
        await page.evaluate("XCapture.studio.order=XCapture.studio.capture.posts.map(p=>p.id);XCapture.studio.update({})")
        await page.get_by_role('tab',name='外观',exact=True).click();await page.wait_for_timeout(7000)
        await page.screenshot(path=str(OUT/'desktop.png'))
        await page.get_by_role('button',name='导出 PNG',exact=True).click()
        await page.get_by_role('heading',name='高清图片已生成').wait_for(timeout=30000)
        await dump_blob(page,OUT/'sample.png');im=await png_check(OUT/'sample.png',[initial['width']*2,initial['height']*2])
        md=json.loads(im.info['XCapture']);check('PNG: selected original URLs embedded',len(md['sources'])==3 and '1000000000000000001' in im.info['SourceURL'])
        await close_result(page)
        await page.get_by_role('tab',name='高级',exact=True).click();await page.locator('summary').filter(has_text='PDF 与字体').click()
        if not FONT:raise RuntimeError('XC_TEST_FONT must point to a licensed CJK font, not included in package')
        await page.get_by_label('导入 PDF 字体',exact=True).set_input_files(FONT);await page.wait_for_timeout(600)
        await page.get_by_role('button',name='导出 PDF',exact=True).click()
        await page.get_by_role('heading',name='文本型 PDF 已生成').wait_for(timeout=40000)
        await dump_blob(page,OUT/'sample.pdf');await close_result(page)
        pdf=fitz.open(OUT/'sample.pdf');text=''.join(p.get_text() for p in pdf)
        check('PDF: single page, real extracted Chinese text',len(pdf)==1 and '好的内容，值得被完整保存' in text and '此处是演示数据，可以放心试调参数。' in text,{'pages':len(pdf),'characters':len(text)})
        check('PDF: embedded CID font, selectable text not page bitmap',len(pdf[0].get_fonts())>0 and any(f[2]=='Type0' for f in pdf[0].get_fonts()))
        check('PDF: metadata and clickable original links',len(pdf[0].get_links())>=3 and '1000000000000000001' in pdf.metadata['subject'])
        pdf[0].get_pixmap(matrix=fitz.Matrix(1.5,1.5)).save(OUT/'sample-pdf-render.png');pdf.close()
        # Transparency and privacy roundtrip.
        await page.get_by_role('tab',name='外观',exact=True).click();await page.get_by_role('button',name='背景：透明',exact=True).click()
        await page.get_by_label('隐藏作者身份',exact=True).check();await page.wait_for_timeout(200)
        await page.get_by_role('button',name='导出 PNG',exact=True).click();await page.get_by_role('heading',name='高清图片已生成').wait_for(timeout=30000)
        await dump_blob(page,OUT/'anonymous.png');anon=Image.open(OUT/'anonymous.png');anon.load()
        check('PNG: transparent canvas preserved',anon.mode=='RGBA' and anon.getpixel((0,0))[3]==0)
        check('PNG: anonymous file omits original source URLs',not json.loads(anon.info['XCapture'])['sources'] and 'SourceURL' not in anon.info)
        await close_result(page)
        await page.get_by_role('button',name='导出 PDF',exact=True).click();await page.get_by_role('heading',name='文本型 PDF 已生成').wait_for(timeout=40000)
        await dump_blob(page,OUT/'anonymous.pdf');await close_result(page)
        doc=fitz.open(OUT/'anonymous.pdf');check('PDF: anonymous export has no backlink annotations',not doc[0].get_links() and 'demo_author' not in doc[0].get_text() and 'demo_author' not in doc.metadata['subject']);doc.close()
        # Article export through shared core, with in-memory synthetic media.
        await core(page)
        await page.evaluate('s=>QA.useMemoryFont(Uint8Array.from(atob(s),c=>c.charCodeAt(0)))',base64.b64encode(pathlib.Path(FONT).read_bytes()).decode())
        await page.evaluate('''async art=>{
          const c=document.createElement('canvas');c.width=600;c.height=360;const g=c.getContext('2d');g.fillStyle='#dae5ef';g.fillRect(0,0,600,360);g.fillStyle='#243d5b';g.font='32px sans-serif';g.fillText('MEDIA DISPLAY FIXTURE',52,180);
          const src=c.toDataURL('image/png');
          art.blocks.splice(2,0,{kind:'media',media:{kind:'image',src,alt:'测试媒体显示'}});
          art.blocks.splice(4,0,{kind:'media',media:{kind:'video',src,alt:'视频封面',duration:'1:23',href:art.url}});
          const capture={rootId:art.id,posts:[art],sourceUrl:art.url,capturedAt:'2026-09-25T00:00:00Z',collectionNotes:[]};
          const a=new Map();await QA.loadAssets(capture,{kind:'demo'},a);window.mixedAssets=a;window.mixedCapture=capture;
          const o=QA.normalizeOptions({...QA.DEFAULTS,showSource:true,showQR:true});const s=QA.layoutCapture(capture,new Set([art.id]),[art.id],o,a,document.createElement('canvas').getContext('2d'));window.mixedScene=s;
          window.mixedPDF=await QA.exportPDF(s,a,capture,new Set([art.id]),o,await QA.loadPdfFont({kind:'demo'}),()=>{});
        }''',art)
        await dump_blob(page,OUT/'article.pdf','window.mixedPDF')
        doc=fitz.open(OUT/'article.pdf');text=''.join(p.get_text() for p in doc)
        check('Article PDF: final paragraph, code, embed and media label survive',all(t in text for t in ['文章最后一段不能被截断','console.log','嵌入帖子内容应保留作者与来源','1:23']),text[-200:])
        check('Article PDF: displays media and retains links',len(doc[0].get_images())>=1 and len(doc[0].get_links())>=3)
        doc[0].get_pixmap(matrix=fitz.Matrix(1,1)).save(OUT/'article-render.png');doc.close()
        # Very long one-page PDF / UserUnit; no giant canvas used.
        await page.evaluate('''async()=>{
          const root=XCapture.studio.capture.posts[0];const posts=Array.from({length:110},(_,i)=>({...root,id:String(80000+i),url:'https://x.com/long_fixture/status/'+(80000+i),author:{name:'长页测试',handle:'long_fixture'},parentId:i?String(79999+i):undefined,blocks:[{kind:'text',runs:[{text:'第'+(i+1)+'条。中文长页回归。\\n'.repeat(14)}]}]}));
          posts[109].blocks.push({kind:'text',runs:[{text:'LONG-PDF-END-110'}]});
          const cap={rootId:posts[0].id,posts,sourceUrl:posts[0].url,capturedAt:'2026-09-25T00:00:00Z',collectionNotes:[]};const ids=posts.map(p=>p.id),o=QA.normalizeOptions({...QA.DEFAULTS,shadow:0});
          const s=QA.layoutCapture(cap,new Set(ids),ids,o,new Map(),document.createElement('canvas').getContext('2d'));window.longScene=s;
          window.longPDF=await QA.exportPDF(s,new Map(),cap,new Set(ids),o,await QA.loadPdfFont({kind:'demo'}),()=>{});
        }''')
        await dump_blob(page,OUT/'long.pdf','window.longPDF');doc=fitz.open(OUT/'long.pdf');text=doc[0].get_text()
        check('Long PDF: one page with last post preserved',len(doc)==1 and 'LONG-PDF-END-110' in text,{'width':doc[0].rect.width,'height':doc[0].rect.height,'textChars':len(text)})
        check('Long PDF: UserUnit used for beyond-standard page height','UserUnit' in doc.xref_object(doc[0].xref));doc.close()
        check('Browser: no JavaScript exceptions',not errors,errors)
        # Responsive UI at a phone viewport. This is Chromium emulation, NOT iOS.
        mobile=await browser.new_page(viewport={'width':390,'height':844},device_scale_factor=3,is_mobile=True,has_touch=True,user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')
        me=[];mobile.on('pageerror',lambda e:me.append(str(e)));await demo(mobile)
        await mobile.screenshot(path=str(OUT/'mobile.png'))
        bounds=await mobile.locator('.xc-studio').bounding_box();check('Mobile: editor fits phone width',bounds['width']<=390,bounds)
        box=await mobile.get_by_role('button',name='导出 PNG',exact=True).bounding_box();check('Mobile: export is reachable in viewport',box['y']+box['height']<=844,box)
        await mobile.get_by_role('tab',name='内容',exact=True).tap();await mobile.get_by_role('button',name='全部候选',exact=True).tap()
        check('Mobile: touch selection changes content',await mobile.evaluate('XCapture.studio.selected.size===4'))
        await mobile.get_by_role('tab',name='高级',exact=True).tap();await mobile.get_by_label('版式宽度数值',exact=True).fill('500');await mobile.get_by_label('版式宽度数值',exact=True).dispatch_event('change');await mobile.wait_for_timeout(120)
        check('Mobile: exact numeric style control updates layout',await mobile.evaluate('XCapture.studio.scene.width===500'))
        await mobile.get_by_role('button',name='关闭编辑器',exact=True).tap()
        check('Mobile: close restores document scrolling',await mobile.evaluate("document.documentElement.style.overflow===''") and not me)
        # Self-contained production userscript with a simulated GM host.
        stay=await browser.new_page(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True)
        se=[];stay.on('pageerror',lambda e:se.append(str(e)));stay.on('dialog',lambda d:d.accept())
        await stay.set_content((ROOT/'tests/fixtures.html').read_text())
        await stay.add_script_tag(content="window.GM_getValue=(k,d)=>window.__values?.[k]??d;window.GM_setValue=(k,v)=>(window.__values??={})[k]=v;window.GM_registerMenuCommand=(n,f)=>window.__menu=f;window.unsafeWindow=window;")
        await stay.add_script_tag(content=(ROOT/'dist/X-Capture-Studio.user.js').read_text())
        check('Userscript: camera injected into each outer post',await stay.locator('[data-xcapture-ui="button"]').count()==4)
        await stay.locator('[data-xcapture-ui="button"]').first.tap();await stay.get_by_role('dialog',name='X Capture 编辑器').wait_for();await stay.wait_for_timeout(200)
        check('Userscript: production entry opens studio and reads props','3 条 / 4 条候选' in (await stay.locator('.xc-counter').text_content()))
        await stay.get_by_role('button',name='背景：薄荷',exact=True).tap()
        check('Userscript: preferences use GM storage',await stay.evaluate("__values.options.bg1==='#43dbaa'"))
        await stay.get_by_role('button',name='导出 PNG',exact=True).tap();await stay.get_by_role('heading',name='高清图片已生成').wait_for(timeout=30000)
        check('Userscript: production code actually exports PNG',await stay.locator('.xc-result-preview').evaluate('n=>n.naturalWidth>0'))
        check('Userscript: no runtime exceptions',not se,se)
        await browser.close()
    report={'version':'1.0.0-rc.2','testDate':'2026-09-25','method':'Local Chromium set_content + synthetic fixtures. No live X, installed-extension, Safari or Stay device verification.','checks':checks,'passed':sum(c['passed'] for c in checks),'failed':sum(not c['passed'] for c in checks)}
    (OUT/'browser-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps({'passed':report['passed'],'failed':report['failed']},ensure_ascii=False))
if __name__=='__main__':asyncio.run(main())
