export {};
const status=document.querySelector('#status')!;
const enable=document.querySelector<HTMLButtonElement>('#enable')!;
enable.onclick=()=>{
  // Permission request runs directly inside an extension-page user gesture.
  void chrome.permissions.request({permissions:['webRequest']}).then((ok:boolean)=>{
    status.textContent=ok?'已授权。返回原页面，点击“检查高清 / 视频 / 字幕”开始短时观察。':'未授权，基础功能保持可用。';
    if(ok){enable.textContent='已经授权';enable.disabled=true;}
  }).catch(()=>status.textContent='浏览器没有完成授权；基础功能保持可用。');
};
document.querySelector<HTMLButtonElement>('#back')!.onclick=()=>{
  const raw=new URL(location.href).searchParams.get('returnTab');if(!raw||!/^\d+$/.test(raw)){status.textContent='请自行返回 X 标签页。';return;}
  void chrome.tabs.get(Number(raw)).then((tab:any)=>{
    const url=new URL(tab.url||'');if(url.protocol!=='https:'||!/^(?:www\.|mobile\.)?(?:x\.com|twitter\.com)$/.test(url.hostname))throw Error();
    return chrome.tabs.update(tab.id,{active:true});
  }).then(()=>window.close()).catch(()=>status.textContent='原页面已关闭或导航离开，请自行返回 X。');
};
void chrome.permissions.contains({permissions:['webRequest']}).then((ok:boolean)=>{if(ok){enable.textContent='已经授权';enable.disabled=true;status.textContent='权限已准备好；只有主动检查时才记录媒体请求。';}});
