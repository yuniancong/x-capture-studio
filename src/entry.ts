import {Collector} from './core/collector';
import {collectDOM,parsePost} from './core/parser';
import {createHost} from './platform/host';
import type {Studio} from './ui/studio';
import {postID} from './core/urls';
import {icon} from './ui/dom';
import {VERSION} from './core/model';
import {passiveMediaLog} from './media/passive-log';
import {postNodes} from './core/post-nodes';

// Keep the launcher independent of PDF/fontkit initialization. A rendering error must not hide the entry point.
const host=createHost(__PLATFORM__),collector=new Collector(host);
let active:Studio|undefined,opening=false,lastError='';
const stayBoot=__PLATFORM__==='stay'&&typeof __XC_STAY_BOOT__!=='undefined'?__XC_STAY_BOOT__:undefined;
stayBoot?.bind({open:()=>void open(postID(location.href))});
async function open(rootId?:string,demo=false){
  if(active||opening)return;opening=true;stayBoot?.note('OPEN','正在打开编辑器');
  try{
    const {Studio}=await import('./ui/studio');
    const capture=demo?(await import('./demo')).demoCapture():await collector.capture(rootId);
    active=new Studio(capture,host,demo?undefined:collector,()=>{active=undefined;});await active.open();lastError='';stayBoot?.note('STUDIO','编辑器已打开');
  }catch(e){lastError=(e as Error).message||'未知错误';console.error('[X Capture] 打开失败：',lastError);stayBoot?.note('OPEN_ERROR',lastError);active?.close();active=undefined;alert('X Capture 无法打开：'+lastError+'\n入口仍可使用，请点「?」查看加载状态。');}
  finally{opening=false;}
}
function diagnostics(){
  if(stayBoot){stayBoot.diagnose();return;}
  const count=postNodes(document).length;
  alert(`X Capture ${VERSION}\n运行端：${__PLATFORM__}\n页面状态：${document.readyState}\n已识别帖子容器：${count}\n编辑器：${active?'已打开':'未打开'}\n最近错误：${lastError||'无'}\n\n${count?'已注入页面；点 X Capture 可打开编辑器。':'脚本已运行，但当前没有可识别的帖子。请在浏览器（不是 X 原生 App）打开帖子详情，等待正文后再点。'}\n无入口时请检查 Stay 中脚本是否启用、x.com 站点访问权限，并禁用旧版重复脚本。`);
}
function attachButtons(){
  const main=document.querySelector('[data-testid="primaryColumn"]')||document.querySelector('main')||document;
  for(const article of postNodes(main)){
    const old=article.querySelector<HTMLElement>('[data-xcapture-ui="button"]');
    if(old?.dataset.version===VERSION)continue;old?.remove();
    // Logged-out X has no role="group"; its bar is the row holding the post's own reply action.
    const bar=[...article.querySelectorAll<HTMLElement>('[role="group"]')].find(g=>g.querySelector('[data-testid="reply"]'))||
      [...article.querySelectorAll<HTMLElement>('[data-engagement-action="reply"]')].find(n=>n.closest('article')===article)?.parentElement||undefined;
    if(!bar)continue; // The independent floating launcher covers changed/missing action bars and Articles.
    const b=document.createElement('button');b.type='button';b.dataset.xcaptureUi='button';b.dataset.version=VERSION;
    b.title='X Capture · 保存此帖与上下文';b.setAttribute('aria-label',b.title);
    b.style.cssText='all:unset;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:32px;height:32px;min-width:32px;color:#1d9bf0;border-radius:50%;cursor:pointer;margin-inline-start:6px;flex-shrink:0';b.append(icon('camera',18));
    b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();void open(parsePost(article)?.id);});bar.append(b);
  }
}
function ensureLauncher(){
  const root=document.documentElement;if(!root)return;
  const existing=document.querySelector<HTMLElement>('[data-xcapture-ui="launcher"]');
  if(existing?.dataset.version===VERSION&&existing.shadowRoot?.querySelector('button[aria-label="打开 X Capture"]'))return;existing?.remove();
  const parent=document.createElement('div');parent.dataset.xcaptureUi='launcher';parent.dataset.version=VERSION;
  parent.style.cssText='all:initial;position:fixed!important;right:12px!important;right:max(12px,env(safe-area-inset-right))!important;bottom:100px!important;bottom:calc(100px + env(safe-area-inset-bottom,0px))!important;z-index:2147483645!important;display:block!important;pointer-events:auto!important;';
  const shadow=parent.attachShadow({mode:'open'}),style=document.createElement('style');
  style.textContent=':host{all:initial} .entry{display:flex;align-items:center;gap:0;background:#112233;color:#4abaff;border:1px solid #259fe6;border-radius:24px;box-shadow:0 4px 18px #0005;font:600 13px -apple-system,BlinkMacSystemFont,Arial,sans-serif}button{all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;justify-content:center;min-height:44px;color:inherit;touch-action:manipulation}button:first-child{gap:7px;padding:0 12px}button:last-child{width:32px;border-left:1px solid #315267}button:focus-visible{outline:2px solid #fff;border-radius:20px}@media(min-width:800px){:host{bottom:24px!important}}';
  const box=document.createElement('div');box.className='entry';
  const b=document.createElement('button');b.type='button';b.title='打开 X Capture';b.setAttribute('aria-label','打开 X Capture');b.append(icon('camera',18),'X Capture');b.onclick=()=>void open(postID(location.href));
  const help=document.createElement('button');help.type='button';help.textContent='?';help.title='X Capture 自检';help.setAttribute('aria-label','X Capture 自检');help.onclick=diagnostics;
  box.append(b,help);shadow.append(style,box);(document.body||root).append(parent);root.dataset.xCaptureAttached=VERSION;
}
if(__PLATFORM__==='demo'){
  const ready=()=>{
    const button=document.querySelector<HTMLButtonElement>('#open-demo');if(button)button.onclick=()=>void open(undefined,true);
    // Test seam exists only in the standalone offline demo.
    window.XCapture={version:VERSION,openDemo:()=>open(undefined,true),openCapture:async(c:any)=>{active?.close();const {Studio}=await import('./ui/studio');active=new Studio(c,host,undefined,()=>active=undefined);await active.open();},get studio(){return active;},collectDOM};
    void open(undefined,true);
  };
  if(document.documentElement)ready();else document.addEventListener('DOMContentLoaded',ready,{once:true});
}else{
  const runtime=window as any;runtime.__xcRuntimeV2?.dispose?.();
  let timer=0,disposed=false,pageAt=location.href;
  passiveMediaLog.start();
  const refresh=()=>{timer=0;if(disposed)return;if(pageAt!==location.href){active?.close();collector.reset();pageAt=location.href;}try{ensureLauncher();stayBoot?.markReady();attachButtons();}catch(e){lastError=(e as Error).message;stayBoot?.fail(e);}};
  // Leading deadline, not repeated debounce: a busy X timeline cannot starve reinjection forever.
  const schedule=()=>{if(!timer&&!disposed)timer=window.setTimeout(refresh,200);};
  const observer=new MutationObserver(records=>{if(records.every(r=>r.target instanceof Element&&r.target.closest('[data-xcapture-ui]')))return;schedule();});
  observer.observe(document,{childList:true,subtree:true});
  const interval=window.setInterval(()=>{if(!document.hidden)schedule();},2000);
  document.addEventListener('DOMContentLoaded',schedule);document.addEventListener('visibilitychange',schedule);window.addEventListener('pageshow',schedule);
  runtime.__xcRuntimeV2={dispose:()=>{disposed=true;passiveMediaLog.stop();active?.close();clearTimeout(timer);clearInterval(interval);observer.disconnect();document.removeEventListener('DOMContentLoaded',schedule);document.removeEventListener('visibilitychange',schedule);window.removeEventListener('pageshow',schedule);}};
  refresh();
  if(__PLATFORM__==='extension')try{chrome.runtime.onMessage.addListener((msg:any,_sender:any,respond:any)=>{if(msg?.type==='xc:open'){void open(postID(location.href));respond({ok:true});}return false;});}catch(e){lastError=(e as Error).message;}
  if(__PLATFORM__==='stay'&&!stayBoot){
    const register=typeof GM_registerMenuCommand==='function'?GM_registerMenuCommand:typeof GM!=='undefined'?GM.registerMenuCommand:undefined;
    if(register)for(const[label,cb]of [['打开 X Capture',()=>void open(postID(location.href))],['X Capture 自检',diagnostics]] as const){try{Promise.resolve(register(label,cb)).catch(()=>{});}catch{/* Menu failures do not affect the visible entry. */}}
  }
}
