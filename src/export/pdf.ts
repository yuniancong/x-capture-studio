import {imageSurface,imagePlacement} from '../core/image';
import fontkit = require('fontkit');
import {AssetMap,Capture,Command,Options,Scene,TextCommand} from '../core/model';
import {bounds} from '../core/canvas';
import {fontCSS,graphemes} from '../core/layout';
import {concat,compress,utf8,utf16Hex} from './binary';
import {provenance,xmpMetadata} from './metadata';

/** Small deterministic PDF 1.7 writer. True embedded, subset CID fonts + ToUnicode;
 * images remain image XObjects. No screenshot-backed page or invisible OCR layer. */
class PDFWriter {
  objects:(Uint8Array|undefined)[]=[];
  reserve(){this.objects.push(undefined);return this.objects.length;}
  set(id:number,data:string|Uint8Array){this.objects[id-1]=typeof data==='string'?utf8(data):data;}
  add(data:string|Uint8Array){const id=this.reserve();this.set(id,data);return id;}
  async stream(data:Uint8Array,dict='',zip=true){const z=zip?await compress(data):{data,filter:''};return this.add(concat([utf8(`<< ${dict} ${z.filter} /Length ${z.data.byteLength} >>\nstream\n`),z.data,utf8('\nendstream')]));}
  finish(root:number,info:number){const head=new Uint8Array([37,80,68,70,45,49,46,55,10,37,226,227,207,211,10]);const parts=[head],offsets=[0];let n=head.length;
    this.objects.forEach((obj,i)=>{if(!obj)throw new Error('PDF 对象未完成');offsets.push(n);const p=concat([utf8(`${i+1} 0 obj\n`),obj,utf8('\nendobj\n')]);parts.push(p);n+=p.length;});
    const xref=n;const rows=offsets.map((o,i)=>i?`${String(o).padStart(10,'0')} 00000 n \n`:'0000000000 65535 f \n').join('');
    parts.push(utf8(`xref\n0 ${offsets.length}\n${rows}trailer\n<< /Size ${offsets.length} /Root ${root} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`));return concat(parts);
  }
}
const num=(n:number)=>Number.isFinite(n)?String(Number(n.toFixed(5))):'0';
const color=(s:string)=>[1,3,5].map(i=>num(parseInt(s.slice(i,i+2),16)/255)).join(' ');
const literal=(s:string)=>'('+s.replace(/[\\()\r\n]/g,c=>c==='\r'?'\\r':c==='\n'?'\\n':'\\'+c)+')';
function roundPath(x:number,y:number,w:number,h:number,r:number){r=Math.max(0,Math.min(r,w/2,h/2));const k=.55228475*r,n=num;return `${n(x+r)} ${n(y)} m ${n(x+w-r)} ${n(y)} l ${n(x+w-r+k)} ${n(y)} ${n(x+w)} ${n(y+r-k)} ${n(x+w)} ${n(y+r)} c ${n(x+w)} ${n(y+h-r)} l ${n(x+w)} ${n(y+h-r+k)} ${n(x+w-r+k)} ${n(y+h)} ${n(x+w-r)} ${n(y+h)} c ${n(x+r)} ${n(y+h)} l ${n(x+r-k)} ${n(y+h)} ${n(x)} ${n(y+h-r+k)} ${n(x)} ${n(y+h-r)} c ${n(x)} ${n(y+r)} l ${n(x)} ${n(y+r-k)} ${n(x+r-k)} ${n(y)} ${n(x+r)} ${n(y)} c h`;}
function pathPDF(path:string){const tokens=path.match(/[MLCZmlcz]|[-+]?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/g)||[];let out='',i=0;
  while(i<tokens.length){const c=tokens[i++];if(c==='Z'||c==='z'){out+='h ';continue;}const count=c==='M'||c==='L'?2:c==='C'?6:0;if(!count)throw new Error('不支持的图标路径');const data=tokens.slice(i,i+count).map(Number);i+=count;out+=data.map(num).join(' ')+(c==='M'?' m ':c==='L'?' l ':' c ');}return out;}
