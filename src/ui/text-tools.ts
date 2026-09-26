import {Capture, Host} from '../core/model';
import {TextFormat, TextOptions, TextPrivacy, TextResult, TEXT_DEFAULTS, normalizeTextOptions, serializeText} from '../export/text';
import {mobileDevice} from '../export/png';
import {el, button, icon} from './dom';
import {segment, toggle} from './controls';

type Snapshot = {capture: Capture; selected: Set<string>; order: string[]; privacy: TextPrivacy};
type UI = {notify(message: string): void; show(card: HTMLElement): void; close(): void;};
const formatName = (format: TextFormat) => format === 'text' ? '纯文本' : format === 'ai' ? 'AI 上下文' : 'Markdown';

/** Shares the current selection, but owns text-only options. Visual styling never rewrites text. */
export class TextTools {
  private options: TextOptions = {...TEXT_DEFAULTS};
  private format: 'text' | 'markdown' = 'markdown';
  private urls = new Set<string>();
  private disposed = false;
  constructor(private snapshot: () => Snapshot, private host: Host, private ui: UI) {}
  async load() {
    const value = await this.host.getValue('text-export-options', TEXT_DEFAULTS).catch(() => TEXT_DEFAULTS);
    this.options = normalizeTextOptions(value);
  }
  dispose() {
    this.disposed = true;
    // Allow in-progress native downloads to retain their Blob URLs briefly.
    const urls = [...this.urls]; this.urls.clear();
    setTimeout(() => urls.forEach(url => URL.revokeObjectURL(url)), 60000);
  }
  result(format: TextFormat = this.format): TextResult {
    const s = this.snapshot();
    return serializeText(s.capture, s.selected, s.order, this.options, format, s.privacy);
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
      el('p', {class: 'xc-sub'}, '「复制给 AI」使用 Markdown，并附简短范围说明。默认不包含互动数字或媒体文件地址。'),
      warning, preview,
      button('全选预览文本', () => { preview.focus(); preview.select(); preview.setSelectionRange(0, preview.value.length); }, 'xc-textbtn')
    );
    const details = el('details', {class: 'xc-details xc-text-options'}, el('summary', {}, '文本包含哪些信息'));
    const fields: [keyof TextOptions, string][] = [
      ['includeAuthor', '作者昵称与账号'], ['includeTime', '发布时间与编辑状态'],
      ['includeSources', '每条帖子的来源链接'], ['includeRelations', '回复关系'],
      ['includeQuote', '引用与嵌入帖'], ['includeNotes', '社区注释 / 补充背景'],
      ['includeMedia', '图片 / 视频占位说明'], ['includeStats', '互动数据'],
      ['includeCaptureTime', '采集时间']
    ];
    for (const [key, label] of fields) details.append(toggle(label, this.options[key], value => {
      this.options = {...this.options, [key]: value}; update();
      void this.host.setValue('text-export-options', this.options).catch(() => this.ui.notify('文本设置暂未持久保存；本次设置仍然有效。'));
    }));
    details.append(el('p', {class: 'xc-sub'}, '这些是文本专用开关，不改变图片 / PDF 外观。匿名设置仍与工作台共享；正文和替代文字中的身份不会自动打码。'));
    root.append(details); update(); return root;
  }
  async copy(format: TextFormat = 'text') {
    if (this.disposed) return;
    const result = this.result(format);
    if (!result.postCount) { this.ui.notify('尚未选择帖子，剪贴板未更改。'); return; }
    try {
      if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('clipboard unavailable');
      // This call happens directly inside the click handler, before any await/storage/network operation.
      await navigator.clipboard.writeText(result.text);
      if (!this.disposed) this.ui.notify(`已复制${formatName(format)} · ${result.postCount} 条。`);
    } catch {
      if (!this.disposed) this.openResult(result, '浏览器未允许写入剪贴板。正文已保留在下方，可全选后手动复制，或保存为文件。');
    }
  }
  exportFile(format: TextFormat = 'markdown') {
    if (this.disposed) return;
    const result = this.result(format);
    if (!result.postCount) { this.ui.notify('尚未选择帖子，请先在「内容」中勾选。'); return; }
    const download = this.openResult(result);
    if (!mobileDevice()) download.click();
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
      el('p', {class: 'xc-sub'}, result.filename + ' · 仅含本次已选内容。图片 / 视频使用原有替代文字或类型占位，不下载媒体。')
    );
    this.ui.show(card); return download;
  }
}
