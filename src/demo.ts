import {Capture,Post} from './core/model';
function avatar(letter:string,color:string):string{const canvas=document.createElement('canvas');canvas.width=canvas.height=120;const c=canvas.getContext('2d')!;c.fillStyle=color;c.fillRect(0,0,120,120);c.fillStyle='#ffffff';c.font='bold 62px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(letter,60,64);return canvas.toDataURL();}
export function demoCapture():Capture{
  const a=avatar('林','#4564bd'),b=avatar('许','#b58056'),now='2026-09-25T04:30:00.000Z';
  const make=(id:string,text:string,extra:Partial<Post>={}):Post=>({id,url:`https://x.com/demo_author/status/${id}`,kind:'post',author:{name:'林墨',handle:'demo_author',avatar:a,verified:true},blocks:[{kind:'text',runs:[{text}]}],published:now,metrics:{replies:'12',reposts:'38',likes:'286',views:'1.2万'},warnings:[],capturedAt:now,relationEvidence:'data',...extra});
  return {rootId:'1000000000000000001',sourceUrl:'https://x.com/demo_author/status/1000000000000000001',capturedAt:now,collectionNotes:['以下为明确标记的虚构演示数据，用于检验排版和导出，不是真实推文。'],posts:[
    make('1000000000000000001','好的内容，值得被完整保存。\n\n不只是一张截图：保留原文、作者补充和必要的回复背景，导出为高清长图或带有真实文字的 PDF。\n\n看起来依然像 X，内容与来源也依然完整。'),
    make('1000000000000000002','这也是为什么，我更喜欢分块卡片。\n\n每条帖子独立呈现，回复关系清楚。外观随时调整，内容由自己决定。',{parentId:'1000000000000000001',metrics:{likes:'32',views:'2,086'}}),
    make('1000000000000000003','三个细节不能丢：\n1. 长文不要只截到「显示更多」。\n2. PDF 的中文应该可以选中、搜索和复制。\n3. 画面可以不显示链接，原始文件仍然保留来源。\n\n此处是演示数据，可以放心试调参数。',{parentId:'1000000000000000002',metrics:{replies:'2',likes:'57',views:'2,431'}}),
    make('1000000000000000004','补充一个背景：分享软件可能会压缩图片并移除元数据。想保留来源，最好同时保存原始文件。',{author:{name:'许舟',handle:'sample_reader',avatar:b},parentId:'1000000000000000001',url:'https://x.com/sample_reader/status/1000000000000000004',metrics:{likes:'9'}})
  ]};
}
