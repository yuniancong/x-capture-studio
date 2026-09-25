/** Offline reproducible vendoring of the installed MIT font engine and QR core.
 * Copies JavaScript only. No font files are distributed. */
const fs=require('fs'),path=require('path'),{createRequire}=require('module');
const ROOT=path.resolve(__dirname,'..');
const globalModules=process.env.XC_GLOBAL_MODULES||'/opt/nvm/versions/node/v22.16.0/lib/node_modules';
function nearestPackage(file){let dir=path.dirname(file);while(dir!==path.dirname(dir)){const p=path.join(dir,'package.json');if(fs.existsSync(p))return {dir,pkg:JSON.parse(fs.readFileSync(p,'utf8'))};dir=path.dirname(dir);}return null;}
function browserResolve(name,from){let target=createRequire(from).resolve(name);const owner=nearestPackage(target);if(owner&&typeof owner.pkg.browser==='object'){const rel='./'+path.relative(owner.dir,target).replace(/\\/g,'/');const remap=owner.pkg.browser[rel];if(typeof remap==='string')target=path.resolve(owner.dir,remap);}return target;}
function bundle(entry){const modules=[],ids=new Map();const licenses=new Map();
 function visit(file){file=path.resolve(file);if(ids.has(file))return ids.get(file);const id=modules.length;ids.set(file,id);modules.push('');
  let code=fs.readFileSync(file,'utf8');const owner=nearestPackage(file);if(owner)licenses.set(owner.pkg.name,owner);
  if(file.endsWith('.json'))code='module.exports='+code+';';else code=code.replace(/require\(\s*(['"])([^'"]+)\1\s*\)/g,(_,q,name)=>{const target=browserResolve(name,file);if(!path.isAbsolute(target))throw Error('Browser bundle contains builtin '+name);return `__r(${visit(target)})`;});
  code=code.replace(/\/\/# sourceMappingURL=.*$/gm,'');modules[id]=`function(module,exports,__r){\n${code}\n}`;return id;
 }
 const root=visit(entry);return {code:`module.exports=(function(){const m=[${modules.join(',\n')}],c={};function r(id){if(c[id])return c[id].exports;const x=c[id]={exports:{}};m[id](x,x.exports,r);return x.exports;}return r(${root});})();\n`,licenses,modules:modules.length};
}
fs.mkdirSync(path.join(ROOT,'vendor'),{recursive:true});let all=[];
for(const[name,entry]of [['fontkit',path.join(globalModules,'fontkit/dist/browser.cjs')],['qrcode',path.join(globalModules,'npm/node_modules/qrcode-terminal/vendor/QRCode/index.js')]]){
 const out=bundle(entry);fs.writeFileSync(path.join(ROOT,'vendor',name+'.cjs'),out.code);console.log(name,out.modules,out.code.length);
 for(const[n,{dir,pkg}]of out.licenses){let license='';for(const file of ['LICENSE','LICENSE.md','LICENSE.txt','license','license.txt'])if(fs.existsSync(path.join(dir,file))){license=fs.readFileSync(path.join(dir,file),'utf8');break;}all.push(`## ${n} ${pkg.version}\nLicense: ${typeof pkg.license==='string'?pkg.license:JSON.stringify(pkg.licenses)}\n\n${license||'License notice is preserved in the bundled source where present.'}\n`);}
}
fs.writeFileSync(path.join(ROOT,'vendor','THIRD_PARTY_NOTICES.md'),'# Third-party notices\n\nJavaScript engines only; no fonts included.\n\n'+[...new Set(all)].join('\n---\n\n')+'\n## QR core\nCopyright (c) 2009 Kazuhiko Arase. MIT License. The core source includes the original notice.\n');
