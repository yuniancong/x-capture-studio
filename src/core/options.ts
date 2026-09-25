import { Options } from './model';
export const DEFAULTS:Options={
  mode:'stack',theme:'light',background:'gradient',bg1:'#647bee',bg2:'#7950ab',angle:135,
  bgImage:'',bgImageFit:'cover',bgImageX:50,bgImageY:50,bgDim:0,bgBlur:0,bgPattern:'none',
  ratio:'auto',width:760,padding:48,gap:22,radius:18,cardPadding:22,shadow:24,border:false,
  fontSize:19,lineHeight:1.55,metaSize:14,avatarSize:42,
  showAvatar:true,showAuthor:true,showHandle:true,showVerified:true,showTime:true,showMetrics:true,
  showQuote:true,showMedia:true,showNote:true,showRelation:true,showSource:false,showCaptureTime:false,showQR:false,
  sourceMetadata:true,anonymize:false,anonymousSources:false,
  mediaLayout:'native',mediaFit:'contain',mediaMaxHeight:640,compactReplies:true,roleStyles:false,replyIndent:24,replyBg:'#f4f7fb',authorAccent:false,connectors:false,
  scale:2,pdfMode:'long',pdfPage:'a4',defaultReplies:'none',maxPosts:80,maxScrolls:18
};
export const PRESETS:Record<string,Partial<Options>>={
  '分块卡片':{...DEFAULTS},
  'X 原貌':{mode:'native',background:'solid',bg1:'#ffffff',padding:0,gap:0,radius:0,shadow:0,border:true,theme:'light',width:680},
  '暗色阅读':{mode:'stack',theme:'dark',background:'solid',bg1:'#15202b',gap:16,radius:16,shadow:0},
  '清爽留存':{mode:'stack',theme:'light',background:'solid',bg1:'#edf1f5',gap:16,radius:12,shadow:8,showMetrics:false,showSource:true},
  '文档阅读':{mode:'document',theme:'light',background:'solid',bg1:'#ffffff',padding:36,radius:0,shadow:0,gap:24,border:false,showMetrics:false,showSource:true,fontSize:18},
  '手机宽度':{mode:'stack',width:390,padding:16,gap:14,cardPadding:16,fontSize:17,metaSize:12,avatarSize:36,scale:3}
};
const ranges:Partial<Record<keyof Options,[number,number]>>={width:[320,1800],padding:[0,160],gap:[0,100],radius:[0,60],cardPadding:[10,80],shadow:[0,80],fontSize:[12,40],lineHeight:[1.1,2.2],metaSize:[10,24],avatarSize:[24,80],angle:[0,360],replyIndent:[0,100],mediaMaxHeight:[120,1600],maxPosts:[5,250],maxScrolls:[1,60],bgImageX:[0,100],bgImageY:[0,100],bgDim:[0,85],bgBlur:[0,40]};
const enums:Partial<Record<keyof Options,readonly unknown[]>>={mode:['stack','native','document'],theme:['light','dim','dark'],background:['gradient','solid','transparent','image'],bgImageFit:['cover','contain'],bgPattern:['none','grid','dots'],ratio:['auto','1:1','4:5','9:16','16:9'],mediaLayout:['native','grid','stack'],mediaFit:['contain','cover'],scale:[1,2,3,4],pdfMode:['long','pages'],pdfPage:['a4','letter'],defaultReplies:['none','direct','all']};
/** A whitelist prevents a JSON preset from injecting CSS, markup or prototype keys. */
export function normalizeOptions(raw:unknown):Options {
  const result={...DEFAULTS};
  if(!raw || typeof raw!=='object' || Array.isArray(raw))return result;
  const x=raw as Record<string,unknown>;
  for(const key of Object.keys(DEFAULTS) as (keyof Options)[]){
    const val=x[key], def=DEFAULTS[key];
    if(val===undefined)continue;
    if(key==='bgImage'){if(typeof val==='string'&&(val===''||/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(val))&&val.length<=8*1024*1024)result.bgImage=val;}
    else if(enums[key]){if(enums[key]!.includes(val))(result as any)[key]=val;}
    else if(ranges[key]){if(typeof val==='number'&&Number.isFinite(val)){const[a,b]=ranges[key]!;(result as any)[key]=Math.max(a,Math.min(b,val));}}
    else if(typeof def==='boolean'){if(typeof val==='boolean')(result as any)[key]=val;}
    else if(typeof def==='string'&&typeof val==='string'&&/^#[\da-f]{6}$/i.test(val))(result as any)[key]=val;
  }
  result.width=Math.round(result.width);
  // Keep a usable card width even when a narrow preset has very large margins.
  result.padding=Math.min(result.padding,Math.floor((result.width-240)/2));
  result.maxPosts=Math.round(result.maxPosts);result.maxScrolls=Math.round(result.maxScrolls);
  return result;
}
export function sourcesAllowed(o:Options){return !o.anonymize||o.anonymousSources;}
