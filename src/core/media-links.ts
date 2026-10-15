import {Block, Media} from './model';

/** Observed, reusable HTTP(S) addresses only. Never expose local Blob/data URLs,
 * credentials or fabricate a media address from a post ID. Keep query strings. */
export function httpMediaURL(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value) || /[\u0000-\u0020\u007f]/.test(value)) return;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return;
    return url.href;
  } catch { return; }
}
export function videoMediaURL(value: unknown): string | undefined {
  const url = httpMediaURL(value);
  if (url && /\.(?:mp4|m4v|mov|webm|ogv|ogg|m3u8|mpd)$/i.test(new URL(url).pathname)) return url;
}
/** Retain the selected source or an explicit <source> value, not video.poster. */
export function observedVideoURL(video: HTMLVideoElement): string | undefined {
  const urls = [video.currentSrc, video.src, ...Array.from(video.querySelectorAll('source')).map(n => n.src)]
    .map(videoMediaURL).filter((v): v is string => !!v);
  return urls.find(url => !/\.(?:m3u8|mpd)$/i.test(new URL(url).pathname)) || urls[0];
}
function posterKey(value: unknown): string | undefined {
  const url = httpMediaURL(value); if (!url) return;
  const u = new URL(url);
  return u.origin + u.pathname.replace(/\.(?:jpe?g|png|webp)$/i, '');
}
/** Add links only to already-observed videos. Never replace display pixels,
 * add/reorder blocks or match unrelated videos by their list index. */
export function enrichMediaLinks(blocks: Block[], value: unknown): void {
  if (!Array.isArray(value)) return;
  const videos = blocks.filter((b): b is {kind:'media'; media:Media} => b.kind === 'media' && b.media.kind !== 'image');
  const raw = value.slice(0, 16).filter(m => m && (m.kind === 'video' || m.kind === 'gif'));
  for (const {media} of videos) {
    const current = videoMediaURL(media.sourceUrl);
    if (current && !/\.(?:m3u8|mpd)$/i.test(new URL(current).pathname)) continue;
    const key = posterKey(media.posterUrl) || posterKey(media.src);
    const matches = key ? raw.filter(m => (posterKey(m.posterUrl) || posterKey(m.src)) === key) : [];
    const candidate = matches.length === 1 ? matches[0] : !key && videos.length === 1 && raw.length === 1 ? raw[0] : undefined;
    const source = videoMediaURL(candidate?.sourceUrl);
    if (source) media.sourceUrl = source;
  }
}
