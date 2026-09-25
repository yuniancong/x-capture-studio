import {Options} from '../core/model';
import {el,button,icon} from './dom';
export function group(label:string,content:Node,extra?:string){return el('section',{class:'xc-group'},el('div',{class:'xc-label'},label,extra?el('span',{},extra):null),content);}
export function segment<T extends string|number>(items:[T,string][],value:T,change:(v:T)=>void){const root=el('div',{class:'xc-segment'});for(const[k,label]of items){const b=button(label,()=>{change(k);root.querySelectorAll('button').forEach(n=>{n.classList.toggle('is-active',n===b);n.setAttribute('aria-pressed',String(n===b));});},k===value?'is-active':'');b.setAttribute('aria-pressed',String(k===value));root.append(b);}return root;}
export function toggle(label:string,value:boolean,change:(v:boolean)=>void){const input=el('input',{type:'checkbox',checked:value,'aria-label':label,onChange:(e:Event)=>change((e.target as HTMLInputElement).checked)});return el('label',{class:'xc-toggle'},el('span',{},label),el('span',{style:'position:relative;display:inline-flex'},input,el('span',{class:'xc-switch'})));}
export function range(label:string,value:number,min:number,max:number,step:number,change:(v:number)=>void,unit=''){
  const num=el('input',{type:'number',min,max,step,value,class:'xc-number','aria-label':label+'数值'});const slider=el('input',{type:'range',min,max,step,value,'aria-label':label});
  const update=(v:number)=>{if(!Number.isFinite(v))return;v=Math.max(min,Math.min(max,v));num.value=slider.value=String(v);change(v);};
  slider.addEventListener('input',()=>update(Number(slider.value)));num.addEventListener('change',()=>update(Number(num.value)));
  return group(label,el('div',{class:'xc-range-row'},slider,num),unit);
}
export function select<T extends string>(label:string,items:[T,string][],value:T,change:(v:T)=>void){const node=el('select',{class:'xc-select','aria-label':label,onChange:(e:Event)=>change((e.target as HTMLSelectElement).value as T)});for(const[k,text]of items)node.append(el('option',{value:k,selected:k===value},text));return group(label,node);}
export function colors(o:Options,change:(v:Partial<Options>)=>void){
  const palettes:[string,string,string][]=[['#647bee','#7950ab','鸢尾紫'],['#ee829e','#f8c759','暖日落'],['#43dbaa','#22bdd0','薄荷'],['#242735','#444058','暮色'],['#264d81','#78c9e8','海岸蓝'],['#18534d','#a6cb87','森林'],['#a7325c','#ffa77e','珊瑚'],['#252846','#7250a0','夜空'],['#eed5ba','#9daaa0','沙丘'],['#cfdbff','#efd4e9','云霞'],['#152b42','#157e93','深海'],['#efbc55','#e27842','琥珀'],['#ffffff','#ffffff','纯白'],['#11151c','#11151c','纯黑'],['transparent','transparent','透明']];
  const row=el('div',{class:'xc-swatches'});
  for(const[c1,c2,label]of palettes){const active=o.background==='transparent'?c1==='transparent':o.background!=='image'&&c1===o.bg1&&c2===o.bg2;const b=el('button',{type:'button',class:'xc-swatch'+(c1==='transparent'?' transparent':'')+(active?' is-active':''),'aria-label':'背景：'+label,title:label,onClick:()=>change(c1==='transparent'?{background:'transparent'}:{background:c1===c2?'solid':'gradient',bg1:c1,bg2:c2})});if(c1!=='transparent')b.style.background=`linear-gradient(135deg,${c1},${c2})`;if(active)b.append(icon('check',19));row.append(b);}
  const custom=el('div',{class:'xc-colorrow'},'自定义',el('input',{type:'color',value:o.bg1,'aria-label':'背景颜色一',onInput:(e:Event)=>change({bg1:(e.target as HTMLInputElement).value})}),el('input',{type:'color',value:o.bg2,'aria-label':'背景颜色二',onInput:(e:Event)=>change({bg2:(e.target as HTMLInputElement).value})}));
  const sel=el('select',{class:'xc-select',style:'width:95px;padding:4px;font-size:11px','aria-label':'背景类型',onChange:(e:Event)=>change({background:(e.target as HTMLSelectElement).value as any})});for(const[k,t]of [['gradient','渐变'],['solid','纯色'],['transparent','透明'],['image','图片 / 壁纸']])sel.append(el('option',{value:k,selected:o.background===k},t));custom.append(sel);
  return group('背景',el('div',{},row,custom));
}
