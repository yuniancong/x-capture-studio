import {resourceDiagnostics,attachObservations} from '../media/discovery';
import {passiveMediaLog} from '../media/passive-log';
import {MediaDiscoveryClient,DiscoveryStatus} from '../media/discovery-client';
import {MediaResolver} from '../media/resolver';
import type {MediaQuality} from '../media/quality';
import {visitMedia} from '../media/resources';
import {Capture, Host} from '../core/model';
import {TextFormat, TextOptions, TextPrivacy, TextResult, TEXT_DEFAULTS, normalizeTextOptions, serializeText} from '../export/text';
import {mobileDevice} from '../export/png';
import {el, button, icon} from './dom';
import {segment, toggle} from './controls';

type Snapshot = {capture: Capture; selected: Set<string>; order: string[]; privacy: TextPrivacy; quality?: MediaQuality};
type UI = {mediaChanged?(): void; notify(message: string): void; show(card: HTMLElement): void; close(): void; refresh?():Promise<void>; showPage?(done:()=>void):()=>void;};
const formatName = (format: TextFormat) => format === 'text' ? '纯文本' : format === 'ai' ? 'AI 上下文' : 'Markdown';

/** Shares the current selection, but owns text-only options. Visual styling never rewrites text. */
export class TextTools {
  private options: TextOptions = {...TEXT_DEFAULTS};
  private format: 'text' | 'markdown' = 'markdown';
  private urls = new Set<string>();
  private disposed = false;
  private resolver?:MediaResolver;private inspection?:Promise<void>;private inspectionAbort?:AbortController;
  private inspectionKey='';private inspectionLabel='未检查高清/播放清单';private updatePreview?:()=>void;
  private diagnosticNode?:HTMLElement;private resourceStatus?:HTMLElement;private discoveryStatus?:HTMLElement;private discovery:MediaDiscoveryClient;
  private returnFromPage?:()=>void;private inspectGeneration=0;

