const fs=require('fs'),path=require('path');
let ts;try{ts=require('typescript');}catch{try{ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');}catch{throw Error('Run npm install before npm run build.');}}
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'dist');fs.mkdirSync(OUT,{recursive:true});
function resolve(name,from){
 if(name==='fontkit')return path.join(ROOT,'vendor/fontkit.cjs');if(name==='qrcode-core')return path.join(ROOT,'vendor/qrcode.cjs');
 if(!name.startsWith('.'))throw Error('Unbundled external module: '+name);
 const base=path.resolve(path.dirname(from),name);for(const p of [base,base+'.ts',base+'.js',base+'.cjs',path.join(base,'index.ts')])if(fs.existsSync(p)&&fs.statSync(p).isFile())return p;
 throw Error('Cannot resolve '+name+' from '+from);
}
// Public Stay 9b78d76 treats even standard qualified timer/event calls as custom globals.
// Use the standard globalThis object in the isolated userscript build; do not read page-owned state.
function stayIsolatedGlobals(context){
 const visit=node=>{
  if(ts.isPropertyAccessExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='window')
   return ts.factory.updatePropertyAccessExpression(node,ts.factory.createIdentifier('globalThis'),node.name);
  return ts.visitEachChild(node,visit,context);
 };return file=>ts.visitNode(file,visit);
}
function bundle(entry,platform,asModule=false){const modules=[],ids=new Map();
 function visit(file){if(ids.has(file))return ids.get(file);const id=modules.length;ids.set(file,id);modules.push('');let code=fs.readFileSync(file,'utf8');
  if(file.endsWith('.ts'))code=ts.transpileModule(code,{fileName:file,transformers:platform==='stay'?{before:[stayIsolatedGlobals]}:undefined,compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,esModuleInterop:true,removeComments:false}}).outputText;
  code=code.replace(/\b__PLATFORM__\b/g,JSON.stringify(platform));
  code=code.replace(/require\(\s*(['"])([^'"]+)\1\s*\)/g,(_,q,name)=>`__require(${visit(resolve(name,file))})`);
  modules[id]=`function(module,exports,__require){\n${code}\n}`;return id;
 }
 const root=visit(path.resolve(ROOT,entry));return `${asModule?'module.exports=':''}(function(){'use strict';const modules=[${modules.join(',\n')}];const cache={};function requireModule(id){if(cache[id])return cache[id].exports;const m=cache[id]={exports:{}};modules[id](m,m.exports,requireModule);return m.exports;}return requireModule(${root});})();\n`;
}
const notice='/* Third-party JavaScript notices; no font data included.\n'+fs.readFileSync(path.join(ROOT,'vendor/THIRD_PARTY_NOTICES.md'),'utf8').replace(/\*\//g,'* /')+'\n*/\n';
const ext=path.join(OUT,'extension');fs.mkdirSync(ext,{recursive:true});
for(const[name,entry,platform]of [['content.js','src/entry.ts','extension'],['background.js','src/background.ts','extension'],['popup.js','src/popup.ts','extension'],['demo.js','src/entry.ts','demo']])fs.writeFileSync(path.join(ext,name),(name==='content.js'||name==='demo.js'?notice:'')+bundle(entry,platform));
fs.copyFileSync(path.join(ROOT,'vendor/THIRD_PARTY_NOTICES.md'),path.join(ext,'THIRD_PARTY_NOTICES.md'));
for(const file of ['manifest.json','popup.html'])fs.copyFileSync(path.join(ROOT,'assets',file),path.join(ext,file));
fs.cpSync(path.join(ROOT,'assets/icons'),path.join(ext,'icons'),{recursive:true});
const demo=fs.readFileSync(path.join(ROOT,'assets/demo.html'),'utf8');fs.writeFileSync(path.join(ext,'demo.html'),demo.replace('<!--SCRIPT-->','<script src="demo.js"></script>'));
fs.writeFileSync(path.join(OUT,'X-Capture-Studio-Demo.html'),demo.replace('<!--SCRIPT-->',()=>'<script>'+notice+bundle('src/entry.ts','demo').replace(/<\/script/gi,'<\\/script')+'</script>'));
const header=`// ==UserScript==\n// @name         X Capture Studio\n// @name:zh-CN   X Capture Studio · 高清长图与文本 PDF\n// @namespace    urn:x-capture-studio\n// @version      1.0.0-rc.3\n// @description  本地保存 X 帖文、长文与选中的上下文；可配置高清 PNG、长页文本 PDF；无强制水印。\n// @author       yuniancong\n// @match        https://x.com/*\n// @match        https://www.x.com/*\n// @match        https://mobile.x.com/*\n// @match        https://www.twitter.com/*\n// @match        https://twitter.com/*\n// @match        https://mobile.twitter.com/*\n// @run-at       document-end\n// @noframes\n// @grant        GM_getValue\n// @grant        GM_setValue\n// @grant        GM_registerMenuCommand\n// @grant        GM_xmlhttpRequest\n// @grant        GM_log\n// @grant        GM_info\n// @connect      pbs.twimg.com\n// @connect      abs.twimg.com\n// @connect      video.twimg.com\n// @connect      raw.githubusercontent.com\n// ==/UserScript==\n\n`;
const stayBody=bundle('src/entry.ts','stay');
// Guard the artifact, not only TypeScript sources: the public host scans inactive code and comments too.
if(/\bwindow\./.test(stayBody))throw Error('Stay build contains a qualified window access; audit its injection mode before releasing.');
const bootstrap=fs.readFileSync(path.join(ROOT,'assets/stay-bootstrap.js'),'utf8');
fs.writeFileSync(path.join(OUT,'X-Capture-Studio.user.js'),header+notice+bootstrap+'\ntry {\n'+stayBody+'\n} catch (error) { __XC_STAY_BOOT__.fail(error); }\n');
if(fs.existsSync(path.join(ROOT,'tests/core-entry.ts')))fs.writeFileSync(path.join(OUT,'core-test.cjs'),bundle('tests/core-entry.ts','demo',true));
fs.writeFileSync(path.join(OUT,'build-info.json'),JSON.stringify({version:'1.0.0-rc.3',date:'2026-09-25',typescript:ts.version,platforms:['Chromium MV3','Stay userscript'],fontsBundled:false},null,2));
console.log('Built extension, standalone userscript and offline demo in dist/');
