"""rc2 fix-specific offline Chromium regressions. No macOS/iOS/live-X claims.
Uses set_content only, never navigates past the browser's managed URL policies.
XC_TEST_FONT=/path/to/embeddable/cjk/font XC_QA_DIR=/tmp/xc python tests/rc2_regression.py
"""
import asyncio, os, pathlib, json, base64, sys, importlib.util, hashlib, plistlib, tempfile
from unittest.mock import patch
from PIL import Image
import fitz
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=pathlib.Path(os.environ.get('XC_QA_DIR','/tmp/xc-rc2'));OUT.mkdir(parents=True,exist_ok=True)
FONT=pathlib.Path(os.environ['XC_TEST_FONT']);checks=[]
def check(name,passed,detail=None):
    checks.append({'name':name,'passed':bool(passed),'detail':detail});print(('PASS ' if passed else 'FAIL ')+name,detail or '',flush=True)
    if not passed:raise AssertionError(name+': '+str(detail))
async def core(page):
    await page.add_script_tag(content='window.module={exports:{}};'+(ROOT/'dist/core-test.cjs').read_text()+';window.QA=module.exports;delete window.module;')
async def save_blob(page,expr,path):
    value=await page.evaluate('''async expr=>{const blob=expr.split('.').slice(1).reduce((o,k)=>o[k],window),v=new Uint8Array(await blob.arrayBuffer());let s='';for(let i=0;i<v.length;i+=16384)s+=String.fromCharCode(...v.subarray(i,i+16384));return btoa(s);}''',expr)
    path.write_bytes(base64.b64decode(value))