  constructor(private snapshot: () => Snapshot, private host: Host, private ui: UI) {
    if(host.readResource)this.resolver=new MediaResolver((request,signal)=>host.readResource!(request,signal));
    this.discovery=new MediaDiscoveryClient(host,()=>{const s=this.snapshot();return {...s,quotes:this.options.includeQuote,private:!!(s.privacy.anonymize&&!s.privacy.anonymousSources)||!this.options.includeMedia};},
      ()=>this.ui.refresh?.()||Promise.resolve(),status=>{if(this.discoveryStatus)this.discoveryStatus.textContent=this.discoveryMessage(status);if(!this.disposed){this.updatePreview?.();this.updateDiagnostics();this.ui.mediaChanged?.();}},
      ()=>{this.returnFromPage?.();this.returnFromPage=undefined;if(!this.disposed)void this.prepareResources(true);});
  }
  async load() {
    const value = await this.host.getValue('text-export-options', TEXT_DEFAULTS).catch(() => TEXT_DEFAULTS);
    this.options = normalizeTextOptions(value);
    this.options.includeSensitiveMedia=false; // Per-session, explicit consent only.
  }
  dispose() {
    this.disposed = true;++this.inspectGeneration;this.discovery.dispose();this.returnFromPage?.();this.returnFromPage=undefined;this.inspectionAbort?.abort();this.resolver?.clear();this.updatePreview=undefined;
    // Allow in-progress native downloads to retain their Blob URLs briefly.
    const urls = [...this.urls]; this.urls.clear();
    setTimeout(() => urls.forEach(url => URL.revokeObjectURL(url)), 60000);
  }
  selectionChanged():void {this.discovery.invalidateScope();}
  /** Quality levels only change which known link is written; refresh the open preview. */
  qualityChanged():void {if(!this.disposed)this.updatePreview?.();}
  /** Local only: media this page already requested, attached by CDN media identity. No request. */
  private attachPassive():void {
    if(this.disposed||!this.options.includeMedia)return;const s=this.snapshot();
    if(s.privacy.anonymize&&!s.privacy.anonymousSources)return;
    const records=passiveMediaLog.entries();if(records.length)attachObservations(s.capture,s.selected,records,this.options.includeQuote);
  }
  result(format: TextFormat = this.format): TextResult {
    const s = this.snapshot();
    return serializeText(s.capture, s.selected, s.order, this.options, format, s.privacy, s.quality);
  }
  render(): HTMLElement {
    const root = el('section', {class: 'xc-text-tools', 'aria-label': '文本导出'});
    const preview = el('textarea', {class: 'xc-text-preview', readonly: true, spellcheck: 'false', wrap: 'soft', 'aria-label': '文本预览'});
    const meta = el('p', {class: 'xc-text-meta', role: 'status'});
    const warning = el('p', {class: 'xc-warning', hidden: true});
    const copy = button('复制 Markdown', () => void this.copy(this.format), 'xc-button primary');
    const download = button('导出 Markdown', () => this.exportFile(this.format));
    copy.dataset.action = 'copy-text-format'; download.dataset.action = 'export-text';
    const ai = button('复制给 AI', () => void this.copy('ai'), 'xc-button full'); ai.dataset.action = 'copy-ai';
    const update = () => {
      this.attachPassive();
      const result = this.result(); preview.value = result.text;
      meta.textContent = `${result.postCount} 条已选 · ${result.text.length.toLocaleString()} 字符 · UTF-8`;
      const copyLabel = '复制' + (this.format === 'text' ? '纯文本' : ' Markdown');
      const exportLabel = this.format === 'text' ? '导出 TXT' : '导出 Markdown';
      copy.textContent = copyLabel; copy.setAttribute('aria-label', copyLabel);
      download.textContent = exportLabel; download.setAttribute('aria-label', exportLabel);
      copy.disabled = download.disabled = ai.disabled = !result.postCount;
      warning.textContent = result.warnings.join('\n'); warning.hidden = !result.warnings.length;
      preview.placeholder = '请在「内容」中选择要复制或导出的帖子。';
    };
    root.append(
      el('p', {class: 'xc-sub'}, '与 PNG / PDF 使用同一选区、同一顺序。正文、回复与引用均来自已采集内容，不识图、不改写原文。'),
      segment([['text', '纯文本'], ['markdown', 'Markdown']], this.format, value => {
        this.format = value as 'text' | 'markdown';
        root.querySelectorAll('.xc-segment button').forEach(b => b.classList.toggle('is-active', b.textContent === (this.format === 'text' ? '纯文本' : 'Markdown')));
        update();
      }),
      meta,
      el('div', {class: 'xc-button-row xc-text-actions'}, copy, download),
      ai,
      el('p', {class: 'xc-sub'}, '「复制给 AI」使用 Markdown，并附简短范围说明。默认不含互动数字；图片与视频链接保留在原位置。'),
      warning, preview,
      button('全选预览文本', () => { preview.focus(); preview.select(); preview.setSelectionRange(0, preview.value.length); }, 'xc-textbtn')
    );
    const details = el('details', {class: 'xc-details xc-text-options'}, el('summary', {}, '文本包含哪些信息'));
    const fields: [keyof TextOptions, string][] = [
      ['includeAuthor', '作者昵称与账号'], ['includeTime', '发布时间与编辑状态'],
      ['includeSources', '每条帖子的来源链接'], ['includeRelations', '回复关系'],
      ['includeQuote', '引用与嵌入帖'], ['includeNotes', '社区注释 / 补充背景'],
      ['includeMedia', '图片 / 视频标注与链接'], ['includeStats', '互动数据'],
      ['includeCaptureTime', '采集时间']
    ];
    for (const [key, label] of fields) details.append(toggle(label, this.options[key], value => {
      this.options = {...this.options, [key]: value}; this.discovery.invalidateScope(); update();
      void this.host.setValue('text-export-options', {...this.options,includeSensitiveMedia:false}).catch(() => this.ui.notify('文本设置暂未持久保存；本次设置仍然有效。'));
    }));
    details.append(el('p', {class: 'xc-sub'}, '这些是文本专用开关，不改变图片 / PDF 外观。匿名设置仍与工作台共享；正文和替代文字中的身份不会自动打码。'));
    const more=el('details',{class:'xc-details xc-media-options'},el('summary',{},'媒体资源与高清检查'));
    const inspect=button('检查高清 / 视频 / 字幕',()=>void this.inspectMedia(),'xc-button');
    inspect.dataset.action='inspect-media';
    this.resourceStatus=el('p',{class:'xc-sub',role:'status'},this.inspectionLabel);
    more.append(inspect,button('停止检查',()=>void this.stopInspection(),'xc-textbtn'),this.resourceStatus,
      el('p',{class:'xc-sub'},'仅检查已选内容。原图不可用时自动降级；保留 MP4 / HLS / DASH 和字幕。流的可用性、清晰度与文件直链分别标注。不下载视频分片。'));
    this.discoveryStatus=el('p',{class:'xc-sub',role:'status','data-discovery-status':''},this.discoveryMessage(this.discovery.status));
    more.append(this.discoveryStatus);
    if(this.host.kind==='extension')more.append(
      button('启用桌面视频观察',()=>void this.host.openObservationPermission?.().then(ok=>{if(!ok)this.ui.notify('当前环境无法打开权限页；可继续使用基础取链。');}),'xc-textbtn'),
      button('返回网页播放视频',()=>{
        if(!this.discovery.active){this.ui.notify('先点击“检查高清 / 视频 / 字幕”开启约 30 秒观察；未授权时先启用桌面视频观察。');return;}
        this.returnFromPage?.();this.returnFromPage=this.ui.showPage?.(()=>void this.finishDiscovery());
      },'xc-button'),
      el('p',{class:'xc-sub'},'桌面请求观察是可选权限，仅主动检查时开启约 30 秒。返回网页播放后再回到结果；不会自动播放或刷新。归属不明确的资源不会塞进当前视频。'));
    for(const [key,label] of [['includeAllResources','完整资源：全部质量、音轨和验证状态'],['markdownImages','Markdown 使用可嵌入图片语法'],['includeSubtitles','附带已有字幕轨道与链接'],['includeSensitiveMedia','允许完整受限/签名链接（仅本人使用）']] as const){
      const control=toggle(label,this.options[key],value=>{
        if(key==='includeSensitiveMedia'&&value&&!confirm('签名/令牌链接可能授予临时访问权。仅在自己使用、不会公开分享时允许；不会移除或改写签名。是否继续？')){this.options[key]=false;const input=control.querySelector('input');if(input)input.checked=false;update();return;}
        this.options={...this.options,[key]:value};update();
        void this.host.setValue('text-export-options',{...this.options,includeSensitiveMedia:false}).catch(()=>{});
      });more.append(control);
    }
    this.diagnosticNode=el('pre',{class:'xc-resource-diagnostics'});
    more.append(el('details',{class:'xc-details'},el('summary',{},'资源诊断（不含链接与账号）'),this.diagnosticNode));
    this.updateDiagnostics();
    root.append(details,more);this.updatePreview=update;update();void this.prepareResources();return root;
  }
  private updateDiagnostics():void {const s=this.snapshot();if(this.diagnosticNode)this.diagnosticNode.textContent=resourceDiagnostics(s.capture,s.selected,this.options.includeQuote).join('\n');}
  private discoveryMessage(s:DiscoveryStatus):string {
    const names:Record<string,string>={idle:'尚未启动资源观察',starting:'正在启动资源观察',active:'短时观察中，可返回网页播放',
      expired:'观察窗口已结束',stopped:'观察已停止',unsupported:this.host.kind==='stay'?'Stay 使用 DOM 与页面可观察资源，不使用 Chrome 网络接口':'当前浏览器不支持网络观察',
      'permission-required':'尚未授权桌面请求观察；基础取链继续可用','scope-changed':'页面或选区已变化，旧观察已停止',unavailable:'请求观察未启动，保留基础取链结果'};
    return `${names[s.state]||s.state} · 已发现 ${s.observed} · 明确关联 ${s.matched} · 待确认 ${s.ambiguous+s.unmatched}${s.formats.length?' · '+s.formats.join(' / ').toUpperCase():''}${s.limited?' · 达到数量上限':''}`;
  }
  private async inspectMedia():Promise<void> {
    const generation=++this.inspectGeneration;
    this.inspectionAbort?.abort();if(this.inspection)await this.inspection;
    if(this.disposed||generation!==this.inspectGeneration)return;
    this.inspectionKey='';await this.discovery.start();
    if(!this.discovery.active&&!this.disposed)await this.prepareResources(true);
  }
  private async stopInspection():Promise<void> {
    ++this.inspectGeneration;this.inspectionAbort?.abort();await this.discovery.stop(false);
    this.returnFromPage?.();this.returnFromPage=undefined;
  }
  private async finishDiscovery():Promise<void> {
    await this.discovery.stop(true);this.returnFromPage?.();this.returnFromPage=undefined;
    if(!this.disposed)await this.prepareResources(true);
  }
  prepareResources(force=false):Promise<void> {
    this.attachPassive();
    if(this.disposed||this.discovery.active||!this.resolver||!this.options.includeMedia)return Promise.resolve();
    const s=this.snapshot();
    // No verification network traffic for anonymized media unless explicitly allowed.
    if(s.privacy.anonymize&&!s.privacy.anonymousSources)return Promise.resolve();
    const keys:string[]=[];visitMedia(s.capture,s.selected,m=>keys.push([m.scopeId,m.src,m.sourceUrl].join('|')),this.options.includeQuote);
    const key=keys.join('\n')+'|'+this.options.includeSensitiveMedia;
    if(this.inspection)return this.inspection;if(!force&&this.inspectionKey===key)return Promise.resolve();
    if(!keys.length)return Promise.resolve();if(force)this.resolver.clear();this.inspectionKey=key;this.inspectionAbort=new AbortController();
    this.inspectionLabel='正在检查媒体；可以停止，失败将保留页面已提供的地址。';if(this.resourceStatus)this.resourceStatus.textContent=this.inspectionLabel;
    this.inspection=this.resolver.resolveCapture(s.capture,new Set(s.selected),this.inspectionAbort.signal,this.options.includeSensitiveMedia,this.options.includeQuote,(done,total)=>{
      this.inspectionLabel=`已检查 ${done}/${total} 项媒体`;if(this.resourceStatus)this.resourceStatus.textContent=this.inspectionLabel;
    }).then(r=>{this.inspectionLabel=`媒体检查${r.partial?'部分完成':'完成'} · ${r.requests} 次有界请求 · 未验证项保留原链接`;
    }).catch(()=>{this.inspectionLabel='检查未完成，保留已发现的资源。';}).finally(()=>{
      this.inspection=undefined;if(this.resourceStatus)this.resourceStatus.textContent=this.inspectionLabel;if(!this.disposed){this.updatePreview?.();this.updateDiagnostics();this.ui.mediaChanged?.();}
    });return this.inspection;
  }
  async copy(format:TextFormat='text') {
    if(this.disposed)return;
    const current=this.result(format);if(!current.postCount){this.ui.notify('尚未选择帖子，剪贴板未更改。');return;}
    const ready=this.prepareResources();
    // Capture the requested selection now. A later selection change cannot change an in-flight copy.
    const snapshot=this.snapshot(),selected=new Set(snapshot.selected),order=[...snapshot.order],options={...this.options},privacy={...snapshot.privacy},quality=snapshot.quality&&{...snapshot.quality};
    const result=()=>serializeText(snapshot.capture,selected,order,options,format,privacy,quality);
    try{
      if(this.inspection&&typeof navigator.clipboard?.write==='function'&&typeof ClipboardItem!=='undefined'){
        // Promise-valued ClipboardItem keeps iOS's trusted user-gesture boundary.
        const data=ready.then(()=>new Blob([result().text],{type:'text/plain'}));
        await navigator.clipboard.write([new ClipboardItem({'text/plain':data})]);
      }else{
        if(this.inspection)await ready;
        if(typeof navigator.clipboard?.writeText!=='function')throw new Error('clipboard unavailable');
        await navigator.clipboard.writeText(result().text);
      }
      if(!this.disposed)this.ui.notify(`已复制${formatName(format)} · ${current.postCount} 条。`);
    }catch{await ready;if(!this.disposed)this.openResult(result(),'浏览器未允许写入剪贴板。完整正文在下方，可全选复制或保存文件。');}
  }
  async exportFile(format:TextFormat='markdown') {
    if(this.disposed)return;const snapshot=this.snapshot(),selected=new Set(snapshot.selected),order=[...snapshot.order],options={...this.options},privacy={...snapshot.privacy},quality=snapshot.quality&&{...snapshot.quality};
    if(!selected.size){this.ui.notify('尚未选择帖子，请先在「内容」中勾选。');return;}
    await this.prepareResources();if(this.disposed)return;
    const result=serializeText(snapshot.capture,selected,order,options,format,privacy,quality);const download=this.openResult(result);if(!mobileDevice())download.click();
  }
  private openResult(result: TextResult, message?: string): HTMLAnchorElement {
    const blob = new Blob([result.text], {type: result.mimeType}), url = URL.createObjectURL(blob);
    this.urls.add(url);
    if (this.urls.size > 8) {
      const old = this.urls.values().next().value!; this.urls.delete(old);
      setTimeout(() => URL.revokeObjectURL(old), 60000);
    }
    const preview = el('textarea', {class: 'xc-text-preview xc-text-result-preview', readonly: true, spellcheck: 'false', wrap: 'soft', value: result.text, 'aria-label': '导出文本内容'});
    const download = el('a', {class: 'xc-button primary', href: url, download: result.filename, 'data-action': 'save-text-file'}, icon('download', 15), '保存 ' + result.extension.toUpperCase() + ' 文件');
    const selectAll = button('全选文本', () => { preview.focus(); preview.select(); preview.setSelectionRange(0, preview.value.length); });
    const actions = el('div', {class: 'xc-button-row'}, download, selectAll);
    const file = new File([blob], result.filename, {type: blob.type});
    let canShare = false;
    try { canShare = !!navigator.share && !!navigator.canShare?.({files: [file]}); } catch { /* Native file sharing is optional. */ }
    if (canShare) actions.append(button('系统分享', () => {
      void navigator.share({files: [file], title: result.filename}).catch(error => {
        if (error?.name !== 'AbortError' && !this.disposed) this.ui.notify('系统未完成分享，请使用保存文件。');
      });
    }));
    const card = el('div', {class: 'xc-result-card xc-text-result-card'},
      el('button', {type: 'button', class: 'xc-iconbtn xc-result-close', 'aria-label': '关闭文本结果', onClick: () => this.ui.close()}, icon('close')),
      el('h2', {class: 'xc-result-title'}, message ? '手动复制文本' : '文本文件已准备好'),
      el('p', {class: 'xc-result-meta'}, `${formatName(result.format)} · ${result.postCount} 条 · UTF-8 · ${Math.ceil(blob.size / 1024)} KB`),
      message ? el('p', {class: 'xc-warning', role: 'status'}, message) : null,
      preview, actions,
      el('p', {class: 'xc-sub'}, result.filename + ' · 仅含本次已选内容。图片 / 视频在原位置附上标注与可获取的链接，不下载媒体。')
    );
    this.ui.show(card); return download;
  }
}
