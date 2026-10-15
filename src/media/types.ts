/** Resource facts are additive and separate from the screenshot's display src. */
export type ResourceKind = 'image'|'file'|'hls'|'dash'|'audio'|'subtitle'|'poster'|'segment'|'vmap'|'page'|'unknown';
export type ResourceState = 'observed'|'candidate'|'verified'|'unverified'|'unavailable'|'blocked';
export type ResourceSource = 'dom'|'srcset'|'page-data'|'image-rule'|'hls'|'dash'|'vmap'|'legacy'|'track';
export interface ResourceVariant {
  url:string; kind:ResourceKind; state:ResourceState; source:ResourceSource;
  mime?:string; format?:string; width?:number; height?:number; bitrate?:number; averageBitrate?:number;
  codecs?:string; frameRate?:number; language?:string; name?:string; discoveredAt?:string;
  descriptorWidth?:number; descriptorDensity?:number; // Declared srcset values, NOT measured image pixels.
  playlist?:'master'|'media'; parentUrl?:string; role?:'video'|'audio'|'subtitle'|'iframe';
  audioGroup?:string; subtitleGroup?:string; captionGroup?:string;
  periodId?:string; adaptationId?:string; representationId?:string; segmented?:boolean;
  sensitive?:boolean; encrypted?:boolean; drm?:boolean; live?:boolean;
  checkedAt?:string; httpStatus?:number; problem?:ResourceProblem; verifiedBy?:'image-decode'|'manifest-parse'|'headers';
}
export type ResourceProblem = 'not-found'|'forbidden'|'rate-limit'|'http-error'|'network-or-cors'|'timeout'|'cancelled'|'too-large'|'unsupported'|'invalid-content'|'redirect-blocked'|'domain-blocked'|'budget'|'sensitive'|'encrypted';
export interface MediaTrack {
  id:string; kind:'subtitles'|'captions'|'audio'|'descriptions'; language?:string; label?:string;
  format?:string; mime?:string; codecs?:string; url?:string; manifestUrl?:string;
  groupId?:string; periodId?:string; adaptationId?:string; representationId?:string;
  inBand?:boolean; default?:boolean; forced?:boolean; autoSelect?:boolean;
  state:ResourceState; source:ResourceSource; sensitive?:boolean; encrypted?:boolean; segmented?:boolean;
}
export interface ManifestInfo {
  url:string; type:'hls-master'|'hls-media'|'dash'|'vmap'; live?:boolean; encrypted:boolean; drm:boolean;
  segmentCount:number; initializationCount:number; parts?:number; playlistType?:string;
  duration?:number; targetDuration?:number; sequence?:number;
  templates?:{periodId?:string;representationId?:string;media?:string;initialization?:string}[];
  warnings:string[];
}
export interface MediaResources {
  mediaId?:string; ownerId?:string; scopeId?:string; mediaRole?:'body'|'cover'|'embed';
  variants?:ResourceVariant[]; tracks?:MediaTrack[]; manifests?:ManifestInfo[];
  selectedImageUrl?:string; resolutionStatus?:'pending'|'complete'|'partial'; resourceNotes?:string[];
}
export interface ManifestResult { variants:ResourceVariant[]; tracks:MediaTrack[]; info:ManifestInfo; variables?:Record<string,string>; }
export interface ResourceRequest { url:string; purpose:'image'|'manifest'|'headers'; maxBytes:number; timeoutMs:number; }
export interface ResourceResponse { status:number; url:string; mime:string; bytes:Uint8Array; problem?:ResourceProblem; }
export interface ResourceTransport { (request:ResourceRequest,signal?:AbortSignal):Promise<ResourceResponse>; }
