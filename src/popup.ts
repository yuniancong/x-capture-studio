export {};
const status=document.querySelector('#status')!;
document.querySelector('#capture')?.addEventListener('click',async()=>{
  try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id||!/^https:\/\/(?:www\.|mobile\.)?(?:x\.com|twitter\.com)\//.test(tab.url||'')){status.textContent='请先打开 X 的帖子或 Article 页面。';return;}
    await chrome.tabs.sendMessage(tab.id,{type:'xc:open'});window.close();
  }catch{status.textContent='请刷新 X 页面，让插件加载后重试。';}
});
document.querySelector('#demo')?.addEventListener('click',()=>chrome.tabs.create({url:chrome.runtime.getURL('demo.html')}));
