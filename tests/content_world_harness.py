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
