import {AssetMap,Capture,Options,Scene} from '../core/model';
import {canvasBlob,drawScene,exportBudget} from '../core/canvas';
import {addPngMetadata,provenance} from './metadata';
export const mobileDevice=()=>/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
export async function exportPNG(scene:Scene,assets:AssetMap,capture:Capture,selected:Set<string>,o:Options):Promise<Blob>{
  const budget=exportBudget(scene.width,scene.height,o.scale,mobileDevice());
  if(!budget.ok)throw new Error(`当前为 ${budget.width} × ${budget.height} px，像素缓冲约 ${budget.rawMB} MB，超过本工具安全预算。请降低倍率/宽度、减少选中内容，或使用长页 PDF；不会自动降低清晰度或裁掉正文。`);
  const canvas=document.createElement('canvas');canvas.width=budget.width;canvas.height=budget.height;
  try{const ctx=canvas.getContext('2d');if(!ctx)throw new Error('浏览器无法创建此尺寸的画布。');drawScene(ctx,scene,assets,o.scale);const raw=new Uint8Array(await (await canvasBlob(canvas)).arrayBuffer());return new Blob([addPngMetadata(raw,provenance(capture,selected,o),o.scale)],{type:'image/png'});}
  finally{canvas.width=1;canvas.height=1;}
}
