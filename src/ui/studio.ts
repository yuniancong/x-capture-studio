import {AssetMap,Capture,Host,Options,Post,Scene,SelectionRule,VERSION} from '../core/model';
import {DEFAULTS,normalizeOptions,PRESETS} from '../core/options';
import {postRole,ROLE_LABELS,rootPost,selectByRule,mergePosts} from '../core/selection';
import {Collector} from '../core/collector';
import {layoutCapture} from '../core/layout';
import {drawScene,exportBudget} from '../core/canvas';
import {plainText,contextText} from '../core/urls';
import {cacheFont,clearFont,loadAssets,loadPdfFont,useMemoryFont,decodeData} from '../platform/assets';
import {exportPNG,mobileDevice} from '../export/png';
import {provenance} from '../export/metadata';
import {exportPDF} from '../export/pdf';
import {el,button,icon} from './dom';
import {colors,group,range,segment,select,toggle} from './controls';
import {STYLES} from './styles';

export class Studio {
  options:Options={...DEFAULTS}; selected=new Set<string>(); order:string[]=[];
  capture:Capture; assets:AssetMap=new Map(); scene:Scene={width:760,height:100,commands:[],links:[],cards:[],texts:[],warnings:[]};
  private hostElement:HTMLDivElement;private shadow:ShadowRoot;private studio:HTMLDivElement;private controls:HTMLDivElement;
  private stage:HTMLDivElement;private preview:HTMLDivElement;private counter:HTMLSpanElement;private dimensions:HTMLSpanElement;
  private quality:HTMLDivElement;private status:HTMLDivElement;private tab='style';private saved:Record<string,Options>={};
  private zoom=1;private autoZoom=true;private observer?:IntersectionObserver;private resize?:ResizeObserver;private repaint=0;private toastTimer=0;
  private busy=false;private closed=false;private abort?:AbortController;private assetAbort=new AbortController();private overlay?:HTMLElement;
  private overflow='';private previousFocus:Element|null=null;private onClose?:()=>void;private keyboard:(e:KeyboardEvent)=>void;
  private lastResult?:{blob:Blob;url:string;filename:string;type:'png'|'pdf'};
  private measure=document.createElement('canvas').getContext('2d')!;
  constructor(capture:Capture,private host:Host,private collector?:Collector,onClose?:()=>void){
    this.capture=capture;this.onClose=onClose;this.hostElement=el('div',{'data-xcapture-ui':'studio'});this.shadow=this.hostElement.attachShadow({mode:'open'});
    this.stage=el('div',{class:'xc-stage'});this.preview=el('div',{class:'xc-preview'});this.stage.append(this.preview);
    this.counter=el('span',{class:'xc-counter'});this.dimensions=el('span');this.quality=el('div',{class:'xc-quality'});this.status=el('div',{class:'xc-status',role:'status','aria-live':'polite',hidden:true});
    this.controls=el('div',{class:'xc-controls'});
    const fit=button('适应预览',()=>{this.autoZoom=true;this.paint();},'xc-textbtn');
    const zoomOut=el('button',{type:'button',class:'xc-iconbtn','aria-label':'缩小预览',onClick:()=>{this.autoZoom=false;this.zoom=Math.max(.2,this.zoom/1.2);this.paint();}},icon('minus',15));
    const zoomIn=el('button',{type:'button',class:'xc-iconbtn','aria-label':'放大预览',onClick:()=>{this.autoZoom=false;this.zoom=Math.min(2.5,this.zoom*1.2);this.paint();}},icon('plus',15));
    const workspace=el('div',{class:'xc-workspace'},el('div',{class:'xc-topbar'},el('div',{},el('strong',{},'实时预览'),this.counter,host.kind==='demo'?el('span',{class:'xc-demo-mark'},'演示数据'):null),el('div',{class:'xc-tools'},fit,zoomOut,zoomIn)),this.stage,el('div',{class:'xc-stage-note'},'预览缩放不改变导出清晰度 · 原文只读 · 不添加水印'));
    const header=el('div',{class:'xc-header'},el('div',{class:'xc-brand'},icon('camera',20)),el('div',{},el('h1',{class:'xc-title'},'X CAPTURE'),el('div',{class:'xc-version'},'STUDIO · '+VERSION)),button('放大预览',()=>this.studio.classList.toggle('preview-large'),'xc-textbtn xc-mobile-preview-toggle'),el('button',{type:'button',class:'xc-iconbtn xc-close','aria-label':'关闭编辑器',onClick:()=>this.close()},icon('close')));
    const tabs=el('div',{class:'xc-tabs',role:'tablist'});
    for(const[key,label]of [['style','外观'],['content','内容'],['advanced','高级']])tabs.append(el('button',{type:'button',class:'xc-tab',role:'tab','aria-selected':this.tab===key,onClick:()=>{this.tab=key;tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',String(b.textContent===label)));this.renderControls();}},label));
    const png=el('button',{type:'button',class:'xc-export','data-action':'png',onClick:()=>void this.generate('png')},icon('download',17),'导出 PNG');
    const pdf=el('button',{type:'button',class:'xc-export secondary','data-action':'pdf',onClick:()=>void this.generate('pdf')},icon('file',17),'导出 PDF');
    const copy=el('button',{type:'button',class:'xc-textbtn','data-action':'copy',onClick:()=>void this.copyImage()},icon('copy',13),'复制图片');
    const texts=button('复制上下文文本',()=>void this.copyText(),'xc-textbtn');
    const footer=el('div',{class:'xc-footer'},el('div',{class:'xc-dimensions'},this.dimensions,this.quality),el('div',{class:'xc-export-row'},png,pdf),el('div',{class:'xc-footer-tools'},copy,texts),el('div',{class:'xc-shortcut'},'⌘ / Ctrl + S 导出 · Esc 关闭'));
    const panel=el('aside',{class:'xc-panel'},header,tabs,this.controls,footer);
    this.studio=el('div',{class:'xc-studio',role:'dialog','aria-modal':'true','aria-label':'X Capture 编辑器',tabindex:'-1'},workspace,panel,this.status);
    this.shadow.append(el('style',{},STYLES),el('div',{class:'xc-backdrop'},this.studio));
    this.keyboard=e=>{
      if(this.closed)return;
      const target=this.shadow.activeElement as HTMLElement|null;
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();this.overlay?this.closeOverlay():this.close();return;}
      if((e.metaKey||e.ctrlKey)&&!target?.matches('input,textarea,select')){
        if(e.key.toLowerCase()==='s'){e.preventDefault();e.stopPropagation();void this.generate('png');}
        if(e.key.toLowerCase()==='c'&&!window.getSelection()?.toString()){e.preventDefault();e.stopPropagation();void this.copyImage();}
      }
      if(e.key==='Tab'){
        const area=this.overlay||this.studio;const focusables=[...area.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,select,[tabindex="0"]')].filter(n=>n.getClientRects().length>0);
        const first=focusables[0],last=focusables[focusables.length-1];if(e.shiftKey&&target===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&target===last){e.preventDefault();first?.focus();}
      }
    };
  }
  async open(){
    this.options=normalizeOptions(await this.host.getValue('options',DEFAULTS).catch(()=>DEFAULTS));
    const saved=await this.host.getValue<Record<string,unknown>>('presets',{}).catch(()=>({}));for(const[k,v]of Object.entries(saved||{}).slice(0,50))this.saved[k]=normalizeOptions(v);
    this.order=this.capture.posts.map(p=>p.id);
    this.selected=selectByRule(this.capture,this.options.defaultReplies==='all'?'all':this.options.defaultReplies==='direct'?'direct':'thread');
    if(!this.selected.size&&this.capture.posts[0])this.selected.add(this.capture.posts[0].id);
    this.previousFocus=document.activeElement;this.overflow=document.documentElement.style.overflow;document.documentElement.style.overflow='hidden';document.documentElement.append(this.hostElement);document.addEventListener('keydown',this.keyboard,true);
    this.renderControls();this.render();this.studio.focus();
    if(typeof ResizeObserver!=='undefined'){this.resize=new ResizeObserver(()=>{if(this.autoZoom)this.schedule();});this.resize.observe(this.stage);}
    await this.refreshAssets();
  }
  close(){if(this.closed)return;this.closed=true;this.abort?.abort();this.assetAbort.abort();this.observer?.disconnect();this.resize?.disconnect();cancelAnimationFrame(this.repaint);clearTimeout(this.toastTimer);document.removeEventListener('keydown',this.keyboard,true);document.documentElement.style.overflow=this.overflow;
    if(this.lastResult){const url=this.lastResult.url;setTimeout(()=>URL.revokeObjectURL(url),60000);}this.hostElement.remove();if(this.previousFocus instanceof HTMLElement)this.previousFocus.focus();this.onClose?.();}
  private toast(message:string,sticky=false){if(this.closed)return;clearTimeout(this.toastTimer);this.status.textContent=message;this.status.hidden=false;if(!sticky)this.toastTimer=window.setTimeout(()=>this.status.hidden=true,6500);}
  private schedule(){cancelAnimationFrame(this.repaint);this.repaint=requestAnimationFrame(()=>this.render());}
  update(patch:Partial<Options>,controls=false){this.options=normalizeOptions({...this.options,...patch});this.schedule();void this.host.setValue('options',this.options).catch(()=>this.toast('设置暂未持久保存。'));if(controls)this.renderControls();}
  private render(){if(this.closed)return;this.scene=layoutCapture(this.capture,this.selected,this.order,this.options,this.assets,this.measure);this.counter.textContent=`${this.selected.size} 条 / ${this.capture.posts.length} 条候选`;this.paint();this.renderFooter();}
  private renderFooter(){
    const b=exportBudget(this.scene.width,this.scene.height,this.options.scale,mobileDevice());this.dimensions.textContent=`${b.width.toLocaleString()} × ${b.height.toLocaleString()} px${b.ok?'':' · 尺寸超限'}`;
    this.quality.replaceChildren();for(const v of [1,2,3,4] as const)this.quality.append(button(v+'×',()=>this.update({scale:v}),this.options.scale===v?'is-active':''));
  }
  private paint(){
    if(this.closed)return;this.observer?.disconnect();const {scene}=this;const avail=this.stage.clientWidth-(mobileDevice()?36:68);
    if(this.autoZoom){const widthZoom=Math.min(1,Math.max(.15,avail/scene.width));const heightZoom=(this.stage.clientHeight-60)/scene.height;this.zoom=!mobileDevice()&&heightZoom>=.65?Math.min(widthZoom,heightZoom):widthZoom;}
    this.preview.replaceChildren();this.preview.style.width=`${scene.width*this.zoom}px`;this.preview.style.height=`${scene.height*this.zoom}px`;
    if(!this.selected.size){this.preview.style.width='100%';this.preview.style.height='auto';this.preview.append(el('div',{class:'xc-empty'},'尚未选择内容。请在「内容」中勾选要保存的帖子。'));return;}
    const tileHeight=1100,ratio=Math.min(2,window.devicePixelRatio||1),rendered=new Map<Element,HTMLCanvasElement>();
    const draw=(target:HTMLElement)=>{if(rendered.has(target))return;const offset=Number(target.dataset.offset),h=Number(target.dataset.height),canvas=el('canvas',{'aria-label':`内容预览 · ${Math.floor(offset/tileHeight)+1}`});const k=this.zoom*ratio;canvas.width=Math.max(1,Math.ceil(scene.width*k));canvas.height=Math.max(1,Math.ceil(h*k));const ctx=canvas.getContext('2d');if(ctx)drawScene(ctx,scene,this.assets,k,offset,h);target.append(canvas);rendered.set(target,canvas);
      canvas.addEventListener('click',e=>{const rect=canvas.getBoundingClientRect(),x=(e.clientX-rect.left)/this.zoom,y=(e.clientY-rect.top)/this.zoom+offset;const cmd=[...scene.commands].reverse().find(c=>c.type==='image'&&c.w>80&&x>=c.x&&x<=c.x+c.w&&y>=c.y&&y<=c.y+c.h);if(cmd?.type==='image')this.gallery(cmd.src);});};
    if(typeof IntersectionObserver!=='undefined')this.observer=new IntersectionObserver(entries=>{for(const e of entries){if(e.isIntersecting)draw(e.target as HTMLElement);else{const c=rendered.get(e.target);if(c){c.width=c.height=1;c.remove();rendered.delete(e.target);}}}},{root:this.stage,rootMargin:'800px'});
    for(let y=0;y<scene.height;y+=tileHeight){const h=Math.min(tileHeight,scene.height-y),tile=el('div',{class:'xc-tile','data-offset':y,'data-height':h,style:`height:${h*this.zoom}px`});this.preview.append(tile);if(this.observer)this.observer.observe(tile);else draw(tile);}
  }
  private async refreshAssets(){
    await this.prepareBackground();
    const failures=await loadAssets(this.capture,this.host,this.assets,undefined,this.assetAbort.signal);if(this.closed)return;this.render();if(failures.length)this.toast(`${failures.length} 项媒体未载入；会保留占位并提示，不会伪装成完整媒体。`);
  }
  private renderControls(){
    const o=this.options,nodes:Node[]=[];const change=(patch:Partial<Options>)=>this.update(patch);
    if(this.tab==='style'){
      nodes.push(colors(o,patch=>{this.update(patch,true);if(patch.background==='image')void this.prepareBackground().then(()=>this.render());}));
      const bg=el('div',{class:'xc-wallpaper-drop'},el('div',{class:'xc-label'},'本地图片 / 桌面壁纸'));
      const input=el('input',{type:'file',accept:'image/png,image/jpeg,image/webp',class:'xc-file',style:'display:none','aria-label':'选择背景图片',onChange:(e:Event)=>void this.importBackground((e.target as HTMLInputElement).files?.[0])});
      bg.append(input,button('选择图片 / 使用壁纸',()=>input.click()),el('p',{class:'xc-sub'},'选择当前壁纸的原图片，也可拖入图片。仅本地处理；浏览器不能直接读取 macOS 正在使用的壁纸。'));
      bg.addEventListener('dragover',e=>{e.preventDefault();bg.classList.add('is-dragover');});bg.addEventListener('dragleave',()=>bg.classList.remove('is-dragover'));bg.addEventListener('drop',e=>{e.preventDefault();bg.classList.remove('is-dragover');void this.importBackground(e.dataTransfer?.files[0]);});
      if(o.bgImage){bg.append(el('img',{src:o.bgImage,alt:'已选择的背景图片',class:'xc-backdrop-thumb'}),el('div',{class:'xc-button-row'},button('使用这张背景',()=>this.update({background:'image'},true)),button('移除图片',()=>{this.assets.delete(this.options.bgImage);this.update({bgImage:'',background:'gradient'},true);})));}
      if(o.background==='image')bg.append(select('背景图片适配',[['cover','填满背景'],['contain','完整图片']],o.bgImageFit,v=>change({bgImageFit:v})),range('背景水平位置',o.bgImageX,0,100,1,v=>change({bgImageX:v}),'%'),range('背景垂直位置',o.bgImageY,0,100,1,v=>change({bgImageY:v}),'%'),range('背景柔化',o.bgBlur,0,40,1,v=>change({bgBlur:v})));
      nodes.push(bg,select('背景纹理',[['none','无纹理'],['grid','细网格'],['dots','点阵']],o.bgPattern,v=>change({bgPattern:v})),range('背景压暗',o.bgDim,0,80,1,v=>change({bgDim:v}),'%'));
      nodes.push(group('排版',segment([['stack','分块卡片'],['native','X 原貌'],['document','文档']],o.mode,v=>this.update({mode:v as any},true))));
      nodes.push(group('主题',segment([['light','浅色'],['dim','暗蓝'],['dark','纯黑']],o.theme,v=>change({theme:v as any}))));
      nodes.push(group('画布比例',segment([['auto','自动'],['1:1','1:1'],['4:5','4:5'],['9:16','9:16'],['16:9','16:9']],o.ratio,v=>change({ratio:v as any}))));
      nodes.push(group('外边距',segment([[0,'0'],[16,'S'],[48,'M'],[80,'L']],o.padding,v=>change({padding:v}))));
      nodes.push(group('圆角',segment([[0,'0'],[8,'S'],[18,'M'],[30,'L']],o.radius,v=>change({radius:v}))));
      nodes.push(toggle('显示互动数据',o.showMetrics,v=>change({showMetrics:v})),toggle('隐藏作者身份',o.anonymize,v=>this.update({anonymize:v},true)));
      if(o.anonymize)nodes.push(el('p',{class:'xc-warning'},'仅隐藏作者栏。正文、图片中的身份不会自动打码；来源链接默认一并移除，防止反查。'));
      const presets=Object.keys(PRESETS).map(k=>[k,k] as [string,string]).concat(Object.keys(this.saved).map(k=>['user:'+k,'我的 · '+k]));
      nodes.push(select('样式预设',[['','选择一个预设…'],...presets],'',v=>{if(!v)return;const source=v.startsWith('user:')?this.saved[v.slice(5)]:PRESETS[v];this.update(source,true);void this.prepareBackground().then(()=>this.render());}));
      nodes.push(el('div',{class:'xc-button-row'},button('保存当前预设',()=>void this.savePreset()),button('重置外观',()=>this.update({...DEFAULTS,scale:o.scale,defaultReplies:o.defaultReplies},true))));
    }else if(this.tab==='content'){
      nodes.push(el('p',{class:'xc-sub'},'候选来自已采集页面。只有明确的回复关系才计入「作者串」；同作者不等于同一个线程。勾选和上下移动只改变本次导出。'));
      const rules:[SelectionRule,string][]=[['single','仅当前帖'],['thread','作者串'],['author','仅贴主'],['direct','贴主＋直接回复'],['all','全部候选']];
      const shortcuts=el('div',{class:'xc-button-row'});for(const[r,label]of rules)shortcuts.append(button(label,()=>{this.selected=selectByRule(this.capture,r,this.selected);this.render();this.renderControls();}));nodes.push(shortcuts);
      nodes.push(el('div',{class:'xc-button-row',style:'margin-top:7px'},button('反选',()=>{this.selected=new Set(this.capture.posts.filter(p=>!this.selected.has(p.id)).map(p=>p.id));this.render();this.renderControls();}),button('清空',()=>{this.selected.clear();this.render();this.renderControls();})));
      if(this.collector)nodes.push(el('div',{class:'xc-button-row',style:'margin-top:12px'},button(this.abort?'停止采集':'向上 / 向下继续采集',()=>void this.collectMore(),'xc-button primary'),button('重新读取',()=>void this.rescan())));
      nodes.push(el('div',{class:'xc-content-head'},`已选 ${this.selected.size} / 候选 ${this.capture.posts.length}`,el('span',{class:'xc-role'},'可手动排序')));
      const byId=new Map(this.capture.posts.map(p=>[p.id,p]));
      for(const id of this.order){const p=byId.get(id);if(!p)continue;const checked=this.selected.has(id),role=postRole(p,this.capture);
        const check=el('input',{type:'checkbox',checked,'aria-label':'选择 '+p.author.name+' '+p.id,onChange:(e:Event)=>{(e.target as HTMLInputElement).checked?this.selected.add(id):this.selected.delete(id);this.render();this.renderControls();}});
        const row=el('div',{class:'xc-post-row'+(checked?' is-selected':''),'data-post':id},el('label',{class:'xc-post-choice'},check,el('div',{class:'xc-post-info'},el('div',{class:'xc-post-author'},p.author.name,el('span',{class:'xc-role'},ROLE_LABELS[role])),el('div',{class:'xc-post-text'},p.title?`${p.title}\n${plainText(p)}`:plainText(p)))));
        if(p.warnings.length)row.append(el('div',{class:'xc-relation'},p.warnings.join(' ')));
        if(p.parentId&&!this.selected.has(p.parentId)&&id!==this.capture.rootId)row.append(el('div',{class:'xc-relation'},'被回复的父帖未选中或尚未加载。'));
        const tools=el('div',{class:'xc-post-tools'});for(const[delta,name,label]of [[-1,'arrowUp','上移'],[1,'arrowDown','下移']] as const)tools.append(el('button',{type:'button',class:'xc-iconbtn','aria-label':label+' '+p.id,onClick:()=>this.move(id,delta)},icon(name,14)));
        if(p.url)tools.append(el('a',{href:p.url,target:'_blank',rel:'noopener noreferrer',class:'xc-iconbtn','aria-label':'打开原帖 '+p.id,title:'打开原帖'},icon('external',13)));row.append(tools);nodes.push(row);
      }
      if(!this.capture.posts.length)nodes.push(el('p',{class:'xc-warning'},'未找到帖子。请在 X 打开一条帖子或 Article 的详情页，等待正文出现后重试。'));
    }else{
      nodes.push(range('版式宽度',o.width,320,1800,10,v=>change({width:v}),'CSS px'));
      nodes.push(group('宽度快捷选择',segment([[390,'手机'],[680,'标准'],[760,'宽卡片']],o.width,v=>this.update({width:v},true))));
      nodes.push(range('卡片内边距',o.cardPadding,10,80,1,v=>change({cardPadding:v}),'px'),range('外边距',o.padding,0,160,1,v=>change({padding:v}),'px'),range('卡片间距',o.gap,0,100,1,v=>change({gap:v}),'px'),range('圆角',o.radius,0,60,1,v=>change({radius:v}),'px'),range('阴影强度',o.shadow,0,80,1,v=>change({shadow:v})),range('渐变角度',o.angle,0,360,1,v=>change({angle:v}),'°'));
      const type=el('details',{class:'xc-details'},el('summary',{},'文字与作者信息'));
      type.append(range('正文字号',o.fontSize,12,40,1,v=>change({fontSize:v}),'px'),range('正文行高',o.lineHeight,1.1,2.2,.05,v=>change({lineHeight:v})),range('辅助信息字号',o.metaSize,10,24,1,v=>change({metaSize:v}),'px'),range('头像尺寸',o.avatarSize,24,80,1,v=>change({avatarSize:v}),'px'));
      for(const[k,label]of [['showAvatar','显示头像'],['showAuthor','显示昵称'],['showHandle','显示 @账号'],['showVerified','显示认证标志'],['showTime','显示时间与编辑标志'],['showMetrics','显示互动数据']] as [keyof Options,string][])type.append(toggle(label,!!o[k],v=>change({[k]:v})));nodes.push(type);
      const content=el('details',{class:'xc-details'},el('summary',{},'上下文与角色样式'));
      for(const[k,label]of [['showQuote','显示引用帖子'],['showNote','显示社区背景说明'],['showRelation','显示回复关系'],['roleStyles','启用分角色样式'],['authorAccent','突出作者卡片'],['connectors','显示卡片连接线'],['border','显示卡片边框']] as [keyof Options,string][])content.append(toggle(label,!!o[k],v=>change({[k]:v})));
      content.append(range('第三方回复缩进',o.replyIndent,0,100,1,v=>change({replyIndent:v}),'px'),el('label',{class:'xc-colorrow'},'第三方回复背景',el('input',{type:'color',value:o.replyBg,'aria-label':'第三方回复背景',onInput:(e:Event)=>change({replyBg:(e.target as HTMLInputElement).value})})),select('新建捕获时的回复默认选择',[['none','只选已确认的作者串'],['direct','作者串＋直接回复'],['all','全部已采集候选']],o.defaultReplies,v=>change({defaultReplies:v})));
      nodes.push(content);
      const media=el('details',{class:'xc-details'},el('summary',{},'媒体显示（不下载原媒体）'),toggle('显示帖子中的媒体',o.showMedia,v=>change({showMedia:v})),select('多图布局',[['native','保持页面多图排布'],['grid','规则网格'],['stack','逐张堆叠']],o.mediaLayout,v=>this.update({mediaLayout:v},true)),select(o.mediaLayout==='native'?'手动布局图片适配（当前使用原页面裁切）':'图片适配',[['contain','完整显示（不裁切）'],['cover','填满区域（会裁切）']],o.mediaFit,v=>change({mediaFit:v})),range('媒体最大显示高度',o.mediaMaxHeight,120,1600,20,v=>change({mediaMaxHeight:v}),'px'));
      nodes.push(media);
      const source=el('details',{class:'xc-details'},el('summary',{},'来源链接与文件信息'));
      for(const[k,label]of [['showSource','在画面中显示原帖链接'],['showQR','显示原帖二维码'],['showCaptureTime','显示采集时间'],['sourceMetadata','将所有选中帖链接写入文件信息'],['anonymousSources','匿名外观仍保留可反查的来源']] as [keyof Options,string][])source.append(toggle(label,!!o[k],v=>change({[k]:v})));
      source.append(el('p',{class:'xc-sub'},'PNG 写入 iTXt / XMP；PDF 写入文档信息和链接。聊天软件、剪贴板或转码可能移除元数据，保留原始下载文件最可靠。匿名不会自动清理正文与媒体里的身份信息。'));nodes.push(source);
      nodes.push(toggle('后续帖使用紧凑作者栏',o.compactReplies,v=>change({compactReplies:v})));
      const pdf=el('details',{class:'xc-details'},el('summary',{},'PDF 与字体'));
      pdf.append(select('PDF 页面',[['long','单张长页（默认）'],['pages','分页文档']],o.pdfMode,v=>change({pdfMode:v})),select('分页尺寸',[['a4','A4 高度'],['letter','Letter 高度']],o.pdfPage,v=>change({pdfPage:v})),el('p',{class:'xc-sub'},'PDF 正文保留真实文本。首次需要联网下载约 16 MB 的 Noto CJK 字体并本地缓存，不上传贴文。也可导入允许嵌入的本地 TTF / OTF 字体。字形外观可能与系统字体略有差异。'));
      const fontInput=el('input',{type:'file',accept:'.otf,.ttf,.ttc,.woff,.woff2',class:'xc-file','aria-label':'导入 PDF 字体',onChange:(e:Event)=>void this.importFont((e.target as HTMLInputElement).files?.[0])});pdf.append(fontInput,el('div',{class:'xc-button-row',style:'margin-top:10px'},button('预先准备 PDF 字体',()=>void this.prepareFont()),button('清除字体缓存',()=>{useMemoryFont(new Uint8Array());void clearFont();this.toast('字体缓存已清理。');})));
      nodes.push(pdf);
      const defaults=el('details',{class:'xc-details'},el('summary',{},'预设与采集限制'),range('单次采集帖子上限',o.maxPosts,5,250,5,v=>change({maxPosts:v})),range('单次滚动步数上限',o.maxScrolls,1,60,1,v=>change({maxScrolls:v})),el('p',{class:'xc-sub'},'达到上限后保留已采集内容，可手动继续。不会自动点赞、发帖或抓取隐藏接口。'));
      const presetInput=el('input',{type:'file',accept:'.json,application/json',class:'xc-file','aria-label':'导入样式预设',onChange:(e:Event)=>void this.importPreset((e.target as HTMLInputElement).files?.[0])});defaults.append(el('div',{class:'xc-button-row'},button('保存当前预设',()=>void this.savePreset()),button('导出样式预设',()=>this.downloadPreset())),el('p',{class:'xc-sub'},'导入样式预设 JSON'),presetInput);nodes.push(defaults);
    }
    this.controls.replaceChildren(...nodes);
  }
  private move(id:string,delta:number){const i=this.order.indexOf(id),j=i+delta;if(j<0||j>=this.order.length)return;[this.order[i],this.order[j]]=[this.order[j],this.order[i]];this.render();this.renderControls();}
  private async rescan(){if(!this.collector)return;await this.collector.scan();this.capture.posts=mergePosts(this.capture.posts,this.collector.posts);this.order=[...new Set([...this.order,...this.capture.posts.map(p=>p.id)])];this.render();this.renderControls();await this.refreshAssets();this.toast('候选已更新；保留了你本次的勾选与排序。');}
  private async collectMore(){
    if(this.abort){this.abort.abort();return;}if(!this.collector)return;
    this.abort=new AbortController();this.renderControls();this.toast('正在有界滚动采集：保持页面打开；可随时停止。',true);
    try{await this.collector.loadMore(this.options.maxPosts,this.options.maxScrolls,this.abort.signal,(n,step)=>this.toast(`正在采集 · ${n} 条候选 · 第 ${step} 步`,true));}
    catch(e){if((e as Error).name!=='AbortError')this.toast((e as Error).message);}
    finally{this.abort=undefined;if(!this.closed){await this.rescan();this.toast('采集已结束。请在「内容」中确认范围，不代表已取得全站全部回复。');}}
  }
  private async savePreset(){const name=prompt('预设名称（不会包含帖子内容）','我的卡片');if(!name?.trim())return;this.saved[name.trim().slice(0,50)]={...this.options};try{await this.host.setValue('presets',this.saved);}catch{this.toast('预设存储空间不足；可先导出 JSON，或减少含背景图片的预设。');return;}this.renderControls();this.toast('预设已保存到当前浏览器。两端可通过 JSON 导入 / 导出共用。');}
  private downloadPreset(){const blob=new Blob([JSON.stringify({format:'x-capture-style',version:1,options:this.options},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=el('a',{href:url,download:'x-capture-style.json'});this.shadow.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  private async importPreset(file?:File){if(!file)return;try{if(file.size>8*1024*1024)throw new Error('预设文件过大。');const json=JSON.parse(await file.text());if(json.format!=='x-capture-style'||json.version!==1||!json.options)throw new Error('不是支持的 X Capture 样式预设。');this.update(normalizeOptions(json.options),true);await this.prepareBackground();this.render();this.toast('预设已导入，仍可继续调参。');}catch(e){this.toast((e as Error).message);}}
  private async prepareBackground(){
    const src=this.options.bgImage;if(!src||this.assets.has(src))return;
    try{this.assets.set(src,await decodeData(src));}catch{this.toast('背景图片无法解码，请重新选择。');}
  }
  private async importBackground(file?:File){
    if(!file)return;
    try{
      if(!/^image\/(png|jpeg|webp)$/.test(file.type))throw new Error('请选择 PNG、JPEG 或 WebP 图片。');
      if(file.size>20*1024*1024)throw new Error('背景图片超过 20 MB，请选较小版本。');
      const data=await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('图片读取失败。'));r.readAsDataURL(file);});
      const asset=await decodeData(data);if(asset.width*asset.height>50000000)throw new Error('背景图片超过 5000 万像素，请先缩小。');
      const k=Math.min(1,2048/Math.max(asset.width,asset.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(asset.width*k));canvas.height=Math.max(1,Math.round(asset.height*k));
      const ctx=canvas.getContext('2d')!;ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(asset.image,0,0,canvas.width,canvas.height);
      const src=canvas.toDataURL('image/jpeg',.86);canvas.width=canvas.height=1;
      if(src.length>2500000)throw new Error('图片处理后仍偏大，请选择更简洁的壁纸。');
      if(this.options.bgImage)this.assets.delete(this.options.bgImage);
      this.assets.set(src,await decodeData(src));this.update({background:'image',bgImage:src},true);this.render();this.toast('背景已本地保存。仅背景副本会优化体积，不改变正文导出清晰度。');
    }catch(e){this.toast((e as Error).message);}
  }
  private async importFont(file?:File){if(!file)return;try{if(file.size>32*1024*1024)throw new Error('字体超过 32 MB。');const b=new Uint8Array(await file.arrayBuffer());await cacheFont(b);useMemoryFont(b);this.toast('字体已本地缓存。实际嵌入能力将在 PDF 导出时验证。');}catch(e){this.toast((e as Error).message);}}
  private async prepareFont(){try{await loadPdfFont(this.host,s=>this.toast(s,true));this.toast('PDF 字体已准备好，可离线复用。');}catch(e){this.toast((e as Error).message);}}
  private setBusy(value:boolean){this.busy=value;this.studio.classList.toggle('xc-busy',value);}
  private async makeBlob(type:'png'|'pdf'):Promise<Blob>{
    if(!this.selected.size)throw new Error('请先选择要导出的帖子。');
    if(this.scene.warnings.length&&!confirm('当前内容有提示：\n'+this.scene.warnings.slice(0,5).join('\n')+'\n\n仍按当前预览导出？'))throw new Error('已取消导出。');
    await this.prepareBackground();this.render();const s=this.scene,o={...this.options},capture=this.capture,selected=new Set(this.selected);
    if(type==='png'){this.toast('正在生成高清 PNG 与来源信息…',true);return exportPNG(s,this.assets,capture,selected,o);}
    const font=await loadPdfFont(this.host,s=>this.toast(s,true));return exportPDF(s,this.assets,capture,selected,o,font,s=>this.toast(s,true));
  }
  async generate(type:'png'|'pdf'){
    if(this.busy||this.closed)return;this.setBusy(true);
    try{const blob=await this.makeBlob(type);if(!this.closed)this.showResult(blob,type);}
    catch(e){this.toast((e as Error).message||'导出失败，请降低清晰度或重试。');}
    finally{if(!this.closed)this.setBusy(false);}
  }
  private showResult(blob:Blob,type:'png'|'pdf'){
    if(this.lastResult){const url=this.lastResult.url;setTimeout(()=>URL.revokeObjectURL(url),60000);}
    const root=rootPost(this.capture),identity=this.options.anonymize?'anonymous':(root?.author.handle||'capture'),filename=`x-capture-${identity}-${this.options.anonymize?Date.now():root?.id||Date.now()}.${type}`,url=URL.createObjectURL(blob);
    this.lastResult={blob,type,filename,url};this.status.hidden=true;
    const card=el('div',{class:'xc-result-card'},el('button',{type:'button',class:'xc-iconbtn xc-result-close','aria-label':'关闭导出结果',onClick:()=>this.closeOverlay()},icon('close')),el('h2',{class:'xc-result-title'},type==='png'?'高清图片已生成':'文本型 PDF 已生成'),el('div',{class:'xc-result-meta'},`${(blob.size/1024/1024).toFixed(2)} MB · ${this.selected.size} 条选中内容 · ${type==='pdf'?(this.options.pdfMode==='long'?'单张长页':'分页模式'):this.options.scale+'× 输出'}`));
    if(type==='png')card.append(el('img',{src:url,alt:'本次生成的 PNG',class:'xc-result-preview'}));
    const download=el('a',{href:url,download:filename,class:'xc-button primary',style:'text-decoration:none',role:'button'},icon('download',16),'保存文件');
    const row=el('div',{class:'xc-button-row'},download);
    const file=new File([blob],filename,{type:blob.type});
    let canShare=false;try{canShare=!!navigator.canShare?.({files:[file]});}catch{}
    if(canShare)row.append(el('button',{type:'button',class:'xc-button',onClick:()=>{navigator.share({files:[file]}).catch(e=>{if(e.name!=='AbortError')this.toast('系统分享未完成，可改用保存文件。');});}},icon('share',16),'系统分享'));
    row.append(el('a',{href:url,target:'_blank',rel:'noopener',class:'xc-button',role:'button'},'打开查看'));
    card.append(row,el('p',{class:'xc-sub'},'请保留下载的原文件。转发、图片压缩或复制到剪贴板可能移除文件中的来源链接元数据。PNG 本身不是可点击网页。Finder 的「来源」另由浏览器写入，Blob 下载可能只显示 x.com；文件内部仍保存原帖链接。'));
    if(this.options.sourceMetadata&&(!this.options.anonymize||this.options.anonymousSources)){const origin=provenance(this.capture,this.selected,this.options).root;if(origin)card.append(el('a',{href:origin,target:'_blank',rel:'noopener noreferrer',class:'xc-source-result',style:'color:#49b7ff;overflow-wrap:anywhere'},'原帖：'+origin));}
    this.showOverlay(card);download.focus();
    if(!mobileDevice())download.click();
  }
  private async copyImage(){
    if(this.busy||this.closed)return;
    if(!navigator.clipboard?.write||typeof ClipboardItem==='undefined'){this.toast('此环境不支持复制图片，请使用「导出 PNG → 保存文件 / 系统分享」。');return;}
    this.setBusy(true);
    try{const promise=this.makeBlob('png');await navigator.clipboard.write([new ClipboardItem({'image/png':promise})]);this.toast('图片已复制。剪贴板可能移除元数据；需要来源信息请保存 PNG 原文件。');}
    catch(e){this.toast((e as Error).message||'无法复制，请改用导出文件。');}
    finally{if(!this.closed)this.setBusy(false);}
  }
  private async copyText(){try{const posts=this.order.filter(id=>this.selected.has(id)).map(id=>this.capture.posts.find(p=>p.id===id)!).filter(Boolean);const value=posts.map(p=>contextText(p,!this.options.anonymize,!this.options.anonymize||this.options.anonymousSources)).join('\n\n────────\n\n');await navigator.clipboard.writeText(value);this.toast('已复制选中内容的文本。');}catch{this.toast('此环境不允许读取剪贴板权限，请使用文本型 PDF。');}}
  private gallery(src:string){const images=this.scene.commands.filter(c=>c.type==='image'&&c.w>80);const urls=[...new Set(images.map(c=>c.type==='image'?c.src:''))];let idx=urls.indexOf(src);
    const show=()=>{const url=urls[idx],asset=this.assets.get(url);if(!asset)return;const card=el('div',{class:'xc-result-card',style:'width:800px'},el('button',{type:'button',class:'xc-iconbtn xc-result-close','aria-label':'关闭媒体预览',onClick:()=>this.closeOverlay()},icon('close')),el('h2',{class:'xc-result-title'},'媒体预览'),el('div',{class:'xc-result-meta'},`${idx+1} / ${urls.length} · 仅用于核对显示内容`),el('img',{src:asset.dataUrl,class:'xc-gallery-img',alt:'帖子媒体预览'}),el('div',{class:'xc-button-row',style:'margin-top:15px'},button('上一张',()=>{idx=(idx-1+urls.length)%urls.length;show();}),button('下一张',()=>{idx=(idx+1)%urls.length;show();})));this.showOverlay(card);};show();}
  private showOverlay(card:HTMLElement){this.closeOverlay();this.overlay=el('div',{class:'xc-result',role:'dialog','aria-modal':'true'},card);this.studio.append(this.overlay);this.overlay.querySelector<HTMLElement>('button,a')?.focus();}
  private closeOverlay(){this.overlay?.remove();this.overlay=undefined;}
}
