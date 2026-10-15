import type {MediaResources,ResourceRequest,ResourceResponse} from '../media/types';
/** Captured facts are separate from selection, style and inferred relationships. */
export const VERSION = '1.0.0-rc.7';
export interface Run { text:string; bold?:boolean; italic?:boolean; underline?:boolean; strike?:boolean; code?:boolean; href?:string; }
export type Block = {kind:'text'; runs:Run[]; level?:number; quote?:boolean; list?:string; code?:boolean} | {kind:'media'; media:Media} | {kind:'embed'; post:Post} | {kind:'divider'};
export interface MediaDisplay {x:number;y:number;width:number;height:number;fit:'contain'|'cover';}
export interface Badge {paths:{path:string;color:string;rule?:'nonzero'|'evenodd'}[]; viewBox:[number,number,number,number];}
export interface Media extends MediaResources { src:string; kind:'image'|'video'|'gif'; alt:string; width?:number; height?:number; duration?:string; href?:string; display?:MediaDisplay; sourceUrl?:string; playbackUrl?:string; attachmentIndex?:number; posterUrl?:string; textOrder?:number; }
export interface Author { name:string; handle:string; avatar?:string; verified?:boolean; badge?:Badge; }
export interface Poll { options:{text:string; percent?:number}[]; summary?:string; }
export interface Post {
  id:string; url:string; author:Author; blocks:Block[]; published?:string; displayTime?:string;
  kind:'post'|'article'; title?:string; quote?:Post; linkCard?:{title:string; description?:string; url:string; image?:string; media?:Media};
  metrics:Record<string,string>; poll?:Poll; note?:string; edited?:string;
  parentId?:string; conversationId?:string; replyToHandle?:string;
  relationEvidence:'data'|'dom'|'unknown'; warnings:string[]; capturedAt:string;
}
export interface Capture { rootId:string; posts:Post[]; sourceUrl:string; capturedAt:string; collectionNotes:string[]; }
export type Role='main'|'continuation'|'reply'|'authorReply'|'quote';
export type SelectionRule='single'|'thread'|'author'|'direct'|'all'|'manual';
export interface Options {
  mode:'stack'|'native'|'document'; theme:'light'|'dim'|'dark';
  background:'gradient'|'solid'|'transparent'|'image'; bg1:string; bg2:string; angle:number;
  bgImage:string; bgImageFit:'cover'|'contain'; bgImageX:number; bgImageY:number; bgDim:number; bgBlur:number; bgPattern:'none'|'grid'|'dots';
  ratio:'auto'|'1:1'|'4:5'|'9:16'|'16:9'; width:number; padding:number; gap:number; radius:number;
  cardPadding:number; shadow:number; border:boolean; fontSize:number; lineHeight:number; metaSize:number; avatarSize:number;
  showAvatar:boolean; showAuthor:boolean; showHandle:boolean; showVerified:boolean;
  showTime:boolean; showMetrics:boolean; showQuote:boolean; showMedia:boolean; showNote:boolean; showRelation:boolean;
  showSource:boolean; showCaptureTime:boolean; showQR:boolean; sourceMetadata:boolean;
  anonymize:boolean; anonymousSources:boolean;
  mediaLayout:'native'|'grid'|'stack'; mediaFit:'contain'|'cover'; mediaMaxHeight:number;
  compactReplies:boolean; roleStyles:boolean; replyIndent:number; replyBg:string; authorAccent:boolean; connectors:boolean;
  scale:1|2|3|4; pdfMode:'long'|'pages'; pdfPage:'a4'|'letter'; defaultReplies:'none'|'direct'|'all';
  maxPosts:number; maxScrolls:number;
}
export interface Scene { width:number; height:number; commands:Command[]; links:LinkRect[]; cards:CardBounds[]; texts:string[]; warnings:string[]; }
export interface LinkRect {x:number;y:number;w:number;h:number;url:string;}
export interface CardBounds {id:string; x:number;y:number;w:number;h:number; role:Role;}
export interface RectCommand {type:'rect';x:number;y:number;w:number;h:number;r:number;fill:string;stroke?:string;lineWidth?:number;alpha?:number;}
export interface TextCommand {type:'text';x:number;y:number;text:string;fontSize:number;weight:number;italic:boolean;family:string;color:string;width:number;ascent:number;underline?:boolean;strike?:boolean;href?:string;}
export interface ImageCommand {type:'image';x:number;y:number;w:number;h:number;src:string;r:number;fit:'contain'|'cover';alt:string;positionX?:number;positionY?:number;blur?:number;}
export interface LineCommand {type:'line';x:number;y:number;x2:number;y2:number;color:string;width:number;}
export interface PathCommand {type:'path';x:number;y:number;size:number;path:string;color:string;fill?:boolean;fillRule?:'nonzero'|'evenodd';viewBox?:[number,number,number,number];}
export interface GradientCommand {type:'gradient';x:number;y:number;w:number;h:number;c1:string;c2:string;angle:number;}
export type Command=RectCommand|TextCommand|ImageCommand|LineCommand|PathCommand|GradientCommand;
export interface Asset { image:HTMLImageElement; dataUrl:string; width:number;height:number; }
export type AssetMap=Map<string,Asset>;
export interface Host {
  kind:'extension'|'stay'|'demo';
  getValue<T>(key:string,fallback:T):Promise<T>;
  setValue(key:string,value:unknown):Promise<void>;
  readBytes(url:string,signal?:AbortSignal):Promise<Uint8Array>;
  probe?(ids:string[]):Promise<Partial<Post>[]>;
  readResource?(request:ResourceRequest,signal?:AbortSignal):Promise<ResourceResponse>;
}
export const FONT_URL='https://raw.githubusercontent.com/notofonts/noto-cjk/Sans2.004/Sans/OTF/SimplifiedChinese/NotoSansCJKsc-Regular.otf';
export const FONT_CACHE_KEY='noto-cjk-sc-Sans2.004';
