import {allowedAsset} from './core/urls';
import {base64} from './export/binary';
import {pageProbe} from './platform/probe';
import {nativeBytes} from './platform/host';
const isX=(url:string)=>{try{return /^(?:www\.|mobile\.)?(?:x\.com|twitter\.com)$/.test(new URL(url).hostname);}catch{return false;}};
chrome.runtime.onMessage.addListener((msg:any,sender:any,respond:any)=>{
  if(sender.id!==chrome.runtime.id||!sender.tab?.id||!isX(sender.tab.url||sender.url||''))return false;
  if(msg?.type==='xc:asset'){
    if(typeof msg.url!=='string'||!allowedAsset(msg.url)){respond({ok:false,error:'资源地址不在允许列表。'});return false;}
    nativeBytes(msg.url).then(b=>respond({ok:true,data:base64(b)})).catch(e=>respond({ok:false,error:e.message}));return true;
  }
  if(msg?.type==='xc:probe'){
    const ids=Array.isArray(msg.ids)?msg.ids.filter((id:any)=>typeof id==='string'&&/^\d+$/.test(id)).slice(0,250):[];
    chrome.scripting.executeScript({target:{tabId:sender.tab.id},world:'MAIN',func:pageProbe,args:[ids]}).then((r:any[])=>respond({ok:true,data:r[0]?.result||[]})).catch(()=>respond({ok:false,data:[]}));return true;
  }
  return false;
});
