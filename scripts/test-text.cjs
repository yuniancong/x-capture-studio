/* Text serialization is tested through its public entry point, without DOM or media. */
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../dist/core-test.cjs');
const post = (id, text, handle = 'alice', parentId) => ({
  id: String(id), url: `https://x.com/${handle}/status/${id}?s=20`, kind: 'post',
  author: { name: handle === 'alice' ? '作者甲' : '作者乙', handle },
  blocks: [{ kind: 'text', runs: [{ text }] }], metrics: { likes: '42', views: '99' },
  parentId: parentId && String(parentId), relationEvidence: parentId ? 'data' : 'unknown',
  warnings: [], capturedAt: '2026-09-26T02:08:00Z', published: '2026-09-25T10:00:00Z'
});
const main = post(1, '主帖中文 👨‍👩‍👧‍👦 e\u0301');
const reply = post(2, '回复内容', 'bob', 1);
const follow = post(3, '作者串', 'alice', 1);
const capture = posts => ({ rootId: '1', sourceUrl: main.url, capturedAt: '2026-09-26T02:08:00Z', posts, collectionNotes: [] });
const run = (posts = [main, reply, follow], { format = 'text', opts = {}, privacy = {}, order = posts.map(p => p.id), selected = order } = {}) => C.serializeText(capture(posts), new Set(selected), order, { ...C.TEXT_DEFAULTS, ...opts }, format, privacy);

