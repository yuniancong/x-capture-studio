import {ObservationLedger,ObservationContext,ObservationResult,MediaEvent,xPageKey,OBSERVATION_LIMITS} from '../media/discovery';
const KEY='xc-media-observation-v1',ALARM='xc-media-observation-expiry';
const FILTER={urls:['https://video.twimg.com/*'],types:['media','xmlhttprequest','other']};

/** Adapter only: synchronous listener registration, serialized state, memory-only session storage. */
export class ChromeObservationBridge {
  private ledger=new ObservationLedger();private queue:Promise<unknown>=Promise.resolve();
  private bound=false;private expiry:number|undefined;private timer:ReturnType<typeof setTimeout>|undefined;
  private healthy=false;
  constructor(private api:any,private now=()=>Date.now()) {
    this.healthy=!!(api.storage?.session&&api.alarms?.onAlarm);
    // Register listeners before any await: worker wakes on events even after suspension.
    this.bind();
    api.permissions?.onAdded?.addListener((p:any)=>{if(p.permissions?.includes('webRequest'))this.bind();});
    api.permissions?.onRemoved?.addListener((p:any)=>{if(p.permissions?.includes('webRequest'))void this.run(async()=>{this.ledger=new ObservationLedger();await this.save();});});
    api.tabs?.onRemoved?.addListener((tabId:number)=>{void this.run(async()=>{this.ledger.stop(tabId);await this.save();});});
    api.tabs?.onUpdated?.addListener((tabId:number,change:any)=>{
      if(change.status!=='loading'&&!change.url)return;
      void this.run(async()=>{const s=this.ledger.session(tabId);if(s&&(change.status==='loading'||xPageKey(change.url)!==s.page)){this.ledger.stop(tabId);await this.save();}});
    });
    api.alarms?.onAlarm?.addListener((alarm:any)=>{if(alarm.name===ALARM)void this.run(()=>this.save());});
    // Events received during hydration are queued AFTER this operation.
    this.queue=(async()=>{
      if(!this.healthy)return;
      try{const data=await api.storage.session.get(KEY);this.ledger=new ObservationLedger(data?.[KEY],this.now());await this.save();}
      catch{this.healthy=false;this.ledger=new ObservationLedger();}
    })();
  }
  private bind():void {
    if(this.bound||!this.api.webRequest)return;
    const api=this.api;
    const project=(d:any,error=false):MediaEvent=>({tabId:d.tabId,frameId:d.frameId,documentId:d.documentId,initiator:d.initiator,
      url:d.url,type:d.type,requestId:d.requestId,statusCode:d.statusCode,error,
      // Immediately discard other header values; never store an event object.
      mime:typeof d.responseHeaders?.find((h:any)=>h.name?.toLowerCase()==='content-type')?.value==='string'?
        d.responseHeaders.find((h:any)=>h.name?.toLowerCase()==='content-type').value.split(';')[0].slice(0,120):undefined});
    const before=(d:any)=>this.event(project(d));
    const response=(d:any)=>this.event(project(d));
    const error=(d:any)=>this.event(project(d,true));
    try{
      api.webRequest.onBeforeRequest.addListener(before,FILTER);
      api.webRequest.onResponseStarted.addListener(response,FILTER,['responseHeaders']);
      api.webRequest.onErrorOccurred.addListener(error,FILTER);
      this.bound=true;
    }catch{
      // Partial registration never counts as availability.
      api.webRequest.onBeforeRequest?.removeListener?.(before);
      api.webRequest.onResponseStarted?.removeListener?.(response);
      api.webRequest.onErrorOccurred?.removeListener?.(error);
    }
  }
  private run<T>(fn:()=>T|Promise<T>):Promise<T> {
    const next=this.queue.then(fn,fn);this.queue=next.catch(()=>{});return next;
  }
  private event(event:MediaEvent):void {
    const at=this.now();
    void this.run(async()=>{
      if(!this.healthy||!this.bound)return;
      if(this.ledger.record(event,at))await this.save();
    }).catch(()=>{});
  }
  private async save():Promise<void> {
    const sessions=this.ledger.dump(this.now());
    if(this.healthy){
      try{if(sessions.length)await this.api.storage.session.set({[KEY]:sessions});else await this.api.storage.session.remove(KEY);}
      catch{this.healthy=false;this.ledger=new ObservationLedger();try{await this.api.storage.session.remove(KEY);}catch{} }
    }
    const next=this.healthy&&sessions.length?Math.min(...sessions.map(s=>s.expiresAt)):undefined;
    if(next===this.expiry)return;this.expiry=next;if(this.timer)clearTimeout(this.timer);
    if(next){
      try{await this.api.alarms.create(ALARM,{when:next});}catch{this.healthy=false;this.ledger=new ObservationLedger();await this.api.storage.session.remove(KEY).catch(()=>{});}
      this.timer=setTimeout(()=>void this.run(()=>this.save()),Math.max(1,next-this.now()));
      (this.timer as any).unref?.();
    }else try{await this.api.alarms?.clear(ALARM);}catch{}
  }
  private context(sender:any,sessionId:unknown):ObservationContext|undefined {
    if(sender?.id!==this.api.runtime.id||sender.frameId!==0||!Number.isInteger(sender.tab?.id)||!sender.documentId)return;
    const page=xPageKey(sender.url),tabPage=xPageKey(sender.tab.url);
    if(!page||page!==tabPage||typeof sessionId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(sessionId))return;
    return {tabId:sender.tab.id,documentId:sender.documentId,page,sessionId};
  }
  async command(action:string,sender:any,sessionId:unknown):Promise<ObservationResult> {
    const c=this.context(sender,sessionId);if(!c)return {state:'scope-changed',records:[]};
    return this.run(async()=>{
      if(action==='stop'){this.ledger.stop(c.tabId,c.sessionId);await this.save();return {state:'stopped',records:[]};}
      if(!this.healthy)return {state:'unsupported',records:[]};
      const granted=await this.api.permissions.contains({permissions:['webRequest']}).catch(()=>false);
      if(!granted)return {state:'permission-required',records:[]};
      if(!this.bound)return {state:'unsupported',records:[]};
      if(action==='start'&&!this.ledger.begin(c,this.now()))return {state:'unavailable',records:[]};
      if(!['start','poll'].includes(action))return {state:'unsupported',records:[]};
      const result=this.ledger.poll(c,this.now());await this.save();return result;
    });
  }
  /** Called only by the extension's visible button; no consent is inferred from page content. */
  async openPermissionPage(sender:any):Promise<boolean> {
    if(!this.context(sender,'permission-page'))return false;
    await this.api.tabs.create({url:this.api.runtime.getURL('observation.html')+'?returnTab='+sender.tab.id});return true;
  }
  /** Test/diagnostic barrier: no raw URLs are logged. */
  settled():Promise<unknown> {return this.queue;}
}
