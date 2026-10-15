"""Production Chromium bundles/Stay userscript with fake Chrome/GM API boundary.
Synthetic DOM, controlled fetch and webRequest events, not actual X/iOS. No login.
Browser plugin absent; use Playwright. No private browsing history or credentials.
"""
import asyncio,base64,io,json,os,pathlib,importlib.util
from PIL import Image
from playwright.async_api import async_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=pathlib.Path(os.environ.get('XC_DISCOVERY_QA_DIR','/tmp/xc-discovery-qa'));OUT.mkdir(parents=True,exist_ok=True)
checks=[]
def check(name,ok,details=None):
 row={'name':name,'passed':bool(ok)}
 if details is not None:row['details']=details
 checks.append(row);print(('PASS ' if ok else 'FAIL ')+name,flush=True)
 if not ok:raise AssertionError(name)
PAGE='https://x.com/discovery_test/status/880010'
POSTER='https://pbs.twimg.com/amplify_video_thumb/880001/img/test.jpg'
HLS='https://video.twimg.com/amplify_video/880001/pl/master.m3u8?tag=29'
MP4='https://video.twimg.com/amplify_video/880001/vid/1280x720/test.mp4'
OTHER='https://video.twimg.com/amplify_video/880009/pl/other.m3u8'
MASTER='#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=2400000,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2",CLOSED-CAPTIONS=NONE\n720.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=700000,RESOLUTION=640x360,CODECS="avc1.4d001e,mp4a.40.2",CLOSED-CAPTIONS=NONE\n360.m3u8\n'
CHILD='#EXTM3U\n#EXT-X-TARGETDURATION:7\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:7,\nseg0.ts\n#EXT-X-ENDLIST\n'
HTML=f'''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Discovery QA · synthetic post</title><style>body{{font:17px Arial;margin:30px;background:#f0f3f7}}article{{background:white;padding:20px;width:min(560px,85vw)}}video{{width:320px;height:180px}}button{{padding:10px}}[data-testid="User-Name"]{{display:flex;gap:15px}}</style></head><body><main><article data-testid="tweet" data-post-id="880010"><div data-testid="User-Name"><a href="https://x.com/discovery_test">Example author</a><a href="https://x.com/discovery_test">@discovery_test</a></div><a href="{PAGE}"><time datetime="2026-10-16T00:00:00Z">Today</time></a><div data-testid="tweetText"><span>原文 A。视频前的文字。</span><video poster="{POSTER}" muted></video><span>原文 B。视频后的文字。</span></div><div role="group"><button data-testid="like">1</button><button data-testid="reply">0</button></div></article></main><button id="play" onclick="document.dispatchEvent(new Event('qa-play'))">播放本地测试视频</button><button id="cue" onclick="document.dispatchEvent(new Event('qa-cue'))">加载本地字幕 Cue</button></body></html>'''
buf=io.BytesIO();Image.new('RGB',(80,45),(180,180,180)).save(buf,format='PNG');PIX=base64.b64encode(buf.getvalue()).decode()
PRELUDE=r'''
globalThis.__qa={messages:[],requests:[],clipboard:'',memory:{},session:{},events:0,cue:false,permission:true,createdTabs:[],grants:0};
const ve=document.querySelector('video');
Object.defineProperties(ve,{currentSrc:{get:()=>__qa.current||'blob:synthetic-only'},videoWidth:{get:()=>320},videoHeight:{get:()=>320},readyState:{get:()=>2},duration:{get:()=>7},textTracks:{get:()=>[{id:'',kind:'captions',language:'',label:'',mode:'disabled',cues:__qa.cue?[{text:'test cue'}]:null}]}});
document.addEventListener('qa-cue',()=>{__qa.cue=true;});
const pic=Uint8Array.from(atob('__PIX__'),c=>c.charCodeAt(0));
globalThis.fetch=async function(url,opt={}){url=String(url);__qa.requests.push({url,method:opt.method||'GET'});
 if(url.startsWith('https://pbs.twimg.com/'))return new Response(pic,{status:200,headers:{'Content-Type':'image/png'}});
 if(url==='__HLS__')return new Response(__MASTER__,{status:200,headers:{'Content-Type':'application/vnd.apple.mpegurl'}});
 if(url.endsWith('/720.m3u8')||url.endsWith('/360.m3u8'))return new Response(__CHILD__,{status:200,headers:{'Content-Type':'application/vnd.apple.mpegurl'}});
 if(url==='__MP4__')return new Response(null,{status:200,headers:{'Content-Type':'video/mp4'}});
 throw Error('QA request blocked');
};
Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async s=>{__qa.clipboard=s;},write:async items=>{__qa.clipboard=await(await items[0].getType('text/plain')).text();}}});
function bus(){const fns=[];return {fns,addListener(fn){fns.push(fn);},removeListener(fn){const i=fns.indexOf(fn);if(i>=0)fns.splice(i,1);},emit(...a){for(const f of fns)f(...a);}};}
'''.replace('__PIX__',PIX).replace('__HLS__',HLS).replace('__MP4__',MP4).replace('__MASTER__',json.dumps(MASTER)).replace('__CHILD__',json.dumps(CHILD))
CHROME=r'''
const message=bus();globalThis.chrome={runtime:{id:'synthetic-extension',getURL:p=>'chrome-extension://synthetic-extension/'+p,onMessage:message,
 sendMessage:m=>new Promise(resolve=>{__qa.messages.push(m.type);let responded=false,async=false;for(const f of message.fns){const a=f(m,{id:'synthetic-extension',frameId:0,documentId:'fixture-doc',url:'__PAGE__',tab:{id:7,url:'__PAGE__'}},r=>{responded=true;resolve(r);});async=async||a===true;}if(!responded&&!async)resolve({ok:false});})},
 storage:{local:{get:async k=>({[k]:__qa.memory[k]}),set:async o=>Object.assign(__qa.memory,o)},session:{get:async k=>({[k]:__qa.session[k]}),set:async o=>Object.assign(__qa.session,structuredClone(o)),remove:async k=>{delete __qa.session[k];}}},
 permissions:{contains:async()=>__qa.permission,request:async()=>{__qa.grants++;return __qa.permission;},onAdded:bus(),onRemoved:bus()},
 webRequest:{onBeforeRequest:bus(),onResponseStarted:bus(),onErrorOccurred:bus()},
 tabs:{onRemoved:bus(),onUpdated:bus(),create:async o=>{__qa.createdTabs.push(o);},get:async id=>({id,url:'__PAGE__'}),update:async()=>{}},
 alarms:{onAlarm:bus(),create:async()=>{},clear:async()=>true},
 scripting:{executeScript:async()=>[{result:[]}]}};
document.addEventListener('qa-play',()=>{__qa.events++;
 for(const [url,type,mime] of [['__HLS__','xmlhttprequest','application/vnd.apple.mpegurl'],['__MP4__','media','video/mp4'],['__OTHER__','xmlhttprequest','application/vnd.apple.mpegurl']]){
  const e={tabId:7,frameId:0,documentId:'fixture-doc',initiator:'https://x.com',url,type,requestId:String(__qa.events),statusCode:200,responseHeaders:[{name:'Content-Type',value:mime},{name:'Set-Cookie',value:'PRIVATE-NOT-TO-RETAIN'}]};chrome.webRequest.onBeforeRequest.emit(e);chrome.webRequest.onResponseStarted.emit(e);
 }
});
'''.replace('__PAGE__',PAGE).replace('__HLS__',HLS).replace('__MP4__',MP4).replace('__OTHER__',OTHER)
async def world_eval(cdp,w,js):
 r=await cdp.send('Runtime.evaluate',{'expression':js,'contextId':w,'returnByValue':True,'awaitPromise':True})
 if 'exceptionDetails' in r:raise RuntimeError(str(r['exceptionDetails']))
 return r.get('result',{}).get('value')