test('text: defaults preserve context and omit metrics/capture time', () => {
  const x = run(); assert.equal(x.postCount, 3);
  for (const s of ['主帖中文', '回复内容', '@alice', 'https://x.com/alice/status/1', '2026-09-25T10:00:00Z']) assert(x.text.includes(s));
  assert(!x.text.includes('?s=20')); assert(!x.text.includes('点赞：42')); assert(!x.text.includes('2026-09-26T02:08:00Z'));
});
test('text: exact selection and order, deduplicated; no unrelated root body', () => {
  const x = run(undefined, { order: ['2', '3', '2', '1'], selected: ['2', '3'] });
  assert.equal(x.postCount, 2); assert(x.text.indexOf('回复内容') < x.text.indexOf('作者串')); assert(!x.text.includes('主帖中文'));
});
test('text: empty selection is empty, cannot overwrite clipboard with a heading', () => { const x = run(undefined, { selected: [] }); assert.equal(x.text, ''); assert.equal(x.postCount, 0); });
test('text: format metadata and deterministic privacy-safe filename', () => {
  const x = run(); assert.equal(x.extension, 'txt'); assert(x.mimeType.includes('text/plain')); assert(x.filename.endsWith('.txt'));
  assert.equal(run(undefined, { format: 'markdown' }).extension, 'md');
  assert.equal(run(undefined, { privacy: { anonymize: true } }).filename, 'x-capture-anonymous-2026-09-26.txt');
});
test('text: newline/Unicode stays intact; original capture is not mutated', () => {
  const before = JSON.stringify(main); assert(run().text.includes('👨‍👩‍👧‍👦 e\u0301')); assert.equal(JSON.stringify(main), before);
  const p = post(4, '段落一\r\n\r\n段落二\n'); assert(run([p]).text.includes('段落一\n\n段落二'));
});
test('text: selected parent uses the export order; missing parent is not invented', () => {
  assert(run(undefined, { order: ['2', '1', '3'] }).text.includes('回复至：第 2 条'));
  assert(run([reply]).text.includes('父帖未加载'));
  assert(run(undefined, { selected: ['2'] }).text.includes('父帖未选中'));
});
test('text: same author without relationship is not called a continuation', () => {
  const x = run([main, post(4, '无关系帖子')]); assert(x.text.includes('同作者内容（关系未确认）'));
});
test('text: reply-to handle is retained only as observed evidence', () => {
  const p = post(8, '只有回复对象', 'bob'); p.replyToHandle = 'alice';
  assert(run([p]).text.includes('具体父帖未确认')); assert(!run([p], { privacy: { anonymize: true } }).text.includes('@alice'));
});
test('text: per-post canonical source and Article source', () => {
  const p = post(7, '文章'); p.kind = 'article'; p.url = 'https://x.com/i/article/7?utm_x=1'; p.title = '文章标题';
  const x = run([p]); assert(x.text.includes('https://x.com/i/article/7')); assert(!x.text.includes('?utm'));
});
test('text: unsupported/unknown source is marked, homepage never substituted', () => {
  const p = post(7, '可见引用'); p.url = 'https://x.com/'; assert(!run([p]).text.includes('https://x.com/')); assert(run([p]).text.includes('来源链接未获取'));
});
test('text: quote and embedded posts keep independent author/body/source', () => {
  const p = post(1, '正文'); p.quote = post(9, '引用正文', 'bob'); p.blocks.push({ kind: 'embed', post: post(10, '嵌入正文', 'bob') });
  for (const format of ['text', 'markdown', 'ai']) { const x = run([p], { format }); for (const s of ['引用帖子', '引用正文', '嵌入正文', '/bob/status/9', '/bob/status/10']) assert(x.text.includes(s)); }
});
test('text: media is observed placeholder, never a raw CDN address or generated caption', () => {
  const p = post(1, '正文'); p.blocks.push({ kind: 'media', media: { kind: 'image', src: 'https://pbs.twimg.com/secret.jpg', alt: '原有替代文字' } }, { kind: 'media', media: { kind: 'video', src: 'cdn', alt: '', duration: '02:31' } });
  const x = run([p]); assert(x.text.includes('[图片：原有替代文字]')); assert(x.text.includes('[视频 · 02:31]')); assert(!x.text.includes('pbs.twimg.com'));
});
test('text: poll, note, edit state and link cards are retained', () => {
  const p = post(1, '正文'); p.poll = { options: [{ text: '甲', percent: 67 }, { text: '乙' }], summary: '3 票 · 已结束' }; p.note = '页面可见的补充'; p.edited = '已编辑'; p.linkCard = { title: '官方页面', description: '描述', url: 'https://example.com/docs', image: 'cdn-secret' };
  const x = run([p]); for (const s of ['甲 67%', '3 票', '页面可见的补充', '已编辑', 'https://example.com/docs']) assert(x.text.includes(s)); assert(!x.text.includes('cdn-secret'));
});
test('text: time, stats and capture time are optional', () => {
  const x = run([main], { opts: { includeTime: false, includeStats: true, includeCaptureTime: true } });
  assert(!x.text.includes('2026-09-25T10:00:00Z')); assert(x.text.includes('点赞：42')); assert(x.text.includes('2026-09-26T02:08:00Z'));
});
test('text: author/source/relation/quote/note/media switches do not erase body', () => {
  const p = post(1, '仍保留正文'); p.quote = post(9, '引用应隐藏', 'bob'); p.note = '注释应隐藏'; p.blocks.push({ kind: 'media', media: { kind: 'image', src: 'cdn', alt: '图片应隐藏' } });
  const x = run([p], { opts: { includeAuthor: false, includeSources: false, includeRelations: false, includeQuote: false, includeNotes: false, includeMedia: false } });
  assert(x.text.includes('仍保留正文')); for (const s of ['@alice', 'x.com/', '引用应隐藏', '注释应隐藏', '图片应隐藏']) assert(!x.text.includes(s));
});
test('text: anonymization removes identities and source/relationship backlinks including quotes', () => {
  const p = post(1, '正文'); p.quote = post(9, '引用正文', 'bob'); const x = run([p, reply], { format: 'markdown', privacy: { anonymize: true } });
  for (const s of ['@alice', '@bob', '作者甲', '作者乙', 'x.com/']) assert(!x.text.includes(s));
  assert(x.text.includes('匿名用户')); assert(x.warnings.some(s => s.includes('正文')));
});
test('text: anonymous explicit sources opt-in restores sources only, not names', () => {
  const x = run([main], { privacy: { anonymize: true, anonymousSources: true } }); assert(x.text.includes('/alice/status/1')); assert(!x.text.includes('@alice')); assert(!x.text.includes('作者甲'));
});
test('text: anonymous mode does not silently rewrite identifiers inside the original body', () => {
  const x = run([post(1, '原文提到 @alice')], { privacy: { anonymize: true } }); assert(x.text.includes('原文提到 @alice')); assert(x.warnings.some(s => s.includes('正文')));
});
test('text: folding warnings are exported rather than falsely claiming completeness', () => {
  const p = post(1, '未展开'); p.warnings = ['正文可能折叠：请展开后采集。']; const x = run([p], { format: 'ai' }); assert(x.text.includes('仅包含本次已选择')); assert(x.text.includes('正文可能折叠')); assert(!x.text.includes('全部评论已获取'));
});
test('text: AI copy is structured Markdown with a short scope note', () => {
  const x = run(undefined, { format: 'ai' }); assert(x.text.startsWith('# X Capture Context')); assert(x.text.includes('仅包含本次已选择')); assert(x.text.includes('## 1')); assert(x.text.length > run().text.length);
});
test('text: Markdown Article headings/lists/quote/code and rich runs', () => {
  const p = post(1, '正文'); p.kind = 'article'; p.title = '测试文章';
  p.blocks = [{ kind: 'text', level: 2, runs: [{ text: '章节' }] }, { kind: 'text', list: '1.', runs: [{ text: '条目' }] }, { kind: 'text', quote: true, runs: [{ text: '引用段落' }] }, { kind: 'text', code: true, runs: [{ text: 'const x = `<safe>`;\n```' }] }, { kind: 'text', runs: [{ text: '加粗', bold: true }, { text: '斜体', italic: true }, { text: '官方', href: 'https://example.com/a(b)' }] }];
  const x = run([p], { format: 'markdown' }); for (const s of ['### 测试文章', '章节', '1. 条目', '> 引用段落', '````', '**加粗**', '*斜体*', '[官方](<https://example.com/a(b)>)']) assert(x.text.includes(s), s);
});
test('text: plain text retains inline link targets without Markdown punctuation', () => {
  const p = post(1, ''); p.blocks[0].runs = [{ text: '官方链接', href: 'https://example.com/' }]; const x = run([p]); assert(x.text.includes('官方链接（https://example.com/）')); assert(!x.text.includes('[官方链接]'));
});
test('text: unsafe links/HTML are not executable Markdown', () => {
  const p = post(1, ''); p.blocks[0].runs = [{ text: '<script>alert(1)</script> [fake](javascript:evil)', href: 'javascript:evil' }]; const x = run([p], { format: 'markdown' }); assert(!x.text.includes('<script>')); assert(x.text.includes('\\[fake\\](javascript:evil)'));  assert(x.text.includes('&lt;script&gt;'));
});
test('text: cyclic embeds terminate with a truthful omission note', () => {
  const p = post(1, '正文'); p.quote = p; const x = run([p]); assert(x.text.length < 5000); assert(x.warnings.some(s => /循环|层级/.test(s))); assert(x.text.includes('未展开'));
});
test('text: long content is not truncated', () => {
  const s = '中文测试\n'.repeat(60000) + '结尾验收'; const x = run([post(1, s)], { format: 'markdown' }); assert(x.text.includes('结尾验收')); assert(x.text.length > 300000);
});
test('text: missing fields stay missing, not fabricated', () => {
  const p = post(1, '正文'); delete p.published; p.metrics = {}; p.author = { name: '', handle: 'unknown' }; const x = run([p]); assert(!x.text.includes('@unknown')); assert(!x.text.includes('1970-')); assert(x.text.includes('作者未识别'));
});
test('text: configuration normalization ignores hostile keys and invalid values', () => {
  const x = C.normalizeTextOptions(JSON.parse('{"__proto__":{"bad":true},"includeStats":"yes","includeAuthor":false}')); assert.equal(x.includeAuthor, false); assert.equal(x.includeStats, false); assert.equal(x.bad, undefined);
});


test('text: Markdown preserves explicit post line breaks, without escaping digits', () => {
  const x = run([post(1, '第一行\n第二行\n1. 原文编号')], { format: 'markdown' });
  assert(x.text.includes('第一行  \n第二行'));
  assert(x.text.includes('1\\. 原文编号'));
  assert(!x.text.includes('\\1.'));
});
test('text: large code with many backtick groups is serialized without argument overflow', () => {
  const p = post(1, '正文'); p.blocks = [{ kind: 'text', code: true, runs: [{ text: '`a` '.repeat(80000) + '末尾' }] }];
  assert(run([p], { format: 'markdown' }).text.includes('末尾'));
});
