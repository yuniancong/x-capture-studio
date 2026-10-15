// Image / video quality levels. Fixture shapes follow real X data (2026-10-16):
// page-data MP4 variants /vid/avc1/WxH/ and a real master playlist structure.
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../dist/core-test.cjs');
const MID='7700000000000000001',POST='7700000000000000099',URL_POST='https://x.com/example_cats/status/'+POST;
const base=`https://video.twimg.com/amplify_video/${MID}`;
const MASTER=`${base}/pl/Master01.m3u8?tag=29`;
const MASTER_TEXT=`#EXTM3U
#EXT-X-VERSION:6
#EXT-X-INDEPENDENT-SEGMENTS
#EXT-X-MEDIA:NAME="Audio",TYPE=AUDIO,GROUP-ID="audio-32000",AUTOSELECT=YES,URI="/amplify_video/${MID}/pl/mp4a/32000/A32.m3u8"
#EXT-X-MEDIA:NAME="Audio",TYPE=AUDIO,GROUP-ID="audio-128000",AUTOSELECT=YES,URI="/amplify_video/${MID}/pl/mp4a/128000/A128.m3u8"
#EXT-X-STREAM-INF:AVERAGE-BANDWIDTH=114434,BANDWIDTH=117454,RESOLUTION=320x320,CODECS="mp4a.40.2,avc1.4D4015",AUDIO="audio-32000"
/amplify_video/${MID}/pl/avc1/320x320/H320.m3u8
#EXT-X-STREAM-INF:AVERAGE-BANDWIDTH=265165,BANDWIDTH=273532,RESOLUTION=540x540,CODECS="mp4a.40.2,avc1.4D401E",AUDIO="audio-32000"
/amplify_video/${MID}/pl/avc1/540x540/H540.m3u8
#EXT-X-STREAM-INF:AVERAGE-BANDWIDTH=466083,BANDWIDTH=478611,RESOLUTION=720x720,CODECS="mp4a.40.2,avc1.64001F",AUDIO="audio-128000"
/amplify_video/${MID}/pl/avc1/720x720/H720.m3u8
`;
const mp4=s=>({url:`${base}/vid/avc1/${s}x${s}/F${s}.mp4?tag=29`,kind:'file',width:s,height:s,state:'observed',source:'page-data'});
function video(){
  const parsed=C.parseHLS(MASTER_TEXT,MASTER);
  const variants=C.mergeVariants([mp4(320),mp4(540),mp4(720),{url:MASTER,kind:'hls',state:'verified',source:'page-data',playlist:'master'}],parsed.variants);
  return {kind:'video',src:`https://pbs.twimg.com/amplify_video_thumb/${MID}/img/P.jpg`,alt:'视频封面',attachmentIndex:1,variants};
}
const IMG='https://pbs.twimg.com/media/AbCdEf123?format=jpg&name=small';
const lvl=(n,extra={})=>({url:`https://pbs.twimg.com/media/AbCdEf123?format=jpg&name=${n}`,kind:'image',source:'image-rule',name:n,...extra});
const image=(variants=[])=>({kind:'image',src:IMG,alt:'帖子图片',variants:C.mergeVariants([{url:IMG,kind:'image',state:'observed',source:'dom',width:680,height:510}],variants)});
const capture=(...media)=>{const p={id:POST,url:URL_POST,kind:'post',author:{name:'E',handle:'example_cats'},blocks:[{kind:'text',runs:[{text:'Body'}]},...media.map(m=>({kind:'media',media:m}))],metrics:{},relationEvidence:'unknown',warnings:[],capturedAt:'2026-10-16'};
  return {rootId:POST,posts:[p],sourceUrl:URL_POST,capturedAt:'2026-10-16',collectionNotes:[]};};
const S=new Set([POST]);

