import {Block, Media, Post} from './model';
import {mergeMediaResources,sameMediaKey} from '../media/resources';

/** Observed, reusable HTTP(S) addresses only. Never expose local Blob/data URLs
 * or user-info credentials. Unknown/signed resource parameters are not rewritten. */
export function httpMediaURL(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value) || /[\u0000-\u0020\u007f]/.test(value)) return;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return;
    return url.href;
  } catch { return; }
}
/** Select the original-size rendition of X post/Article photos, not avatars,
 * card previews or video posters. This is an image-server request, not upscaling
 * or a guarantee of availability. Native WebP uses the large public rendition:
 * an original WebP variant is not assumed to exist, nor is its format guessed. */
export function highResolutionImageURL(value: unknown): string | undefined {
  const address = httpMediaURL(value); if (!address) return;
  const u = new URL(address);
  if (u.hostname !== 'pbs.twimg.com' || (u.port && !['80', '443'].includes(u.port))) return address;
  const m = u.pathname.match(/^\/media\/([A-Za-z0-9_-]+)(?:\.(jpe?g|png|webp|gif))?(?::(?:thumb|small|medium|large|orig|\d+x\d+))?$/i);
  if (!m || [...u.searchParams.keys()].some(key => /(?:token|signature|credential|authorization|^sig$|^policy$|^expires$|^x-amz-|^x-goog-)/i.test(key))) return address;
  const format = (u.searchParams.get('format') || m[2] || '').toLowerCase();
  if (!['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(format)) return address;
  u.protocol = 'https:'; u.port = ''; u.pathname = '/media/' + m[1];
  u.searchParams.set('format', format === 'jpeg' ? 'jpg' : format);
  u.searchParams.set('name', format === 'webp' ? '4096x4096' : 'orig');
  u.hash = '';
  return u.href;
}
/** For non-X image servers retain an explicitly observed larger srcset URL.
 * Width and density descriptors are ranked within their own kind; no media URL
 * is invented and data/blob candidates never enter copied text. */
export function observedImageURL(image: HTMLImageElement): string | undefined {
  const candidates = (image.getAttribute('srcset') || '').split(',').slice(0, 32).map(part => {
    const match = part.trim().match(/^(\S+)\s+(\d+(?:\.\d+)?)(w|x)$/);
    const url = match ? httpMediaURL(match[1]) : undefined;
    return url && Number(match![2]) > 0 ? {url, size: Number(match![2]), kind: match![3]} : undefined;
  }).filter((v): v is {url:string;size:number;kind:string} => !!v);
  const widths = candidates.filter(v => v.kind === 'w'), densities = candidates.filter(v => v.kind === 'x');
  const ranked = (widths.length ? widths : densities).sort((a, b) => b.size - a.size);
  return ranked[0]?.url || httpMediaURL(image.currentSrc) || httpMediaURL(image.src);
}
export function videoMediaURL(value: unknown): string | undefined {
  const url = httpMediaURL(value);
  if (url && /\.(?:mp4|m4v|mov|webm|ogv|ogg|m3u8|mpd)$/i.test(new URL(url).pathname)) return url;
}
/** Video share/player pages are NOT file URLs. Unlike sourceURL(), this helper
 * keeps the observed /video/n suffix. Tracking/timestamp parameters are omitted. */
export function xVideoPageURL(value: unknown, base = 'https://x.com/'): string | undefined {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f]/.test(value)) return;
  try {
    const u = new URL(value, base);
    if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.port ||
        !/^(?:www\.|mobile\.)?(?:x\.com|twitter\.com)$/.test(u.hostname)) return;
    const m = u.pathname.match(/^\/([A-Za-z0-9_]+\/status\/\d+|i\/web\/status\/\d+)\/video\/([1-9]\d{0,2})\/?$/);
    if (m) return 'https://x.com/' + m[1] + '/video/' + m[2];
  } catch { return; }
}
/** Restrict DOM link lookup to the video's own container. Never take a sibling's
 * /video/n or a link from an embedded/quoted post. */
export function observedVideoPageURL(video: HTMLVideoElement): string | undefined {
  const box = video.closest('[data-testid="videoComponent"]') || video.parentElement;
  const candidates = [video.getAttribute('data-href'), video.getAttribute('data-url'),
    video.closest('a[href]')?.getAttribute('href'), box?.getAttribute('data-href'), box?.getAttribute('data-url')];
  if (box) for (const n of box.querySelectorAll('a[href], [data-href], [data-url]')) {
    // Do not inspect another player's anchors in an unusually broad wrapper.
    if (box.querySelectorAll('video').length === 1) candidates.push(n.getAttribute('href'), n.getAttribute('data-href'), n.getAttribute('data-url'));
  }
  return candidates.map(v => xVideoPageURL(v)).find(Boolean);
}
/** Derive a player page only from a known post + its observed attachment slot.
 * Article IDs are not post IDs. Unknown multi-media ordering does not justify
 * assigning every player /video/1. Explicit X player links always take precedence. */