async def main():
  async with async_playwright() as pw:
    browser=await pw.chromium.launch(executable_path=os.environ.get('XC_BROWSER','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    try:
      page=await browser.new_page(viewport={'width':1476,'height':1023})
      page.set_default_timeout(20000)
      await page.route('http://**/*',lambda route:route.abort())
      await page.route('https://**/*',lambda route:route.abort())
      errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
      await page.set_content((ROOT/'tests/quote-fixtures.html').read_text(),wait_until='domcontentloaded');await core(page)
      await page.evaluate('''async()=>{const c=new QA.Collector({kind:'demo',probe:async ids=>QA.pageProbe(ids)});window.rcapture=await c.capture('30101');}''')
      posts=await page.evaluate('rcapture.posts')
      check('Quote capture keeps two outer posts, without quote duplication',len(posts)==2)
      check('Quote display name recovered from non-anchor UserName',posts[0]['quote']['author']['name']=='许舟')
      check('Quote avatar comes from the inner author, not main author',posts[0]['quote']['author']['avatar'].endswith('/quoted.jpg') and posts[0]['author']['avatar'].endswith('/main.jpg'))
      check('Public page props enrich missing quote permalinks',[p['quote']['url'] for p in posts]==['https://x.com/quoted_author/status/30201','https://x.com/quoted_author/status/30202'])
      check('Visible translated quote text not replaced by raw English','当前页面显示的中文翻译' in json.dumps(posts[1]['quote'],ensure_ascii=False) and 'This is the original' not in json.dumps(posts[1]['quote']))
      badge=posts[0]['quote']['author']['badge'];check('Badge preserves source viewBox, fill rule and geometry',badge['viewBox']==[0,0,22,22] and badge['paths'][0]['rule']=='evenodd' and badge['paths'][0]['color']=='#1d9bf0')
      check('Main body does not absorb quoted text or media',len(posts[0]['blocks'])==1 and len([b for b in posts[0]['quote']['blocks'] if b['kind']=='media'])==4)
      check('Handle does not concatenate neighboring timestamp digits',posts[0]['quote']['author']['handle']=='quoted_author',posts[0]['quote']['author']['handle'])
      check('Relative quote time retained',posts[0]['quote']['displayTime']=='4 小时')
      check('No like/repost actions during collection',await page.evaluate('fixtureEngagements===0'))
      # Independent browser Path2D source vs sanitized scene rendering, not recomputing the expected path.
      diff=await page.evaluate('''()=>{const svg=document.querySelector('.quote svg'),path=svg.querySelector('path').getAttribute('d');const a=document.createElement('canvas'),b=document.createElement('canvas');a.width=b.width=a.height=b.height=220;const ca=a.getContext('2d'),cb=b.getContext('2d');ca.scale(10,10);ca.fillStyle='#1d9bf0';ca.fill(new Path2D(path),'evenodd');const badge=rcapture.posts[0].quote.author.badge;const scene={width:220,height:220,commands:badge.paths.map(p=>({type:'path',x:0,y:0,size:220,path:p.path,color:p.color,fill:true,fillRule:p.rule,viewBox:badge.viewBox}))};QA.drawScene(cb,scene,new Map());const aa=ca.getImageData(0,0,220,220).data,bb=cb.getImageData(0,0,220,220).data;let delta=0;for(let i=0;i<aa.length;i++)delta+=Math.abs(aa[i]-bb[i]);return delta/(aa.length*255);}''')
      check('Rendered badge matches independent source SVG geometry',diff<0.002,{'normalizedPixelDifference':diff})
      arc_diff=await page.evaluate('''()=>{const paths=['M2 12a10 8 30 1 1 20 0a10 8 30 1 1-20 0z','M1 1q6 12 12 0t12 0','M1 20c4-12 7-12 10 0s7 12 10 0'];let worst=0;for(const raw of paths){const a=document.createElement('canvas'),b=document.createElement('canvas');a.width=b.width=a.height=b.height=400;const ca=a.getContext('2d'),cb=b.getContext('2d');for(const ctx of [ca,cb]){ctx.scale(10,10);ctx.lineWidth=.5;}ca.stroke(new Path2D(raw));cb.stroke(new Path2D(QA.absolutePath(raw)));const aa=ca.getImageData(0,0,400,400).data,bb=cb.getImageData(0,0,400,400).data;let delta=0;for(let i=0;i<aa.length;i++)delta+=Math.abs(aa[i]-bb[i]);worst=Math.max(worst,delta/(aa.length*255));}return worst;}''')
      check('Relative, smooth and arc geometry match browser reference',arc_diff<0.003,arc_diff)
      # Generate local dummy bitmaps, distinct for quote avatar and main avatar. No media requests.
      await page.evaluate('''async()=>{const c=document.createElement('canvas');c.width=200;c.height=300;const g=c.getContext('2d');const colors=['#274b78','#e4a365','#388076','#7276b0'];window.rassets=new Map();for(const src of QA.mediaSources(rcapture)){const idx=Number(src.match(/fixture-([0-9])/)?.[1]||0);g.fillStyle=src.includes('profile_images')?(src.includes('quoted')?'#b67c48':'#4264c3'):colors[idx-1];g.fillRect(0,0,200,300);g.fillStyle='#ffffff';g.font='bold 70px sans-serif';g.textAlign='center';g.fillText(src.includes('profile_images')?(src.includes('quoted')?'许':'林'):String(idx),100,170);rassets.set(src,await QA.decodeData(c.toDataURL()));}window.roptions=QA.normalizeOptions({...QA.DEFAULTS,shadow:16});window.rscene=QA.layoutCapture(rcapture,new Set(['30101','30102']),['30101','30102'],roptions,rassets,document.createElement('canvas').getContext('2d'));window.rpng=await QA.exportPNG(rscene,rassets,rcapture,new Set(['30101','30102']),roptions);}''')
      scene=await page.evaluate('rscene');quote_avatars=[c for c in scene['commands'] if c['type']=='image' and c['src'].endswith('/quoted.jpg')]
      check('Both quote headers draw actual avatar bitmaps',len(quote_avatars)==2)
      media=[c for c in scene['commands'] if c['type']=='image' and '/media/' in c['src']]
      check('Original four-column mosaic geometry retained',len(media)==4 and len({m['y'] for m in media})==1 and all(m['fit']=='cover' for m in media))
      check('Old text checkmark removed from scene',not any(c['type']=='text' and c['text']=='✓' for c in scene['commands']))
      await save_blob(page,'window.rpng',OUT/'quotes.png')
      png=Image.open(OUT/'quotes.png');png.load()
      check('PNG root Source field is exact individual permalink',png.info['Source']=='https://x.com/demo_author/status/30101' and png.info['SourceURL']==png.info['Source'])
      check('PNG XMP includes both quoted permalinks','https://x.com/quoted_author/status/30202' in png.info['XML:com.adobe.xmp'])
      check('PNG output uses actual 2x pixels',png.size==(scene['width']*2,scene['height']*2),png.size)
      font=base64.b64encode(FONT.read_bytes()).decode()
      await page.evaluate('''async b=>{window.rfont=Uint8Array.from(atob(b),x=>x.charCodeAt(0));window.rpdf=await QA.exportPDF(rscene,rassets,rcapture,new Set(['30101','30102']),roptions,rfont);}''',font)
      await save_blob(page,'window.rpdf',OUT/'quotes.pdf');doc=fitz.open(OUT/'quotes.pdf');text=doc[0].get_text()
      check('PDF quoted Chinese body remains selectable text',all(s in text for s in ['引用帖不是一段蓝色链接','许舟','当前页面显示的中文翻译']),text[:250])
      check('PDF has actual embedded font and vector badge paths',bool(doc[0].get_fonts()) and len(doc[0].get_drawings())>10)
      check('PDF has clickable quote permalink annotations',any(l.get('uri')=='https://x.com/quoted_author/status/30201' for l in doc[0].get_links()))
      check('PDF still a single long page',len(doc)==1)
      doc[0].get_pixmap(matrix=fitz.Matrix(1.333333,1.333333)).save(OUT/'quotes-pdf-render.png');doc.close()
      # Invalid/missing metadata never makes up a source URL; untouched localized content remains visible.
      await page.evaluate('''()=>{document.querySelector('[data-post-id="30101"]').__reactProps$fixture={};document.querySelector('[data-post-id="30102"]').__reactProps$fixture={};}''')
      missing=await page.evaluate('QA.collectDOM()[0].quote')
      check('Missing link retains complete visible quote with explicit warning',not missing['url'] and len(missing['blocks'])==5 and any('链接未识别' in w for w in missing['warnings']))
      # Real editor preset/wallpaper path and on-device share feature detection.
      await page.set_content((ROOT/'dist/X-Capture-Studio-Demo.html').read_text());await page.get_by_role('dialog',name='X Capture 编辑器').wait_for();await page.wait_for_timeout(600)
      check('Expanded background palette is usable',await page.locator('.xc-swatch').count()>=15)
      # Small local fixture for an import, no photo assets and no font packaged.
      fixture=Image.new('RGB',(320,200),'#205d91');fixture.paste('#b8d2e4',(160,0,320,200));fixture.save(OUT/'wallpaper-fixture.png')
      await page.get_by_label('选择背景图片',exact=True).set_input_files(OUT/'wallpaper-fixture.png');await page.wait_for_timeout(500)
      check('Local wallpaper import selects image background',await page.evaluate("XCapture.studio.options.background==='image'&&XCapture.studio.options.bgImage.startsWith('data:image/jpeg;base64,')"))
      await page.get_by_label('背景柔化数值',exact=True).fill('12');await page.get_by_label('背景柔化数值',exact=True).dispatch_event('change')
      await page.get_by_label('背景压暗数值',exact=True).fill('15');await page.get_by_label('背景压暗数值',exact=True).dispatch_event('change')
      await page.get_by_label('背景纹理',exact=True).select_option('grid');await page.wait_for_timeout(500)
      check('Wallpaper softness, overlay and grid actually alter scene',await page.evaluate("XCapture.studio.scene.commands.some(c=>c.type==='image'&&c.blur===12)&&XCapture.studio.scene.commands.some(c=>c.type==='rect'&&c.alpha===.15)"))
      await page.evaluate('''()=>Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>{throw Error('Unsupported')}})''')
      await page.get_by_role('button',name='导出 PNG',exact=True).click();await page.get_by_role('heading',name='高清图片已生成').wait_for();await save_blob(page,'window.XCapture.studio.lastResult.blob',OUT/'wallpaper.png')
      wp=Image.open(OUT/'wallpaper.png');wp.load();check('PNG genuinely contains imported backdrop, not flat fill',wp.getpixel((6,6))!=wp.getpixel((wp.width-7,6)))
      check('Broken canShare does not break result dialog',await page.get_by_role('button',name='保存文件',exact=True).count()==1)
      await page.get_by_role('button',name='关闭导出结果',exact=True).click()
      await page.get_by_role('tab',name='高级',exact=True).click();await page.locator('summary').filter(has_text='PDF 与字体').click()
      await page.get_by_label('导入 PDF 字体',exact=True).set_input_files(FONT);await page.wait_for_timeout(300)
      await page.get_by_role('button',name='导出 PDF',exact=True).click();await page.get_by_role('heading',name='文本型 PDF 已生成').wait_for(timeout=50000);await save_blob(page,'window.XCapture.studio.lastResult.blob',OUT/'wallpaper.pdf')
      doc=fitz.open(OUT/'wallpaper.pdf');check('Wallpaper PDF retains vector text plus raster backdrop','好的内容' in doc[0].get_text() and len(doc[0].get_images())>0);doc[0].get_pixmap(matrix=fitz.Matrix(1,1)).save(OUT/'wallpaper-pdf-render.png');doc.close()
      await page.get_by_role('button',name='关闭导出结果',exact=True).click()
      # Show a quote screenshot through the actual studio with in-memory decoded assets.
      await page.evaluate('''async cap=>{
        const make=(src)=>{const c=document.createElement('canvas');c.width=200;c.height=300;const g=c.getContext('2d'),i=Number(src.match(/fixture-([0-9])/)?.[1]||0);g.fillStyle=src.includes('profile_images')?(src.includes('quoted')?'#b58056':'#4264c3'):['#274b78','#e4a365','#388076','#7276b0'][i-1];g.fillRect(0,0,200,300);g.fillStyle='white';g.font='bold 65px sans-serif';g.textAlign='center';g.fillText(i?String(i):src.includes('quoted')?'许':'林',100,170);return c.toDataURL();};
        const walk=p=>{if(p.author.avatar)p.author.avatar=make(p.author.avatar);for(const b of p.blocks){if(b.kind==='media')b.media.src=make(b.media.src);if(b.kind==='embed')walk(b.post);}if(p.quote)walk(p.quote);};
        cap.posts.forEach(walk);await XCapture.openCapture(cap);XCapture.studio.update({background:'gradient',bgImage:'',bg1:'#647bee',bg2:'#7950ab',bgPattern:'none',bgDim:0,bgBlur:0,scale:2});
      }''',{'rootId':'30101','posts':posts,'sourceUrl':'https://x.com/demo_author/status/30101','capturedAt':'2026-09-25T04:30:00Z','collectionNotes':['虚构回归样例']})
      await page.get_by_role('tab',name='外观',exact=True).click();await page.wait_for_timeout(7000);await page.screenshot(path=str(OUT/'desktop-quotes.png'))
      check('Desktop: no runtime exceptions in new flows',not errors,errors)
      # Lifecycle failure regressions against the production userscript, no demo-only entry.
      await asyncio.wait_for(browser.close(),20)
      browser=await pw.chromium.launch(executable_path=os.environ.get('XC_BROWSER','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
      script=(ROOT/'dist/X-Capture-Studio.user.js').read_text()
      for case in ['no-body','stale-marker','removed-launcher','replaced-body','missing-observers','throwing-gm-menu','never-resolving-gm','reinjected']:
        print('START Stay lifecycle: '+case,flush=True)
        m=await asyncio.wait_for(browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True),15);errs=[];m.on('pageerror',lambda e:errs.append(str(e)));m.on('dialog',lambda d:d.accept())
        m.set_default_timeout(12000)
        await m.route('http://**/*',lambda route:route.abort())
        await m.route('https://**/*',lambda route:route.abort())
        await m.set_content((ROOT/'tests/fixtures.html').read_text(),wait_until='domcontentloaded')
        await m.add_script_tag(content="window.GM_getValue=(k,d)=>d;window.GM_setValue=()=>{};window.GM_registerMenuCommand=()=>{};window.unsafeWindow=window;")
        if case=='no-body':await m.evaluate('()=>document.body.remove()')
        if case=='stale-marker':await m.evaluate("()=>document.documentElement.dataset.xCaptureAttached='1.0.0-rc.1'")
        if case=='missing-observers':await m.evaluate('()=>{window.ResizeObserver=undefined;window.IntersectionObserver=undefined;}')
        if case=='never-resolving-gm':await m.evaluate('()=>{window.GM_getValue=()=>new Promise(()=>{});}')
        if case=='throwing-gm-menu':await m.evaluate("()=>{window.GM_registerMenuCommand=()=>{throw Error('GM unavailable')};}")
        await m.add_script_tag(content=script)
        if case=='no-body':await m.evaluate('()=>document.documentElement.append(document.createElement("body"))')
        if case=='removed-launcher':await m.locator('[data-xcapture-ui="launcher"]').evaluate('n=>n.remove()')
        if case=='replaced-body':await m.evaluate('()=>{const b=document.body.cloneNode(true);document.body.replaceWith(b);}')
        if case=='reinjected':await m.add_script_tag(content=script)
        await m.wait_for_timeout(700)
        check('Stay lifecycle: '+case,await m.locator('[data-xcapture-ui="launcher"]').count()==1 and not errs,errs)
        box=await m.get_by_role('button',name='打开 X Capture',exact=True).bounding_box()
        check('Stay visible entry above mobile bottom bars: '+case,box and box['y']+box['height']<780 and box['x']>=0,box)
        if case in ['missing-observers','throwing-gm-menu','never-resolving-gm','reinjected']:
          # Playwright's scroll/actionability uses IntersectionObserver itself.
          # In the deliberately missing-API case exercise the same click handler directly.
          if case=='missing-observers':await m.get_by_role('button',name='打开 X Capture',exact=True).evaluate('b=>b.click()')
          else:await m.get_by_role('button',name='打开 X Capture',exact=True).tap()
          await m.get_by_role('dialog',name='X Capture 编辑器').wait_for()
          check('Stay opens despite '+case,await m.locator('.xc-preview canvas').count()>0 and not errs)
          if case=='missing-observers':await m.screenshot(path=str(OUT/'mobile-editor.png'))
        if case=='stale-marker':await m.screenshot(path=str(OUT/'mobile-entry.png'))
        await asyncio.wait_for(m.close(),15)
        print('END Stay lifecycle: '+case,flush=True)
    finally:
      await asyncio.wait_for(browser.close(),20)
  # Optional macOS helper: independent extraction on real exported bytes + mocked xattr write.
  spec=importlib.util.spec_from_file_location('finder_source',ROOT/'tools/macos/finder_source.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
  expected=['https://x.com/demo_author/status/30101','https://x.com/demo_author/status/30102','https://x.com/quoted_author/status/30201','https://x.com/quoted_author/status/30202']
  check('Finder helper extracts original source from PNG bytes',mod.sources_from_bytes((OUT/'quotes.png').read_bytes())==expected)
  check('Finder helper extracts original source from PDF XMP',mod.sources_from_bytes((OUT/'quotes.pdf').read_bytes())==expected)
  attrs={mod.ATTRIBUTE:plistlib.dumps(['https://x.com/'])};old=dict(attrs)
  with tempfile.TemporaryDirectory() as tmp:
    path=pathlib.Path(tmp)/'capture.png';path.write_bytes((OUT/'quotes.png').read_bytes());before=hashlib.sha256(path.read_bytes()).hexdigest();writes=[]
    def getx(path,k):return attrs[k]
    def setx(path,k,v):writes.append(k);attrs[k]=v
    with patch.object(mod.os,'getxattr',getx),patch.object(mod.os,'setxattr',setx):
      mod.apply_sources(path,expected);check('Helper writes only WhereFroms and leaves file bytes intact',set(writes)=={mod.ATTRIBUTE} and hashlib.sha256(path.read_bytes()).hexdigest()==before)
      mod.restore(path);check('Helper restores old attribute from recovery record',attrs==old)
  report={'version':'1.0.0-rc.2','environment':'Offline Chromium + synthetic DOM + independent PNG/PDF parsing; mocked macOS xattr. No Safari/Stay device, macOS Finder or live-X test.','checks':checks,'passed':sum(c['passed'] for c in checks),'failed':sum(not c['passed'] for c in checks)}
  (OUT/'rc2-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps({'passed':report['passed'],'failed':report['failed']}))
if __name__=='__main__':asyncio.run(main())
