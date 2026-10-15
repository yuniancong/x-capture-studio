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
test('text: media keeps observed alt text with its image URL; video never uses its poster', () => {
  const p = post(1, '正文'); p.blocks.push({ kind: 'media', media: { kind: 'image', src: 'https://pbs.twimg.com/secret.jpg', alt: '原有替代文字' } }, { kind: 'media', media: { kind: 'video', src: 'cdn', alt: '', duration: '02:31' } });
  const x = run([p]); assert(x.text.includes('[图片：原有替代文字]')); assert(x.text.includes('[视频 · 02:31]')); assert(x.text.includes('[图片：原有替代文字] https://pbs.twimg.com/secret.jpg')); assert(x.text.includes('原帖播放链接：https://x.com/alice/status/1'));
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


test('image links: observed direct image URL follows its label without changing surrounding text', () => {
  const p = post(1, '正文保持不变');
  const url = 'https://pbs.twimg.com/media/fixture-image-01?format=jpg&name=large';
  p.blocks.push({ kind: 'media', media: { kind: 'image', src: url, alt: '图像', href: p.url } });
  const result = run([p]);
  const expected = '[1 · 主帖]\n\n作者甲 @alice\n\n发布时间：2026-09-25T10:00:00Z\n\n正文保持不变\n\n[图片：图像] ' + url + '\n\n来源：https://x.com/alice/status/1\n';
  assert.equal(result.text, expected);
});

test('video links: keep video URL separate from poster and between the same surrounding paragraphs', () => {
  const p = post(1, '视频之前');
  p.blocks.push({kind:'media',media:{kind:'video',src:'https://pbs.twimg.com/media/poster.jpg',sourceUrl:'https://video.twimg.com/ext_tw_video/fixture/pu/vid/720x1280/movie.mp4?tag=12',alt:'视频封面',duration:'00:15'}},{kind:'text',runs:[{text:'视频之后'}]});
  const x=run([p]).text;
  assert(x.includes('[视频 · 00:15] https://video.twimg.com/ext_tw_video/fixture/pu/vid/720x1280/movie.mp4?tag=12'));
  assert(x.indexOf('视频之前')<x.indexOf('[视频'));assert(x.indexOf('[视频')<x.indexOf('视频之后'));
  assert(!x.includes('poster.jpg'));
});

const media = (kind, src, extras={}) => ({kind:'media',media:{kind,src,alt:'',...extras}});
const para = text => ({kind:'text',runs:[{text}]});
const IMAGE_1='https://pbs.twimg.com/media/one?format=jpg&name=large';
const IMAGE_2='https://pbs.twimg.com/media/two.png?name=small';
const VIDEO='https://video.twimg.com/amplify_video/fixture/vid/640x360/video.mp4?tag=16';
for (const format of ['text','markdown','ai']) {
  test(`media links: ${format} preserves image/video positions, query strings, quote and Article order`,()=>{
    const p=post(1,'');p.kind='article';p.title='原位验证';
    p.blocks=[para('段落A'),media('image',IMAGE_1),para('段落B'),media('video','https://pbs.twimg.com/poster.jpg',{sourceUrl:VIDEO}),media('image',IMAGE_2),para('段落C')];
    p.quote=post(9,'引用独立正文','bob');p.quote.blocks.push(media('image','https://pbs.twimg.com/media/quote.jpg'));
    const before=JSON.stringify(p); const t=run([p],{format}).text;
    const expected=['段落A',IMAGE_1,'段落B',VIDEO,IMAGE_2,'段落C','引用独立正文','https://pbs.twimg.com/media/quote.jpg'];
    let last=-1;for(const token of expected){const i=t.indexOf(token);assert(i>last,token);last=i;}
    assert(!t.includes('poster.jpg'));assert(!t.includes('!['));assert.equal(JSON.stringify(p),before);
    if(format!=='text')assert(t.includes(`<${IMAGE_1}>`));
  });
}
test('media links: no changes at all to non-media text across formats',()=>{
  const expected=require('../tests/text-no-media-rc4.json');
  for(const format of ['text','markdown','ai']) {
    const cap=capture([main,reply]);const sel=new Set(['1','2']),order=['2','1'];
    assert.deepEqual(C.serializeText(cap,sel,order,C.TEXT_DEFAULTS,format),expected[format]);
  }
});
test('media links: a Blob video falls back to its OWN original post, not its poster or outer quote',()=>{
  const p=post(1,'主帖');p.quote=post(9,'被引用正文','bob');
  p.quote.blocks.push(media('video','https://pbs.twimg.com/video-poster.jpg',{sourceUrl:'blob:https://x.com/ephemeral',duration:'0:31'}));
  const t=run([p]).text;assert(t.includes('[视频 · 0:31] 原帖播放链接：https://x.com/bob/status/9'));
  assert(!t.includes('ephemeral'));assert(!t.includes('video-poster.jpg'));
});
test('media links: HLS is labeled as a playback stream, never an MP4 download',()=>{
  const p=post(1,'');p.blocks=[media('video','poster',{sourceUrl:'https://video.twimg.com/path/live.m3u8?token=fixture'})];
  assert(run([p]).text.includes('[视频]（播放流） https://video.twimg.com/path/live.m3u8?token=fixture'));
});
test('media links: missing, relative, local and credential URLs are not fabricated or leaked',()=>{
  for(const u of ['', 'relative.jpg', 'data:image/png;base64,AQID', 'blob:https://x.com/x', 'javascript:alert(1)', 'https://u:pass@pbs.twimg.com/x.jpg', 'https://pbs.twimg.com/\nprivate.jpg']) {
    const p=post(1,'保留正文');p.blocks.push(media('image',u));const t=run([p]).text;
    assert(t.includes('[图片]（图片链接未获取）'));if(u)assert(!t.includes(u));
  }
});
test('media links: unrelated source page URL cannot masquerade as an image resource',()=>{
  const p=post(1,'');p.blocks=[media('image','https://x.com/bob/status/8')];
  const t=run([p]).text;assert(t.includes('[图片]（图片链接未获取）'));assert(!t.includes('/bob/status/8'));
});
test('media links: empty video identity remains missing, never guess an outer source',()=>{
  const p=post(1,'');p.url='';p.blocks=[media('video','https://pbs.twimg.com/poster.jpg')];
  assert(run([p]).text.includes('[视频]（视频链接未获取）'));
});
test('media links: independent sources option hides post fallback but not original media',()=>{
  const p=post(1,'');p.blocks=[media('image',IMAGE_1),media('video','poster')];const t=run([p],{opts:{includeSources:false}}).text;
  assert(t.includes(IMAGE_1));assert(!t.includes('x.com/'));assert(!t.includes('原帖播放链接'));
});
test('media links: anonymity suppresses all automatic image/video URLs in quote and Article',()=>{
  const p=post(1,'');p.blocks=[media('image',IMAGE_1),media('video','poster',{sourceUrl:VIDEO})];p.quote=post(9,'','bob');p.quote.blocks=[media('image',IMAGE_2)];
  for(const format of ['text','markdown','ai']){const t=run([p],{format,privacy:{anonymize:true}}).text;assert(!t.includes('https://'));assert(t.includes('图片'));assert(t.includes('视频'));}
  const t=run([p],{privacy:{anonymize:true,anonymousSources:true}}).text;assert(t.includes(IMAGE_1));assert(t.includes(VIDEO));assert(!t.includes('作者甲'));
});
test('media links: media toggle suppresses both marker and URL without touching text',()=>{
  const p=post(1,'只保留正文');p.blocks.push(media('image',IMAGE_1),media('video','poster',{sourceUrl:VIDEO}));
  const t=run([p],{opts:{includeMedia:false}}).text;assert(!t.includes('twimg'));assert(!t.includes('[图片'));assert(t.includes('只保留正文'));
});
test('media links: all link-card images remain with their card, not appended after source notes',()=>{
  const p=post(1,'');p.linkCard={title:'卡片标题',description:'卡片介绍',image:IMAGE_1,url:'https://example.com/'};
  const t=run([p]).text;assert(t.indexOf('卡片标题')<t.indexOf(IMAGE_1));assert(t.indexOf(IMAGE_1)<t.indexOf('https://example.com/'));
  assert(!run([p],{opts:{includeMedia:false}}).text.includes(IMAGE_1));
});
test('media links: enrichment only changes sourceUrl, preserving display data and block order',()=>{
  const blocks=[para('先'),media('video','data:image/jpeg;base64,AQID',{posterUrl:'https://pbs.twimg.com/media/key.jpg?name=small'}),para('后')];
  const before=JSON.stringify(blocks);C.enrichMediaLinks(blocks,[{kind:'video',src:'https://pbs.twimg.com/media/key?format=jpg&name=large',sourceUrl:VIDEO}]);
  assert.equal(blocks[1].media.sourceUrl,VIDEO);delete blocks[1].media.sourceUrl;assert.equal(JSON.stringify(blocks),before);
});
test('media links: multiple videos are matched by observed poster identity, not array index',()=>{
  const blocks=[media('video',IMAGE_1),media('video',IMAGE_2)];
  C.enrichMediaLinks(blocks,[{kind:'video',src:IMAGE_2,sourceUrl:VIDEO},{kind:'video',src:IMAGE_1,sourceUrl:VIDEO.replace('video.mp4','one.mp4')}]);
  assert.equal(blocks[0].media.sourceUrl,VIDEO.replace('video.mp4','one.mp4'));assert.equal(blocks[1].media.sourceUrl,VIDEO);
});
test('media links: conflicting or ambiguous media does not receive a wrong direct URL',()=>{
  const blocks=[media('video',IMAGE_1)];C.enrichMediaLinks(blocks,[{kind:'video',src:IMAGE_2,sourceUrl:VIDEO}]);assert(!blocks[0].media.sourceUrl);
  C.enrichMediaLinks(blocks,[{kind:'video',src:IMAGE_1,sourceUrl:VIDEO},{kind:'video',src:IMAGE_1,sourceUrl:VIDEO+'2'}]);assert(!blocks[0].media.sourceUrl);
});
test('media links: existing observed MP4 is not replaced and invalid sources are rejected',()=>{
  const blocks=[media('video',IMAGE_1,{sourceUrl:VIDEO})];C.enrichMediaLinks(blocks,[{kind:'video',src:IMAGE_1,sourceUrl:VIDEO+'other'}]);assert.equal(blocks[0].media.sourceUrl,VIDEO);
  for(const u of ['blob:https://x.com/stream','https://pbs.twimg.com/poster.jpg','https://video.twimg.com/relative','https://u:p@video.twimg.com/x.mp4'])assert.equal(C.videoMediaURL(u),undefined);
});
test('media links: quote enrichment preserves visible translation and captured pixels',()=>{
  const q=post(9,'可见中文','bob');q.blocks.push(media('video',IMAGE_1));const x=C.enrichQuote(q,{id:'9',fullText:'English',media:[{kind:'video',src:IMAGE_1,sourceUrl:VIDEO}]},q.capturedAt);
  assert.equal(x.blocks[1].media.sourceUrl,VIDEO);assert.equal(x.blocks[1].media.src,IMAGE_1);assert.equal(x.blocks[0].runs[0].text,'可见中文');
});

test('media links: observed mixed-media order affects text only, never capture blocks',()=>{
  const p=post(1,'');p.blocks=[para('段落前'),media('image',IMAGE_1,{textOrder:1}),media('video','poster',{sourceUrl:VIDEO,textOrder:0}),para('段落后'),media('image',IMAGE_2,{textOrder:0})];
  const before=JSON.stringify(p);const t=run([p]).text;
  assert(t.indexOf('段落前')<t.indexOf(VIDEO));assert(t.indexOf(VIDEO)<t.indexOf(IMAGE_1));assert(t.indexOf(IMAGE_1)<t.indexOf('段落后'));assert(t.indexOf('段落后')<t.indexOf(IMAGE_2));assert.equal(JSON.stringify(p),before);
});
test('media links: incomplete or duplicate source positions retain the captured order',()=>{
  for(const orders of [[0,0],[undefined,0],[-1,1]]){
    const p=post(1,'');p.blocks=[media('image',IMAGE_1,{textOrder:orders[0]}),media('video','poster',{sourceUrl:VIDEO,textOrder:orders[1]})];
    const t=run([p]).text;assert(t.indexOf(IMAGE_1)<t.indexOf(VIDEO));
  }
});
