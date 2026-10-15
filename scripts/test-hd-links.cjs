/* Regression contracts for high-resolution photo links and exact X video pages.
 * Synthetic identities/media only; no live account or network is used. */
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../dist/core-test.cjs');
const URL='https://x.com/fixture/status/96001';
const photo='https://pbs.twimg.com/media/fixture_photo?format=jpg&name=small';
const orig='https://pbs.twimg.com/media/fixture_photo?format=jpg&name=orig';
const mp4='https://video.twimg.com/ext_tw_video/fixture/pu/vid/720x1280/video.mp4?tag=12';
const p=(media)=>({id:'96001',url:URL,author:{name:'测试作者',handle:'fixture'},kind:'post',blocks:[{kind:'text',runs:[{text:'前段'}]},...media.map(media=>({kind:'media',media})),{kind:'text',runs:[{text:'后段'}]}],metrics:{},relationEvidence:'unknown',warnings:[],capturedAt:'2026-10-15T00:00:00Z'});
const render=(post,format='text',privacy={},options={})=>C.serializeText({rootId:post.id,posts:[post],sourceUrl:post.url,capturedAt:post.capturedAt,collectionNotes:[]},new Set([post.id]),[post.id],{...C.TEXT_DEFAULTS,...options},format,privacy).text;
const cases=[
 ['photo: observed rendition remains until high-resolution validation',()=>assert(render(p([{kind:'image',src:photo,alt:'图像'}])).includes(photo))],
 ['video: observed video/2 is not stripped to the parent post',()=>assert(render(p([{kind:'video',src:'poster',href:URL+'/video/2',alt:''}])).includes(URL+'/video/2'))],
 ['video: observed MP4 and video page are both kept and distinguished',()=>{const t=render(p([{kind:'video',src:'poster',playbackUrl:URL+'/video/1',sourceUrl:mp4,alt:''}]));assert(t.includes('视频播放页：'+URL+'/video/1'));assert(t.includes('视频文件直链：'+mp4));}],
 ['photo: width/height and display source are not mutated',()=>{const post=p([{kind:'image',src:photo,alt:'图像',width:360,height:200}]);const before=JSON.stringify(post);render(post);assert.equal(JSON.stringify(post),before);}],
 ['media: original paragraph locations survive in all formats',()=>{for(const f of ['text','markdown','ai']){const t=render(p([{kind:'image',src:photo,alt:'图像'}]),f);assert(t.indexOf('前段')<t.indexOf(photo));assert(t.indexOf(photo)<t.indexOf('后段'));}}],
];