function segments(cmd:TextCommand,font:any){const out:{text:string;vector:boolean}[]=[];for(const g of graphemes(cmd.text)){const vector=Array.from(g).every(c=>font.hasGlyphForCodePoint(c.codePointAt(0)!));const prev=out[out.length-1];if(prev&&prev.vector===vector)prev.text+=g;else out.push({text:g,vector});}return out;}
function pageSlices(scene:Scene,o:Options):[number,number][]{
  if(o.pdfMode==='long')return [[0,scene.height]];
  const height=(o.pdfPage==='letter'?792:841.89)/.75;const slices:[number,number][]=[];let start=0;
  while(start<scene.height){let end=Math.min(scene.height,start+height);if(end<scene.height){
    const card=scene.cards.find(c=>c.y<end&&c.y+c.h>end);if(card&&card.y-start>height*.25&&card.h<=height)end=card.y-Math.min(8,o.gap/2);
    else {const overlaps=scene.commands.filter(c=>c.type==='text'&&bounds(c).y<end&&bounds(c).y+bounds(c).h>end);if(overlaps.length)end=Math.min(...overlaps.map(c=>bounds(c).y))-3;}
  }if(end<=start+20)end=Math.min(scene.height,start+height);slices.push([start,end]);start=end;}
  return slices;
}
export async function exportPDF(scene:Scene,assets:AssetMap,capture:Capture,selected:Set<string>,o:Options,fontBytes:Uint8Array,onStatus:(s:string)=>void=()=>{}):Promise<Blob>{
  if(scene.height>1200000||scene.width>100000)throw new Error('当前文档尺寸过大，请减少内容或改用分页 PDF。');
  let font:any=fontkit.create(fontBytes);
  if(font.fonts)font=font.fonts.find((f:any)=>/CJKsc|SC|uming/i.test(f.postscriptName))||font.fonts[0];
  if(!font?.createSubset)throw new Error('字体格式不受支持，请导入 TrueType/OpenType 字体。');
  const fsType=font['OS/2']?.fsType;if(typeof fsType==='number'&&(fsType&2))throw new Error('该字体限制文档嵌入，请选择允许嵌入的字体。');
  onStatus('生成可选择文字、矢量图形与来源链接…');
  const writer=new PDFWriter(),catalog=writer.reserve(),pagesRoot=writer.reserve();
  const subset=font.createSubset(),cmap=new Map<number,string>(),widths=new Map<number,number>();const units=font.unitsPerEm;
  const runs=new Map<string,any>();
  const getRun=(text:string)=>{let r=runs.get(text);if(!r){r=font.layout(text,{liga:false});runs.set(text,r);for(const glyph of r.glyphs){const cid=subset.includeGlyph(glyph.id);widths.set(cid,glyph.advanceWidth*1000/units);if(!cmap.has(cid))cmap.set(cid,String.fromCodePoint(...(glyph.codePoints?.length?glyph.codePoints:[32])));}}return r;};
  for(const cmd of scene.commands)if(cmd.type==='text')for(const part of segments(cmd,font))if(part.vector)getRun(part.text);
  getRun(' ');
  const fontData:Uint8Array=subset.encode(),cff=!!font['CFF '];
  const file=await writer.stream(fontData,cff?'/Subtype /CIDFontType0C':`/Length1 ${fontData.length}`);
  const fontName='XCAPAA+'+(font.postscriptName||'EmbeddedFont').replace(/[^a-zA-Z0-9-]/g,'');
  const box=font.bbox,bbox=[box.minX,box.minY,box.maxX,box.maxY].map((v:number)=>num(v*1000/units)).join(' ');
  const fd=writer.add(`<< /Type /FontDescriptor /FontName /${fontName} /Flags 4 /FontBBox [${bbox}] /ItalicAngle ${num(font.italicAngle||0)} /Ascent ${num(font.ascent*1000/units)} /Descent ${num(font.descent*1000/units)} /CapHeight ${num((font.capHeight||font.ascent)*1000/units)} /StemV 80 /${cff?'FontFile3':'FontFile2'} ${file} 0 R >>`);
  const ws=[...widths.entries()].sort((a,b)=>a[0]-b[0]).map(([cid,w])=>`${cid} [${num(w)}]`).join(' ');
  const cidfont=writer.add(`<< /Type /Font /Subtype /${cff?'CIDFontType0':'CIDFontType2'} /BaseFont /${fontName} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${fd} 0 R /DW 1000 /W [${ws}] ${cff?'':'/CIDToGIDMap /Identity'} >>`);
  const pairs=[...cmap.entries()].map(([id,text])=>`<${id.toString(16).padStart(4,'0')}> <${utf16Hex(text,false)}> `);let cm='/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /XCaptureUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n';
  for(let i=0;i<pairs.length;i+=100){const part=pairs.slice(i,i+100);cm+=`${part.length} beginbfchar\n${part.join('\n')}\nendbfchar\n`;}
  cm+='endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend';
  const unicode=await writer.stream(utf8(cm));const fontRef=writer.add(`<< /Type /Font /Subtype /Type0 /BaseFont /${fontName} /Encoding /Identity-H /DescendantFonts [${cidfont} 0 R] /ToUnicode ${unicode} 0 R >>`);
  const opacity=new Map<number,{name:string;ref:number}>();
  function gs(alpha:number){if(!opacity.has(alpha)){const name='GS'+opacity.size;opacity.set(alpha,{name,ref:writer.add(`<< /Type /ExtGState /ca ${num(alpha)} /CA ${num(alpha)} >>`)});}return opacity.get(alpha)!.name;}
  const imageRefs=new Map<string,{name:string;ref:number;width:number;height:number}>();let imageCount=0;
  async function embedCanvas(key:string,canvas:HTMLCanvasElement){
    const ctx=canvas.getContext('2d',{willReadFrequently:true})!;const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    const rgb=new Uint8Array(canvas.width*canvas.height*3),alpha=new Uint8Array(canvas.width*canvas.height);let transparent=false;
    for(let i=0,p=0;i<rgba.length;i+=4,p++){rgb[p*3]=rgba[i];rgb[p*3+1]=rgba[i+1];rgb[p*3+2]=rgba[i+2];alpha[p]=rgba[i+3];if(rgba[i+3]<255)transparent=true;}
    const mask=transparent?await writer.stream(alpha,`/Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceGray /BitsPerComponent 8`):0;
    const ref=await writer.stream(rgb,`/Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 ${mask?'/SMask '+mask+' 0 R':''}`);
    const info={name:'Im'+imageCount++,ref,width:canvas.width,height:canvas.height};imageRefs.set(key,info);return info;
  }
  const imageKey=(cmd:{src:string;blur?:number})=>cmd.src+(cmd.blur?'#xc-blur='+Math.round(cmd.blur):'');
  for(const cmd of scene.commands)if(cmd.type==='image'&&!imageRefs.has(imageKey(cmd))){
    const asset=assets.get(cmd.src);if(!asset)continue;
    const maxW=Math.max(...scene.commands.filter(c=>c.type==='image'&&c.src===cmd.src).map(c=>c.type==='image'?c.w:0))*Math.min(o.scale,3);
    const factor=Math.min(1,maxW/asset.width,4096/Math.max(asset.width,asset.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(asset.width*factor));canvas.height=Math.max(1,Math.round(asset.height*factor));canvas.getContext('2d')!.drawImage(imageSurface(asset,cmd.blur),0,0,canvas.width,canvas.height);await embedCanvas(imageKey(cmd),canvas);canvas.width=canvas.height=1;
  }
  const mc=document.createElement('canvas'),measure=mc.getContext('2d')!;
  const segmentsCached=new Map<TextCommand,{text:string;vector:boolean;width:number}[]>();
  for(const cmd of scene.commands)if(cmd.type==='text'){
    measure.font=fontCSS(cmd.fontSize,cmd.weight,cmd.italic,cmd.family);
    const parts=segments(cmd,font).map(s=>({...s,width:measure.measureText(s.text).width}));segmentsCached.set(cmd,parts);
    for(const part of parts)if(!part.vector){
      const key='glyph:'+cmd.fontSize+':'+cmd.color+':'+cmd.weight+':'+part.text;
      if(!imageRefs.has(key)){const canvas=document.createElement('canvas'),k=3;canvas.width=Math.max(1,Math.ceil((part.width+4)*k));canvas.height=Math.ceil(cmd.fontSize*1.5*k);const ctx=canvas.getContext('2d')!;ctx.scale(k,k);ctx.font=fontCSS(cmd.fontSize,cmd.weight,cmd.italic,cmd.family);ctx.fillStyle=cmd.color;ctx.fillText(part.text,2,cmd.fontSize*1.1);await embedCanvas(key,canvas);canvas.width=canvas.height=1;}
    }
  }
  const data=provenance(capture,selected,o),xmp=await writer.stream(utf8(xmpMetadata(data)),'/Type /Metadata /Subtype /XML',false);
  const subject=data.sources.map(s=>s.url).join('\n');const info=writer.add(`<< /Title <${utf16Hex(o.anonymize?'X 内容留存':capture.posts.find(p=>p.id===capture.rootId)?.title||'X 内容留存')}> /Creator (X Capture Studio) /Producer (X Capture PDF Engine / fontkit) /Subject <${utf16Hex(subject)}> /Keywords <${utf16Hex(JSON.stringify(data))}> /CreationDate ${literal('D:'+new Date(capture.capturedAt).toISOString().replace(/[-:]/g,'').replace('T','').slice(0,14)+'Z')} >>`);
  const slices=pageSlices(scene,o),pageIDs:number[]=[];
  const outlines=writer.reserve(),bookmarks:{title:string;page:number;x:number;y:number}[]=[];
  for(const [pageIndex,[start,end]] of slices.entries()){
    const h=end-start,userUnit=o.pdfMode==='long'?Math.max(1,scene.width*.75/14000,h*.75/14000):1,u=.75/userUnit,pw=scene.width*u,ph=h*u;
    const page=writer.reserve();pageIDs.push(page);let content='';const shades:{name:string;ref:number}[]=[];
    const y=(v:number)=>ph-(v-start)*u;
    for(const cmd of scene.commands){const b=bounds(cmd);if(b.y+b.h<start||b.y>end)continue;
      if(cmd.type==='rect'){content+=`q /${gs(cmd.alpha??1)} gs ${color(cmd.fill)} rg `;if(cmd.stroke)content+=`${color(cmd.stroke)} RG ${num((cmd.lineWidth||1)*u)} w `;content+=roundPath(cmd.x*u,y(cmd.y+cmd.h),cmd.w*u,cmd.h*u,cmd.r*u)+(cmd.stroke?' B Q\n':' f Q\n');}
      else if(cmd.type==='gradient'){
        const rad=(cmd.angle-90)*Math.PI/180,cx=cmd.x+cmd.w/2,cy=cmd.y+cmd.h/2,ex=Math.abs(Math.cos(rad))*cmd.w/2+Math.abs(Math.sin(rad))*cmd.h/2;
        const f=writer.add(`<< /FunctionType 2 /Domain [0 1] /C0 [${color(cmd.c1)}] /C1 [${color(cmd.c2)}] /N 1 >>`);
        const sh=writer.add(`<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [${num((cx-Math.cos(rad)*ex)*u)} ${num(y(cy-Math.sin(rad)*ex))} ${num((cx+Math.cos(rad)*ex)*u)} ${num(y(cy+Math.sin(rad)*ex))}] /Function ${f} 0 R /Extend [true true] >>`);const name='Sh'+shades.length;shades.push({name,ref:sh});content+=`q ${num(cmd.x*u)} ${num(y(cmd.y+cmd.h))} ${num(cmd.w*u)} ${num(cmd.h*u)} re W n /${name} sh Q\n`;
      }else if(cmd.type==='line'){content+=`q ${color(cmd.color)} RG ${num(cmd.width*u)} w ${num(cmd.x*u)} ${num(y(cmd.y))} m ${num(cmd.x2*u)} ${num(y(cmd.y2))} l S Q\n`;}
      else if(cmd.type==='path'){const vb=cmd.viewBox||[0,0,24,24],kx=u*cmd.size/vb[2],ky=u*cmd.size/vb[3];content+=`q ${num(kx)} 0 0 ${num(-ky)} ${num(cmd.x*u-vb[0]*kx)} ${num(y(cmd.y)+vb[1]*ky)} cm ${color(cmd.color)} RG ${color(cmd.color)} rg 1.7 w 1 J 1 j ${pathPDF(cmd.path)} ${cmd.fill?(cmd.fillRule==='evenodd'?'f*':'f'):'S'} Q\n`;}
      else if(cmd.type==='image'){
        const a=assets.get(cmd.src),im=imageRefs.get(imageKey(cmd));if(!a||!im)continue;const p=imagePlacement(cmd,a),iw=p.w,ih=p.h,ix=p.x,iy=p.y;
        content+=`q ${roundPath(cmd.x*u,y(cmd.y+cmd.h),cmd.w*u,cmd.h*u,cmd.r*u)} W n ${num(iw*u)} 0 0 ${num(ih*u)} ${num(ix*u)} ${num(y(iy+ih))} cm /${im.name} Do Q\n`;
      }else if(cmd.type==='text'){
        const parts=segmentsCached.get(cmd)!;let tx=cmd.x;
        for(const part of parts){if(part.vector){const run=getRun(part.text),advance=run.positions.reduce((sum:number,p:any)=>sum+p.xAdvance,0),natural=advance*cmd.fontSize/units,sx=natural>0?part.width/natural:1;
          const encoded=run.glyphs.map((g:any,i:number)=>{const cid=subset.mapping[g.id],kerning=(g.advanceWidth-run.positions[i].xAdvance)*1000/units;return `<${cid.toString(16).padStart(4,'0')}>${Math.abs(kerning)>.01?' '+num(kerning)+' ':''}`;}).join('');
          content+=`q ${color(cmd.color)} rg ${color(cmd.color)} RG ${num(.22*u)} w /Span << /ActualText <${utf16Hex(part.text)}> >> BDC BT /F1 ${num(cmd.fontSize*u)} Tf ${num(sx*100)} Tz ${cmd.weight>=600?'2':'0'} Tr 1 0 ${cmd.italic?'0.15':'0'} 1 ${num(tx*u)} ${num(y(cmd.y))} Tm [${encoded}] TJ ET EMC Q\n`;
        }else{const im=imageRefs.get('glyph:'+cmd.fontSize+':'+cmd.color+':'+cmd.weight+':'+part.text)!;const iw=im.width/3,ih=im.height/3,iy=cmd.y-cmd.fontSize*1.1;content+=`q /Span << /ActualText <${utf16Hex(part.text)}> >> BDC ${num(iw*u)} 0 0 ${num(ih*u)} ${num((tx-2)*u)} ${num(y(iy+ih))} cm /${im.name} Do EMC Q\n`;}
          tx+=part.width;
        }
        for(const yy of [cmd.underline?cmd.y+2:null,cmd.strike?cmd.y-cmd.fontSize*.3:null])if(yy!==null)content+=`q ${color(cmd.color)} RG ${num(Math.max(.7,cmd.fontSize/18)*u)} w ${num(cmd.x*u)} ${num(y(yy))} m ${num((cmd.x+cmd.width)*u)} ${num(y(yy))} l S Q\n`;
      }
    }
    const links=scene.links.filter(l=>l.y+l.h>start&&l.y<end).map(l=>writer.add(`<< /Type /Annot /Subtype /Link /Rect [${num(l.x*u)} ${num(Math.max(0,y(Math.min(end,l.y+l.h))))} ${num((l.x+l.w)*u)} ${num(Math.min(ph,y(Math.max(start,l.y))))}] /Border [0 0 0] /A << /S /URI /URI ${literal(l.url)} >> >>`));
    const stream=await writer.stream(utf8(content));
    writer.set(page,`<< /Type /Page /Parent ${pagesRoot} 0 R /MediaBox [0 0 ${num(pw)} ${num(ph)}] /UserUnit ${num(userUnit)} /Resources << /Font << /F1 ${fontRef} 0 R >> /XObject << ${[...imageRefs.values()].map(i=>'/'+i.name+' '+i.ref+' 0 R').join(' ')} >> /ExtGState << ${[...opacity.values()].map(g=>'/'+g.name+' '+g.ref+' 0 R').join(' ')} >> /Shading << ${shades.map(s=>'/'+s.name+' '+s.ref+' 0 R').join(' ')} >> >> /Contents ${stream} 0 R /Annots [${links.map(id=>id+' 0 R').join(' ')}] >>`);
    for(const card of scene.cards)if(card.y>=start&&card.y<end){const p=capture.posts.find(p=>p.id===card.id);bookmarks.push({title:o.anonymize?'选中内容':p?.title||`${p?.author.name||'帖子'} · ${card.id}`,page,x:card.x*u,y:y(card.y)});}
    onStatus(`正在封装 PDF · ${pageIndex+1}/${slices.length}`);
  }
  const bmIDs=bookmarks.map(()=>writer.reserve());bookmarks.forEach((b,i)=>writer.set(bmIDs[i],`<< /Title <${utf16Hex(b.title)}> /Parent ${outlines} 0 R ${i?'/Prev '+bmIDs[i-1]+' 0 R':''} ${i<bmIDs.length-1?'/Next '+bmIDs[i+1]+' 0 R':''} /Dest [${b.page} 0 R /XYZ ${num(b.x)} ${num(b.y)} null] >>`));
  writer.set(outlines,`<< /Type /Outlines /Count ${bmIDs.length} ${bmIDs.length?'/First '+bmIDs[0]+' 0 R /Last '+bmIDs[bmIDs.length-1]+' 0 R':''} >>`);
  writer.set(pagesRoot,`<< /Type /Pages /Kids [${pageIDs.map(id=>id+' 0 R').join(' ')}] /Count ${pageIDs.length} >>`);
  writer.set(catalog,`<< /Type /Catalog /Pages ${pagesRoot} 0 R /Metadata ${xmp} 0 R /Outlines ${outlines} 0 R /Lang (zh-CN) /ViewerPreferences << /DisplayDocTitle true >> >>`);
  return new Blob([writer.finish(catalog,info)],{type:'application/pdf'});
}