async def mode(browser,stay=False):
 label='Stay' if stay else 'Chromium';ctx=await browser.new_context(viewport={'width':390 if stay else 1480,'height':844 if stay else 1000},is_mobile=stay,has_touch=stay,accept_downloads=True)
 await ctx.route('**/*',lambda r:r.abort());page=await ctx.new_page();page.set_default_timeout(15000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)));await page.set_content(HTML)
 cdp=await ctx.new_cdp_session(page);frame=(await cdp.send('Page.getFrameTree'))['frameTree']['frame']['id'];w=(await cdp.send('Page.createIsolatedWorld',{'frameId':frame,'worldName':label+'-content-fixture'}))['executionContextId']
 if stay:
  spec=importlib.util.spec_from_file_location('stayh',ROOT/'tests/content_world_harness.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
  script=(ROOT/'dist/X-Capture-Studio.user.js').read_text();check('Stay: output is content-world safe',h.classify(script)['mode']=='content')
  await world_eval(cdp,w,h.wrap(PRELUDE+'\n__qa.current='+json.dumps(HLS)+';\n'+script))
 else:
  await world_eval(cdp,w,PRELUDE+'\n'+CHROME+'\n'+(ROOT/'dist/extension/background.js').read_text()+'\n'+(ROOT/'dist/extension/content.js').read_text())
 await page.get_by_role('button',name='打开 X Capture',exact=True).click();await page.get_by_role('dialog',name='X Capture 编辑器',exact=True).wait_for()
 await page.get_by_role('tab',name='文本',exact=True).click();await page.get_by_text('媒体资源与高清检查',exact=True).click();await page.locator('.xc-media-options [role=status]').filter(has_text='次有界请求').wait_for()
 preview=page.get_by_label('文本预览',exact=True);text=await preview.input_value()
 check(label+': correct page/title and production UI nonblank',await page.title()=='Discovery QA · synthetic post' and len(text)>50)
 check(label+': empty TextTrack does not become confirmed embedded captions','检测到字幕轨道元信息' in text and '字幕｜内嵌/无独立 URL' not in text)
 check(label+': current intrinsic size not fixed master resolution','320×320' not in text)
 if not stay:
  check('Chromium: blob/no React initially yields page, not fake stream',HLS not in text and '/video/1' in text)
  await world_eval(cdp,w,'__qa.permission=false')
  await page.get_by_role('button',name='检查高清 / 视频 / 字幕',exact=True).click();await page.locator('[data-discovery-status]').filter(has_text='尚未授权').wait_for()
  check('Chromium: denied optional permission keeps basic content',len(await preview.input_value())>50 and not await world_eval(cdp,w,'Object.keys(__qa.session).length'))
  await page.get_by_role('button',name='启用桌面视频观察',exact=True).click();await page.wait_for_timeout(100)
  check('Chromium: opt-in opens real extension permission page',await world_eval(cdp,w,"__qa.createdTabs.some(t=>t.url.includes('/observation.html?returnTab=7'))"))
  await world_eval(cdp,w,'__qa.permission=true;chrome.permissions.onAdded.emit({permissions:["webRequest"]});')
  await page.get_by_role('button',name='检查高清 / 视频 / 字幕',exact=True).click();await page.locator('[data-discovery-status]').filter(has_text='短时观察中').wait_for()
  await page.get_by_role('button',name='返回网页播放视频',exact=True).click()
  await page.locator('#play').click();check('Chromium: minimized studio allows underlying page interaction',await world_eval(cdp,w,'__qa.events')==1)
  await page.get_by_role('button',name='返回结果并完成检查',exact=True).click();await page.locator('.xc-media-options [role=status]').filter(has_text='次有界请求').wait_for()
  await page.wait_for_function("()=>document.querySelector('[data-xcapture-ui=studio]').shadowRoot.querySelector('.xc-text-preview').value.includes('master.m3u8')")
  text=await preview.input_value()
  check('Chromium: production background observer discovers HLS through blob/no-React path',HLS in text)
  check('Chromium: MP4 and HLS retained together',MP4 in text and HLS in text)
  check('Chromium: unrelated preload never attributed to selected post',OTHER not in text)
  check('Chromium: raw private response headers never persisted','PRIVATE' not in json.dumps(await world_eval(cdp,w,'__qa.session')))
  check('Chromium: manual finish clears session',await world_eval(cdp,w,'Object.keys(__qa.session).length')==0)
  check('Chromium: status reports unassigned resource', '待确认 1' in await page.locator('[data-discovery-status]').inner_text())
 else:
  check('Stay: native currentSrc HLS continues to be exported',HLS in text)
  await page.get_by_role('button',name='检查高清 / 视频 / 字幕',exact=True).click();await page.locator('[data-discovery-status]').filter(has_text='不使用 Chrome 网络接口').wait_for()
  check('Stay: no Chrome permission controls',await page.get_by_role('button',name='启用桌面视频观察',exact=True).count()==0)
 # New hint string and master labels checked again AFTER resolver/collector rescan.
 text=await preview.input_value();check(label+': resolved master has no inherited 320x320 label','HLS · 320×320' not in text)
 check(label+': inline ordering preserved through observation/resolve',text.index('原文 A')<text.index(HLS)<text.index('原文 B'))
 await page.get_by_role('button',name='纯文本',exact=True).click();await page.get_by_role('button',name='复制纯文本',exact=True).click();await page.wait_for_timeout(150)
 check(label+': actual production copy handler retains HLS',HLS in await world_eval(cdp,w,'__qa.clipboard'))
 await page.get_by_role('button',name='导出 TXT',exact=True).click();await page.get_by_role('heading',name='文本文件已准备好').wait_for()
 async with page.expect_download() as dl:await page.locator('[data-action=save-text-file]').click()
 d=await dl.value;target=OUT/(label.lower()+'.txt');await d.save_as(target);saved=target.read_text()
 check(label+': actual UTF-8 TXT bytes retain resources and order',HLS in saved and saved.index('原文 A')<saved.index(HLS)<saved.index('原文 B'))
 await page.get_by_role('button',name='关闭文本结果',exact=True).click()
 await page.get_by_role('button',name='Markdown',exact=True).click();await page.get_by_role('button',name='导出 Markdown',exact=True).click();await page.get_by_role('heading',name='文本文件已准备好').wait_for()
 async with page.expect_download() as dl:await page.locator('[data-action=save-text-file]').click()
 d=await dl.value;target=OUT/(label.lower()+'.md');await d.save_as(target)
 check(label+': actual Markdown export bytes retain HLS',HLS in target.read_text())
 await page.get_by_role('button',name='关闭文本结果',exact=True).click()
 await page.get_by_text('资源诊断（不含链接与账号）',exact=True).click();diagnostic=await page.locator('.xc-resource-diagnostics').inner_text()
 check(label+': diagnostics contain no account, URL or signature','https:' not in diagnostic and 'discovery_test' not in diagnostic and 'tag=' not in diagnostic)
 if not stay:check('Chromium: source provenance retained after manifest validation','网络 0' not in diagnostic)
 await page.locator('.xc-media-options').scroll_into_view_if_needed();await page.wait_for_timeout(250);await page.screenshot(path=str(OUT/(label.lower()+'-text.png')))
 check(label+': no application exceptions/framework overlays',not errors,errors)
 check(label+': viewport has no horizontal overflow',await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
 # Close must remove UI and observer session without starting another page operation.
 await page.get_by_role('button',name='关闭编辑器',exact=True).click();check(label+': close removes the production studio',await page.locator('[data-xcapture-ui=studio]').count()==0)
 await ctx.close()
async def permission(browser):
 page=await browser.new_page();await page.set_content((ROOT/'assets/observation.html').read_text());await page.evaluate('''()=>{globalThis.__q={calls:0,allow:false};globalThis.chrome={permissions:{contains:async()=>false,request:()=>{__q.calls++;return Promise.resolve(__q.allow);}}};}''')
 await page.add_script_tag(content=(ROOT/'dist/extension/observation.js').read_text())
 await page.get_by_role('button',name='允许视频请求观察',exact=True).click();check('Permission UI: refusal is handled without claiming success','未授权' in await page.locator('#status').inner_text())
 await page.evaluate('__q.allow=true');await page.get_by_role('button',name='允许视频请求观察',exact=True).click();check('Permission UI: grant performed by direct extension-page button callback',await page.locator('#enable').is_disabled() and await page.evaluate('__q.calls')==2)
 await page.close()
async def main():
 report={'environment':'Playwright Chromium; actual production bundles; fake Chrome/GM/clipboard APIs, controlled webRequest events and fetch; no real X/iPhone. Browser plugin unavailable.'}
 try:
  async with async_playwright() as p:
   browser=await p.chromium.launch(executable_path=os.environ.get('XC_BROWSER','/usr/bin/chromium'),args=['--no-sandbox'])
   try:await mode(browser);await mode(browser,True);await permission(browser)
   finally:await browser.close()
 finally:
  report.update(checks=checks,passed=sum(c['passed'] for c in checks),total=len(checks));(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
if __name__=='__main__':asyncio.run(main())
