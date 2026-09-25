declare const chrome: any;
declare const GM_getValue: undefined | ((key:string, fallback?:any)=>any);
declare const GM_setValue: undefined | ((key:string, value:any)=>any);
declare const GM_registerMenuCommand: undefined | ((name:string, callback:()=>void)=>any);
declare const GM_xmlhttpRequest: undefined | ((options:any)=>any);
declare const unsafeWindow: Window | undefined;
declare const GM: any;
declare const __PLATFORM__: 'extension'|'stay'|'demo';
declare module 'fontkit' { const value:any; export = value; }
declare module 'qrcode-core' { const value:any; export = value; }
interface Window { XCapture?: any; }

declare const __XC_STAY_BOOT__: {bind(value:{open:()=>void}):void;markReady():void;fail(error:unknown):void;diagnose():void;report():string;note(stage:string,message:string):void;} | undefined;
