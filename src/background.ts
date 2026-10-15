import {ChromeObservationBridge} from './platform/network-observer';
const observation=new ChromeObservationBridge(chrome);
import {nativeResource,safeResourceRequest} from './platform/resource-network';
const resourceTasks=new Map<string,AbortController>();
const resourceRate=new Map<number,{at:number;count:number}>();
import {allowedAsset} from './core/urls';
import {base64} from './export/binary';
import {pageProbe} from './platform/probe';
import {nativeBytes} from './platform/host';
const isX=(url:string)=>{try{return /^(?:www\.|mobile\.)?(?:x\.com|twitter\.com)$/.test(new URL(url).hostname);}catch{return false;}};
chrome.runtime.onMessage.addListener((msg:any,sender:any,respond:any)=>{
  if(sender.id!==chrome.runtime.id||!sender.tab?.id||!isX(sender.tab.url||sender.url||''))return false;
  if(msg?.type==='xc:observe'){
    observation.command(msg.action,sender,msg.sessionId).then(respond).catch(()=>respond({state:'unavailable',records:[]}));return true;
  }
  if(msg?.type==='xc:observe-enable'){
    observation.openPermissionPage(sender).then(ok=>respond({ok})).catch(()=>respond({ok:false}));return true;
  }
  if(msg?.type==='xc:asset'){
    if(typeof msg.url!=='string'||!allowedAsset(msg.url)){respond({ok:false,error:'资源地址不在允许列表。'});return false;}
    nativeBytes(msg.url).then(b=>respond({ok:true,data:base64(b)})).catch(e=>respond({ok:false,error:e.message}));return true;
  }
  if(msg?.type==='xc:resource-cancel'){
    const key=sender.tab.id+':'+msg.requestId;resourceTasks.get(key)?.abort();respond({ok:true});return false;
  }
  if(msg?.type==='xc:resource'){
    const r=safeResourceRequest(msg.request);const id=typeof msg.requestId==='string'&&/^[\w-]{1,80}$/.test(msg.requestId)?msg.requestId:undefined;
    if(!r||!id){respond({ok:false});return false;}
    const tab=sender.tab.id,now=Date.now(),limit=resourceRate.get(tab);
    if(limit&&now-limit.at<60000&&limit.count>=64){respond({ok:false});return false;}
    if(resourceTasks.size>=8){respond({ok:false});return false;}
    if(resourceRate.size>200)resourceRate.clear();resourceRate.set(tab,limit&&now-limit.at<60000?{...limit,count:limit.count+1}:{at:now,count:1});
    const key=tab+':'+id,ctrl=new AbortController();resourceTasks.set(key,ctrl);
    nativeResource(r,ctrl.signal).then(response=>{const {bytes,...meta}=response;respond({ok:true,response:meta,data:base64(bytes)});}).catch(()=>respond({ok:false})).finally(()=>resourceTasks.delete(key));return true;
  }
  if(msg?.type==='xc:probe'){
    const ids=Array.isArray(msg.ids)?msg.ids.filter((id:any)=>typeof id==='string'&&/^\d+$/.test(id)).slice(0,250):[];
    chrome.scripting.executeScript({target:{tabId:sender.tab.id},world:'MAIN',func:pageProbe,args:[ids]}).then((r:any[])=>respond({ok:true,data:r[0]?.result||[]})).catch(()=>respond({ok:false,data:[]}));return true;
  }
  return false;
});
