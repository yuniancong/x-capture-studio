import {ObservedResource,observedMediaURL,acceptedVariant} from './discovery';

/** Names of video.twimg.com manifests/files THIS document already requested.
 * Logged-in X empties the Performance resource timeline, so reading it later finds
 * nothing; a buffered PerformanceObserver still sees each entry as it is queued.
 * No permission, no request, no headers: names only, in page memory, never stored
 * or sent. Segments and other hosts are dropped. Attachment still requires media identity. */
export class PassiveMediaLog {
  private records=new Map<string,ObservedResource>();private observer?:{disconnect():void};
  constructor(private limit=160){}
  start(ctor:any=(globalThis as any).PerformanceObserver,timeOrigin=(globalThis as any).performance?.timeOrigin??Date.now()):boolean {
    if(this.observer)return true;if(typeof ctor!=='function')return false;
    try{
      const o=new ctor((list:any)=>{try{for(const e of list.getEntries())this.add(e?.name,timeOrigin+(Number(e?.startTime)||0));}catch{/* Observation is optional. */}});
      o.observe({type:'resource',buffered:true});this.observer=o;return true;
    }catch{return false;}
  }
  private add(name:unknown,at:number):void {
    const url=observedMediaURL(name);if(!url)return;const v=acceptedVariant(url);if(!v||v.kind==='segment')return;
    // Re-insert so the bound keeps the most recently requested media.
    this.records.delete(url);this.records.set(url,{url,source:'performance',frameId:0,observedAt:Number.isFinite(at)?at:Date.now()});
    while(this.records.size>this.limit)this.records.delete(this.records.keys().next().value!);
  }
  entries():ObservedResource[] {return [...this.records.values()].reverse().map(r=>({...r}));}
  stop():void {try{this.observer?.disconnect();}catch{}this.observer=undefined;this.records.clear();}
}
/** One per content-script/userscript instance; started only on X pages, never in the demo. */
export const passiveMediaLog=new PassiveMediaLog();
