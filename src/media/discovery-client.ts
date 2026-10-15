import type {Capture,Host} from '../core/model';
import {ObservedResource,DiscoverySummary,attachObservations,performanceMediaEntries,xPageKey,ObservationState,ObservationResult} from './discovery';
export interface DiscoverySnapshot {capture:Capture;selected:Set<string>;quotes:boolean;private:boolean;}
export interface DiscoveryStatus {state:ObservationState|'idle'|'starting';expiresAt?:number;observed:number;matched:number;ambiguous:number;unmatched:number;segments:number;limited:boolean;formats:string[];}
const EMPTY:DiscoveryStatus={state:'idle',observed:0,matched:0,ambiguous:0,unmatched:0,segments:0,limited:false,formats:[]};
/** Short-lived client session. UI selection/route changes cannot attach late results to a new scope. */
export class MediaDiscoveryClient {
  status:DiscoveryStatus={...EMPTY};
  private generation=0;private sessionId='';private key='';private records=new Map<string,ObservedResource>();
  private timer:ReturnType<typeof setTimeout>|undefined;private polling=false;private disposed=false;
  constructor(private host:Host,private snapshot:()=>DiscoverySnapshot,private refresh:()=>Promise<void>,
    private changed:(status:DiscoveryStatus)=>void,private finished:()=>void,
    private page=()=>location.href,private entries=()=>performanceMediaEntries(performance),
    private config={callTimeoutMs:2500}) {}
  get active(){return this.status.state==='active'||this.status.state==='starting';}
  private scope():string {
    const s=this.snapshot();return [xPageKey(this.page())||this.page(),s.capture.rootId,[...s.selected].sort().join(','),s.quotes,s.private].join('|');
  }
  private emit(){if(!this.disposed)this.changed({...this.status,formats:[...this.status.formats]});}
  async start():Promise<void> {
    await this.stop(false);if(this.disposed)return;
    const s=this.snapshot();if(s.private||!s.selected.size)return;
    const generation=++this.generation;this.key=this.scope();this.records.clear();this.status={...EMPTY,state:'starting'};this.emit();
    this.sessionId=typeof crypto.randomUUID==='function'?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint32Array(4)),v=>v.toString(16)).join('-');
    const id=this.sessionId;
    const result=await this.observe('start',id);
    if(this.disposed||generation!==this.generation||this.key!==this.scope()){
      void this.observe('stop',id);if(generation===this.generation){this.status.state='scope-changed';this.emit();}return;
    }
    this.status.state=result.state;this.status.expiresAt=result.expiresAt;
    for(const r of this.entries())this.remember(r);
    await this.refreshSafely();
    if(generation!==this.generation||this.key!==this.scope()){await this.stop(false,'scope-changed');return;}
    this.apply();
    if(result.state==='active'){for(const r of result.records)this.remember(r);this.schedule();}
    else {if(this.host.observe)void this.observe('stop',id);this.emit();this.finished();}
  }
  private async bounded<T>(work:()=>Promise<T>,fallback:T):Promise<T> {
    return new Promise(resolve=>{let ended=false;const done=(v:T)=>{if(ended)return;ended=true;clearTimeout(timer);resolve(v);};
      const timer=setTimeout(()=>done(fallback),Math.max(10,Math.min(4000,this.config.callTimeoutMs)));
      Promise.resolve().then(work).then(done,()=>done(fallback));
    });
  }
  private observe(action:'start'|'poll'|'stop',id:string):Promise<ObservationResult> {
    const fallback:ObservationResult={state:(this.host.observe?'unavailable':'unsupported') as ObservationState,records:[] as ObservedResource[]};
    return this.bounded(()=>this.host.observe?this.host.observe(action,id):Promise.resolve(fallback),fallback);
  }
  private async refreshSafely():Promise<void> {await this.bounded(()=>this.refresh(),undefined);}
  invalidateScope():void {if(this.active&&this.key!==this.scope())void this.stop(false,'scope-changed');}
  private remember(r:ObservedResource):void {
    const a=this.records.get(r.url);if(!a&&this.records.size>=192)return;
    if(a?.source==='network'&&r.source==='performance')return;
    this.records.set(r.url,{...a,...r});
  }
  private apply():void {
    const s=this.snapshot();if(s.private)return;
    const result:DiscoverySummary=attachObservations(s.capture,s.selected,[...this.records.values()],s.quotes);
    this.status={...this.status,observed:this.records.size,matched:result.matched,unmatched:result.unmatched,ambiguous:result.ambiguous,
      segments:Math.max(this.status.segments,result.segments),formats:result.formats};this.emit();
  }
  private schedule():void {
    if(!this.active||this.disposed)return;
    this.timer=setTimeout(()=>void this.poll(),700);(this.timer as any).unref?.();
  }
  async poll():Promise<void> {
    if(this.polling||!this.active||!this.host.observe||this.disposed)return;
    if(this.scope()!==this.key){await this.stop(false,'scope-changed');return;}
    this.polling=true;const generation=this.generation,id=this.sessionId;
    try{
      const result=await this.observe('poll',id);
      if(generation!==this.generation||this.disposed)return;
      if(this.scope()!==this.key){await this.stop(false,'scope-changed');return;}
      for(const r of result.records||[])this.remember(r);
      for(const r of this.entries())this.remember(r);
      await this.refreshSafely();
      if(generation!==this.generation||this.scope()!==this.key||this.disposed)return;
      this.status.limited=!!result.limited;this.status.segments=result.segments||0;this.apply();
      if(result.state!=='active'||Date.now()>=(this.status.expiresAt||0)-900){
        await this.stop(false,result.state==='active'?'expired':result.state);this.finished();return;
      }
    }catch{if(generation===this.generation){await this.stop(false,'unavailable');this.finished();}}finally{this.polling=false;if(generation===this.generation)this.schedule();}
  }
  async stop(collect=false,state:ObservationState='stopped'):Promise<void> {
    if(this.timer)clearTimeout(this.timer);const id=this.sessionId;
    // Stop is a cancellation boundary; no awaited old poll may mutate selection afterwards.
    const same=this.key===this.scope();++this.generation;this.status.state=state;this.sessionId='';
    if(id&&this.host.observe){
      try{
        if(collect&&same&&!this.snapshot().private){const r=await this.observe('poll',id);for(const v of r.records||[])this.remember(v);}
        await this.observe('stop',id);
      }catch{/* Browser context may already be gone. */}
    }
    if(collect&&same&&!this.disposed){await this.refreshSafely();if(this.key===this.scope())this.apply();}
    this.records.clear();this.emit();
  }
  dispose():void {this.disposed=true;void this.stop(false);}
}