export function videoPageForMedia(media: Media, post: Post): string | undefined {
  const explicit = xVideoPageURL(media.playbackUrl) || xVideoPageURL(media.href);
  if (explicit) return explicit;
  if (post.kind !== 'post' || media.kind === 'image') return;
  let slot = media.attachmentIndex;
  const attachments = post.blocks.filter((b): b is {kind:'media'; media:Media} => b.kind === 'media');
  if (slot === undefined && attachments.length === 1 && attachments[0].media === media) slot = 1;
  if (!Number.isInteger(slot) || slot! < 1 || slot! > 999) return;
  for (const value of [media.href, post.url]) {
    const address = httpMediaURL(value); if (!address) continue;
    const u = new URL(address);
    if (!/^(?:www\.|mobile\.)?(?:x\.com|twitter\.com)$/.test(u.hostname) || u.port) continue;
    const m = u.pathname.match(/^\/([A-Za-z0-9_]+\/status\/\d+|i\/web\/status\/\d+)(?:\/(?:photo|video)\/\d+)?\/?$/);
    if (m) return `https://x.com/${m[1]}/video/${slot}`;
  }
  return;
}
/** Retain a selected resource or an explicit <source>, never video.poster. */
export function observedVideoURL(video: HTMLVideoElement): string | undefined {
  const urls = [video.currentSrc, video.src, ...Array.from(video.querySelectorAll('source')).map(n => n.src)]
    .map(videoMediaURL).filter((v): v is string => !!v);
  return urls.find(url => !/\.(?:m3u8|mpd)$/i.test(new URL(url).pathname)) || urls[0];
}
function resourceKey(value: unknown): string | undefined {
  const url = httpMediaURL(value); if (!url) return;
  const u = new URL(url);
  return u.hostname + u.pathname.replace(/:(?:thumb|small|medium|large|orig|\d+x\d+)$/i, '').replace(/\.(?:jpe?g|png|webp)$/i, '');
}
/** Enrich only same-media matches within the same post. Display src, pixels,
 * blocks and order are untouched. No video bytes or private endpoints requested. */
export function enrichMediaLinks(blocks: Block[], value: unknown): void {
  if (!Array.isArray(value)) return;
  const observed = blocks.filter((b): b is {kind:'media'; media:Media} => b.kind === 'media');
  const raw = value.slice(0, 16).filter(m => m && ['image', 'video', 'gif'].includes(m.kind));
  for (const {media} of observed) {
    const key = sameMediaKey(media) || resourceKey(media.posterUrl) || resourceKey(media.src);
    const sameType = raw.filter(m => m.kind === media.kind);
    const matches = key ? sameType.filter(m => !!media.mediaId&&m.mediaId===media.mediaId || (!media.mediaId||!m.mediaId)&&((sameMediaKey({...m,mediaId:undefined})||resourceKey(m.posterUrl)||resourceKey(m.src)) === (sameMediaKey({...media,mediaId:undefined})||resourceKey(media.posterUrl)||resourceKey(media.src)))) : [];
    const candidate = matches.length === 1 ? matches[0] : !key && observed.length === 1 && raw.length === 1 && sameType.length === 1 ? sameType[0] : undefined;
    if (!candidate) continue;
    mergeMediaResources(media,candidate);
    if (media.kind === 'image') {
      const source = httpMediaURL(candidate.sourceUrl) || httpMediaURL(candidate.src);
      if (source) media.sourceUrl = source;
    } else {
      const playback = xVideoPageURL(candidate.playbackUrl) || xVideoPageURL(candidate.href);
      if (playback && !xVideoPageURL(media.playbackUrl)) media.playbackUrl = playback;
      if (Number.isInteger(candidate.attachmentIndex) && candidate.attachmentIndex >= 1 && candidate.attachmentIndex <= 999)
        media.attachmentIndex = candidate.attachmentIndex;
      const current = videoMediaURL(media.sourceUrl), source = videoMediaURL(candidate.sourceUrl);
      if (source && (!current || /\.(?:m3u8|mpd)$/i.test(new URL(current).pathname))) media.sourceUrl = source;
    }
  }
}
