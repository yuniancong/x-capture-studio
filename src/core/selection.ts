import {enrichMediaLinks} from './media-links';
import {Capture,Post,Role,SelectionRule} from './model';
export function rootPost(c:Capture):Post|undefined{return c.posts.find(p=>p.id===c.rootId)||c.posts[0];}
/** Only explicit reply IDs establish thread continuity. Same author alone never does. */
export function authorChain(c:Capture):Set<string>{
  const root=rootPost(c);if(!root)return new Set();
  const same=(p:Post)=>p.author.handle.toLowerCase()===root.author.handle.toLowerCase();
  const result=new Set([root.id]);const byId=new Map(c.posts.map(p=>[p.id,p]));
  let current=root, visited=new Set<string>();
  while(current.parentId&&!visited.has(current.id)){
    visited.add(current.id);const p=byId.get(current.parentId);if(!p||!same(p))break;
    result.add(p.id);current=p;
  }
  let changed=true;while(changed){changed=false;for(const p of c.posts)if(same(p)&&p.parentId&&result.has(p.parentId)&&!result.has(p.id)){result.add(p.id);changed=true;}}
  return result;
}
export function selectByRule(c:Capture,rule:SelectionRule,previous:Set<string>=new Set()):Set<string>{
  const root=rootPost(c);if(!root)return new Set();
  if(rule==='manual')return new Set(previous);
  if(rule==='single')return new Set([root.id]);
  if(rule==='thread')return authorChain(c);
  if(rule==='author')return new Set(c.posts.filter(p=>p.author.handle.toLowerCase()===root.author.handle.toLowerCase()).map(p=>p.id));
  if(rule==='all')return new Set(c.posts.map(p=>p.id));
  const chain=authorChain(c);
  // Snapshot the author chain: direct replies must not recursively include nested replies.
  return new Set([...chain,...c.posts.filter(p=>p.parentId&&chain.has(p.parentId)).map(p=>p.id)]);
}
export function postRole(p:Post,c:Capture):Role{
  if(p.id===c.rootId)return 'main';
  if(authorChain(c).has(p.id))return 'continuation';
  if(p.author.handle.toLowerCase()===rootPost(c)?.author.handle.toLowerCase())return 'authorReply';
  return 'reply';
}
export const ROLE_LABELS:Record<Role,string>={main:'主帖',continuation:'作者串',reply:'相关回复',authorReply:'作者回应',quote:'引用帖子'};
export function mergePosts(old:Post[],fresh:Post[]):Post[]{
  const map=new Map(old.map(p=>[p.id,p]));
  for(const p of fresh){const a=map.get(p.id);if(!a){map.set(p.id,p);continue;}
    const textLen=(q:Post)=>q.blocks.filter(b=>b.kind==='text').map(b=>b.kind==='text'?b.runs.map(r=>r.text).join(''):'').join('').length;
    const keep=textLen(a)>textLen(p)?a:p;
    enrichMediaLinks(keep.blocks,(keep===a?p:a).blocks.filter(b=>b.kind==='media').map(b=>b.kind==='media'?b.media:null));
    map.set(p.id,{...a,...p,blocks:keep.blocks,author:{...a.author,...p.author,avatar:p.author.avatar||a.author.avatar,badge:p.author.badge||a.author.badge},quote:p.quote&&a.quote&&p.quote.id===a.quote.id?mergePosts([a.quote],[p.quote])[0]:p.quote||a.quote,parentId:p.parentId||a.parentId,conversationId:p.conversationId||a.conversationId,relationEvidence:p.relationEvidence==='data'||a.relationEvidence==='data'?'data':p.relationEvidence,warnings:[...new Set(keep.warnings)]});
  }
  return [...map.values()];
}