cases.push(
 ['image URL: query PNG uses original format',()=>assert.equal(C.highResolutionImageURL('https://pbs.twimg.com/media/id?format=png&name=900x900'),'https://pbs.twimg.com/media/id?format=png&name=orig')],
 ['image URL: old .jpg:small spelling normalized',()=>assert.equal(C.highResolutionImageURL('http://pbs.twimg.com/media/id.jpg:small'),'https://pbs.twimg.com/media/id?format=jpg&name=orig')],
 ['image URL: bare original PNG extension retained',()=>assert.equal(C.highResolutionImageURL('https://pbs.twimg.com/media/id.png'),'https://pbs.twimg.com/media/id?format=png&name=orig')],
 ['image URL: original request is idempotent',()=>assert.equal(C.highResolutionImageURL(orig),orig)],
 ['image URL: unknown WebP original format is not guessed',()=>assert.equal(C.highResolutionImageURL('https://pbs.twimg.com/media/id?format=webp&name=small'),'https://pbs.twimg.com/media/id?format=webp&name=4096x4096')],
 ['image URL: signed resources kept byte-identical, not invalidated',()=>{const u='https://pbs.twimg.com/media/id?format=jpg&name=small&sig=TEST_ONLY';assert.equal(C.highResolutionImageURL(u),u);}],
 ['image URL: foreign CDN and avatar/banner/poster paths are not altered',()=>{for(const u of ['https://example.com/media/id.jpg?width=100','https://pbs.twimg.com/profile_images/123/avatar_normal.jpg','https://pbs.twimg.com/ext_tw_video_thumb/123/a.jpg','https://pbs.twimg.com/card_img/123/image.jpg'])assert.equal(C.highResolutionImageURL(u),u);}],
 ['image URL: invalid/local/user-info credentials rejected',()=>{for(const u of ['', 'blob:https://x.com/local','data:image/png;base64,AA==','https://user:password@pbs.twimg.com/media/id.jpg','javascript:evil'])assert.equal(C.highResolutionImageURL(u),undefined);}],
 ['image URL: missing format is not silently invented',()=>assert.equal(C.highResolutionImageURL('https://pbs.twimg.com/media/id?name=small'),'https://pbs.twimg.com/media/id?name=small')],
 ['video page: native link suffix preserved without tracking/time query',()=>assert.equal(C.xVideoPageURL('https://mobile.twitter.com/fixture/status/96001/video/2?t=4&s=20#x'),URL+'/video/2')],
 ['video page: relative DOM link resolves',()=>assert.equal(C.xVideoPageURL('/fixture/status/96001/video/3'),URL+'/video/3')],
 ['video page: canonical provenance remains a separate concern',()=>{assert.equal(C.sourceURL(URL+'/video/2'),URL);assert.equal(C.xVideoPageURL(URL+'/video/2'),URL+'/video/2');}],
 ['video page: unsafe host, root post, files and invalid indices rejected',()=>{for(const u of ['https://x.com.evil.test/fixture/status/1/video/1',URL,mp4,URL+'/video/0',URL+'/video/1oops','https://user:secret@x.com/fixture/status/1/video/1','https://x.com:444/fixture/status/1/video/1'])assert.equal(C.xVideoPageURL(u),undefined);}],
 ['video page: mixed media uses observed attachment slot, not video counter',()=>{const post=p([{kind:'image',src:photo,alt:''},{kind:'video',src:'poster',attachmentIndex:2,alt:''}]);const t=render(post);assert(t.includes(URL+'/video/2'));assert(!t.includes(URL+'/video/1'));}],
 ['video page: two explicit indices stay separate and ordered',()=>{const t=render(p([{kind:'video',src:'poster1',attachmentIndex:1,alt:''},{kind:'video',src:'poster2',attachmentIndex:2,alt:''}]));assert(t.indexOf(URL+'/video/1')<t.indexOf(URL+'/video/2'));}],
 ['video page: unknown mixed order remains unknown, not fabricated',()=>{const post=p([{kind:'image',src:photo,alt:''},{kind:'video',src:'poster',alt:''}]);assert(!render(post).includes('/video/'));assert(render(post).includes('视频专属地址未获取'));}],
 ['video page: Article never invents a status player from its article ID',()=>{const post=p([{kind:'video',src:'poster',attachmentIndex:1,alt:''}]);post.kind='article';post.url='https://x.com/i/article/96001';const t=render(post);assert(!t.includes('/video/'));assert(t.includes('视频专属地址未获取'));}],
 ['video page: Article can retain an observed embedded player URL',()=>{const post=p([{kind:'video',src:'poster',playbackUrl:URL+'/video/2',alt:''}]);post.kind='article';post.url='https://x.com/i/article/96001';assert(render(post).includes(URL+'/video/2'));}],
 ['video page: quote keeps its own post and player identity',()=>{const post=p([]);post.quote=p([{kind:'video',src:'poster',alt:''}]);post.quote.url='https://x.com/quoted/status/96009';post.quote.id='96009';assert(render(post).includes('https://x.com/quoted/status/96009/video/1'));assert(!render(post).includes(URL+'/video/1'));}],
 ['video stream: HLS labeled separately from a file direct link',()=>{const t=render(p([{kind:'video',src:'poster',sourceUrl:mp4.replace('video.mp4','stream.m3u8'),alt:''}]));assert(t.includes('视频播放流'));assert(!t.includes('视频文件直链：'));}],
 ['privacy: anonymity suppresses original photo and player/file links in every format',()=>{for(const f of ['text','markdown','ai'])assert(!render(p([{kind:'image',src:photo,alt:''},{kind:'video',playbackUrl:URL+'/video/2',src:'poster',sourceUrl:mp4,alt:''}]),f,{anonymize:true}).includes('https://'));}],
 ['privacy: includeMedia=false removes all media labels/links',()=>{const t=render(p([{kind:'image',src:photo,alt:''},{kind:'video',src:'poster',sourceUrl:mp4,alt:''}]),'text',{}, {includeMedia:false});assert(!t.includes('twimg'));assert(!t.includes('[视频'));assert(t.includes('前段'));}],
 ['enrichment: known uploaded PNG replaces rendered WebP link, not pixels',()=>{const b=[{kind:'media',media:{kind:'image',src:'https://pbs.twimg.com/media/id?format=webp&name=small',alt:'图像'}}];C.enrichMediaLinks(b,[{kind:'image',src:'https://pbs.twimg.com/media/id.png',sourceUrl:'https://pbs.twimg.com/media/id.png'}]);assert.equal(b[0].media.src,'https://pbs.twimg.com/media/id?format=webp&name=small');assert.equal(C.highResolutionImageURL(b[0].media.sourceUrl),'https://pbs.twimg.com/media/id?format=png&name=orig');}],
 ['enrichment: duplicate/conflicting identities never borrow an unrelated image',()=>{const b=[{kind:'media',media:{kind:'image',src:photo,alt:''}}];C.enrichMediaLinks(b,[{kind:'image',src:'https://pbs.twimg.com/media/other.png',sourceUrl:'https://pbs.twimg.com/media/other.png'}]);assert.equal(b[0].media.sourceUrl,undefined);}],
 ['enrichment: MP4 retained but missing player metadata is still filled',()=>{const b=[{kind:'media',media:{kind:'video',src:'https://pbs.twimg.com/media/poster.jpg',sourceUrl:mp4,alt:''}}];C.enrichMediaLinks(b,[{kind:'video',src:'https://pbs.twimg.com/media/poster.jpg',playbackUrl:URL+'/video/3',attachmentIndex:3,sourceUrl:'https://video.twimg.com/other.mp4'}]);assert.equal(b[0].media.sourceUrl,mp4);assert.equal(b[0].media.playbackUrl,URL+'/video/3');assert.equal(b[0].media.attachmentIndex,3);}],
 ['Markdown: keep existing image-label plus clickable URL format, no remote embedding change',()=>{const t=render(p([{kind:'image',src:photo,alt:'图像'}]),'markdown');assert(t.includes('<'+photo+'>'));assert(!t.includes('!['));}],
 ['video page: direct resource still exported when source-note switch is off',()=>{const t=render(p([{kind:'video',src:'poster',playbackUrl:URL+'/video/1',sourceUrl:mp4,alt:''}]),'text',{}, {includeSources:false});assert(t.includes(mp4));assert(!t.includes('x.com/'));}],
);
cases.push(
 ['video page: unrelated direct href does not mask a known post permalink',()=>{const t=render(p([{kind:'video',src:'poster',href:mp4,sourceUrl:mp4,alt:''}]));assert(t.includes(URL+'/video/1'));assert(t.includes(mp4));}],
 ['video page: canonical i/web post is not confused with an Article ID',()=>{const post=p([{kind:'video',src:'poster',alt:''}]);post.url='https://x.com/i/web/status/96001';assert(render(post).includes('https://x.com/i/web/status/96001/video/1'));}],
);
for(const[name,fn]of cases)test(name,fn);
