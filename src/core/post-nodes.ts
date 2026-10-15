/** Post containers across X web UIs.
 * Classic (logged-in, 2026): <article data-testid="tweet">.
 * Logged-out desktop (verified 2026-10-16): Tailwind <article class="flex flex-col gap-1"> with no data-testid.
 * A logged-out post is recognised only with its own engagement bar and permalink; its quoted post is a nested <article>. */
export const CLASSIC_POST='article[data-testid="tweet"]';
export function isLoggedOutPost(el:Element):boolean{
  if(el.tagName!=='ARTICLE'||el.hasAttribute('data-testid')||el.parentElement?.closest('article'))return false;
  const own=(n:Element)=>n.closest('article')===el;
  return [...el.querySelectorAll('[data-engagement-action]')].some(own)&&[...el.querySelectorAll('a[href*="/status/"]')].some(own);
}
/** Top-level post containers in document order. Classic selection is unchanged; logged-out posts are added only when present. */
export function postNodes(root:ParentNode):HTMLElement[]{
  return [...root.querySelectorAll<HTMLElement>(`${CLASSIC_POST}, article:not([data-testid])`)].filter(el=>el.matches(CLASSIC_POST)?!el.parentElement?.closest(CLASSIC_POST):isLoggedOutPost(el));
}
