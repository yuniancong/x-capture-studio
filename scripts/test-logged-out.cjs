// Logged-out desktop X (2026-10-16): Relay keeps resolved data in hook snapshots of descendant
// fibers of <article>; IDs are base64("Tweet:<id>") and "client:<that>:media_entities2:<n>".
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../dist/core-test.cjs');
const T=id=>Buffer.from('Tweet:'+id).toString('base64'),M=(id,n)=>`client:${T(id)}:media_entities2:${n}`;
const VB='https://video.twimg.com/amplify_video/7720000000000000001';
const fiber=(snaps,child=null,sibling=null)=>{let hook=null;for(const d of [...snaps].reverse())hook={memoizedState:{snapshot:{data:d}},next:hook};return {memoizedState:hook,child,sibling};};
function page(trees){
 class Node{}
 const arts=trees.map(t=>({tagName:'ARTICLE',hasAttribute:()=>false,'__reactFiber$t':{child:t}}));
 return {Node,document:{querySelectorAll:()=>arts}};
}
const video=(id,n=0)=>({__id:M(id,n),media_url_https:`https://pbs.twimg.com/amplify_video_thumb/77${id}/img/P.jpg`,
 video_info:{variants:[{content_type:'application/x-mpegURL',url:VB+'/pl/Master.m3u8?tag=29'},{content_type:'video/mp4',bitrate:832000,url:VB+'/vid/avc1/540x540/A.mp4?tag='}]},
 video_download_url:VB+'/vid/avc1/720x720/B.mp4?tag='});
test('Relay snapshots: text, timestamp, parent and video variants keyed by record ID',()=>{
 const tree=fiber([{__id:T('81001'),details:{full_text:'Hello'},reply_to_results:{__typename:'TweetResults',rest_id:'81000'}}],
  fiber([{rest_id:'81001',details:{created_at_ms:1792040951000},core:{user_results:{result:{__id:Buffer.from('User:9').toString('base64'),rest_id:'9'}}}}],fiber([video('81001')])));
 const [r]=C.pageProbe(['81001'],page([tree]));
 assert.equal(r.fullText,'Hello');assert.equal(r.parentId,'81000');assert.equal(r.published,'2026-10-15T05:09:11.000Z');
 const m=r.media[0];assert.equal(m.kind,'video');assert.equal(m.sourceUrl,VB+'/vid/avc1/720x720/B.mp4?tag=');
 assert.deepEqual(m.variants.map(v=>v.kind).sort(),['file','file','hls']);
});
test('Relay snapshots: a quoted post\'s media never attaches to the outer post',()=>{
 const tree=fiber([{__id:T('81002'),details:{full_text:'outer'},quoted_tweet_results:{result:{__id:T('81999')}}}],fiber([video('81999')]));
 const r=C.pageProbe(['81002','81999'],page([tree]));
 assert.deepEqual(r.find(x=>x.id==='81002').media,[]);assert.equal(r.find(x=>x.id==='81999').media.length,1);
});
test('Relay snapshots: unidentified fragments and photo media without type are handled',()=>{
 const tree=fiber([{media_entities2:[{media_url_https:'https://pbs.twimg.com/media/X.jpg',type:'photo'}]},{__id:T('81003'),media_entities2:[{media_url_https:'https://pbs.twimg.com/media/Y.jpg'}]}]);
 const [r]=C.pageProbe(['81003'],page([tree]));
 assert.equal(r.media.length,1);assert.equal(r.media[0].kind,'image');assert.equal(r.media[0].src,'https://pbs.twimg.com/media/Y.jpg');
});
test('Relay reader stays inside the self-contained MAIN-world probe',()=>{
 const fn=(0,eval)('('+C.pageProbe.toString()+')');
 assert.equal(fn(['81001'],page([fiber([video('81001')])]))[0].media[0].sourceUrl,VB+'/vid/avc1/720x720/B.mp4?tag=');
});