test('normalizeQuality keeps known levels and rejects junk',()=>{
  assert.deepEqual(C.normalizeQuality({image:'orig',video:'p720'}),{image:'orig',video:'p720'});
  assert.deepEqual(C.normalizeQuality({image:'huge',video:'720'}),C.QUALITY_DEFAULTS);
  assert.deepEqual(C.normalizeQuality(null),{image:'default',video:'best'});
});
test('Video options list only the real levels found (MP4 + parsed HLS), highest first',()=>{
  const o=C.videoQualityOptions(capture(video()),S);
  assert.deepEqual(o.map(x=>x.value),['best','p720','p540','p320']);
  assert.equal(o[1].label,'720p');
});
test('Video options say so when no dimensions are known yet, and when nothing is selected',()=>{
  const v={kind:'video',src:'',variants:[{url:MASTER,kind:'hls',state:'observed',source:'performance'}]};
  assert.deepEqual(C.videoQualityOptions(capture(v),S).map(x=>x.value),['best']);
  assert.match(C.videoQualityOptions(capture(v),S)[0].label,/尚未取得/);
  assert.equal(C.videoQualityOptions(capture(),S)[0].disabled,true);
});
test('A video level picks the matching MP4 and HLS stream; lower if exact is missing',()=>{
  const m=video();
  const at=l=>C.videoVariantsForLevel(m,l).map(v=>v.url.split('/').slice(-1)[0].split('?')[0]);
  assert.deepEqual(at('p540'),['F540.mp4','H540.m3u8']);
  assert.deepEqual(at('p480'),['F320.mp4','H320.m3u8']);
  assert.deepEqual(at('p1080'),['F720.mp4','H720.m3u8']);
  assert.equal(C.videoVariantsForLevel(m,'best'),undefined);
});
test('Without parsed HLS children the level keeps the master playlist',()=>{
  const m={kind:'video',src:'',variants:[mp4(320),mp4(720),{url:MASTER,kind:'hls',state:'observed',source:'page-data'}]};
  assert.deepEqual(C.videoVariantsForLevel(m,'p320').map(v=>v.url),[mp4(320).url,MASTER]);
});
test('Text: a video level changes only the copied links; default output is unchanged',()=>{
  const plain=C.serializeText(capture(video()),S,[POST],C.TEXT_DEFAULTS,'markdown');
  const same=C.serializeText(capture(video()),S,[POST],C.TEXT_DEFAULTS,'markdown',{},C.QUALITY_DEFAULTS);
  assert.equal(same.text,plain.text);
  assert(plain.text.includes('F720.mp4'));
  const t=C.serializeText(capture(video()),S,[POST],C.TEXT_DEFAULTS,'markdown',{},{image:'default',video:'p540'}).text;
  assert(t.includes('F540.mp4')&&t.includes('H540.m3u8'),t);
  assert(!t.includes('F720.mp4')&&!t.includes('Master01'),t);
});
test('Image options: real decoded size when verified, "选择后载入" before, disabled when unavailable',()=>{
  let o=C.imageQualityOptions(capture(image()),S);
  assert.deepEqual(o.map(x=>x.value),['default','orig','4096x4096','large']);
  assert.match(o[1].label,/原图 · 选择后载入/);
  o=C.imageQualityOptions(capture(image([lvl('orig',{state:'verified',width:4032,height:3024,verifiedBy:'image-decode'}),lvl('4096x4096',{state:'unavailable'})])),S);
  assert.equal(o[1].label,'原图 · 4032×3024');assert.equal(o[2].disabled,true);
  assert.equal(C.imageQualityOptions(capture(),S)[0].label,'无图片');
});
test('Image level chain falls back to lower real renditions and skips known-unavailable ones',()=>{
  const m=image([lvl('orig',{state:'unavailable'})]);
  assert.deepEqual(C.imageLevelChain(m,'orig').map(v=>v.name),['4096x4096','large']);
  assert.deepEqual(C.imageLevelChain(m,'default'),[]);
  assert.deepEqual(C.imageLevelChain({kind:'image',src:'https://example.com/a.jpg',variants:[]},'orig'),[]);
});
test('Text: image level uses the decoded rendition at or below the choice',()=>{
  const m=()=>image([lvl('orig',{state:'verified',width:4032,height:3024,verifiedBy:'image-decode'}),lvl('4096x4096',{state:'unavailable'}),lvl('large',{state:'verified',width:2048,height:1536,verifiedBy:'image-decode'})]);
  const def=C.serializeText(capture(m()),S,[POST],C.TEXT_DEFAULTS,'text').text;assert(def.includes('name=orig'),def);
  const t=C.serializeText(capture(m()),S,[POST],C.TEXT_DEFAULTS,'text',{},{image:'4096x4096',video:'best'}).text;
  assert(t.includes('name=large')&&!t.includes('name=orig'),t);
});
