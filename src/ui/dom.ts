export function el<K extends keyof HTMLElementTagNameMap>(tag:K,attrs:Record<string,unknown>={},...children:(Node|string|undefined|null|false)[]):HTMLElementTagNameMap[K]{
  const n=document.createElement(tag);
  for(const[k,v]of Object.entries(attrs)){
    if(v===undefined||v===null||v===false)continue;
    if(k==='class')n.className=String(v);
    else if(k.startsWith('on')&&typeof v==='function')n.addEventListener(k.slice(2).toLowerCase(),v as EventListener);
    else if(k==='checked'||k==='disabled'||k==='selected')(n as any)[k]=!!v;
    else if(k==='value')(n as any).value=v;
    else n.setAttribute(k,String(v));
  }
  for(const child of children)if(child!==false&&child!==null&&child!==undefined)n.append(typeof child==='string'?document.createTextNode(child):child);
  return n;
}
const paths:Record<string,string>={camera:'M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',close:'M6 6l12 12M18 6 6 18',download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',copy:'M9 9h12v12H9zM15 9V3H3v12h6',share:'M12 16V3m-4 4 4-4 4 4M5 12v9h14v-9',plus:'M12 5v14M5 12h14',minus:'M5 12h14',check:'M5 12l4 4L19 6',arrowUp:'m6 14 6-6 6 6',arrowDown:'m6 10 6 6 6-6',refresh:'M20 7V3l-3 3a8 8 0 1 0 3 11M20 3h-5',external:'M14 3h7v7M21 3 10 14M10 3H3v18h18v-7',file:'M14 2H4v20h16V8l-6-6ZM14 2v6h6M8 13h8M8 17h8'};
export function icon(name:string,size=18):SVGSVGElement{
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('width',String(size));svg.setAttribute('height',String(size));svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',paths[name]||paths.camera);svg.append(p);return svg;
}
export function button(text:string,click:()=>void,className='xc-button',label?:string){return el('button',{type:'button',class:className,onClick:click,'aria-label':label||text},text);}
