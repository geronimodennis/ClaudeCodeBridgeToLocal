const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const {execFileSync} = require('node:child_process');
const ALIAS = 'claude-sonnet-4-6';
function paths(platform=process.platform, home=os.homedir(), env=process.env) {
  const base = platform==='win32' ? (env.LOCALAPPDATA || path.join(home,'AppData','Local'))
    : platform==='darwin' ? path.join(home,'Library','Application Support')
    : (env.XDG_CONFIG_HOME || path.join(home,'.config'));
  return {library:path.join(base,'Claude-3p','configLibrary'), install:path.join(base,'ClaudeDesktopOllamaProxy')};
}
function normalizeUrl(input) {
  const url = new URL(input.includes('://') ? input : 'http://'+input);
  if(!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Use an HTTP(S) server address without credentials, query, or fragment.');
  if(!['','/','/v1','/v1/'].includes(url.pathname)) throw new Error('Enter the Ollama server root, such as http://host:11434.');
  return url.origin;
}
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
function atomic(file,data) {
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const temp=file+'.tmp-'+crypto.randomUUID();
  fs.writeFileSync(temp,data,{mode:0o600});
  fs.renameSync(temp,file);
}
const writeJson=(file,data)=>atomic(file,JSON.stringify(data,null,2)+'\n');
const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
function checkManaged() {
  if(process.platform==='win32') {
    for(const hive of ['HKLM','HKCU']) {
      let output;
      try { output=execFileSync('reg.exe',['query',`${hive}\\SOFTWARE\\Policies\\Claude`],{encoding:'utf8',stdio:['ignore','pipe','pipe']}); }
      catch(error) { if(error.status===1 && /unable to find|not found/i.test(String(error.stderr))) continue; throw new Error('Could not check Claude policy. Check it manually before setup: '+String(error.stderr || error.message)); }
      if(/REG_\w+/.test(output)) throw new Error('Claude has managed registry settings. Use the administrator or Desktop configuration window instead.');
    }
  } else {
    const files=process.platform==='darwin' ? ['/Library/Managed Preferences/com.anthropic.claudefordesktop.plist',path.join('/Library/Managed Preferences',os.userInfo().username,'com.anthropic.claudefordesktop.plist')]
      : ['/etc/claude-desktop/managed-settings.json'];
    if(files.some(file=>fs.existsSync(file))) throw new Error('Claude has managed settings. This wizard does not override them.');
  }
}
function applyConfiguration(p, settings) {
  const stateFile=path.join(p.install,'state.json');
  if(fs.existsSync(stateFile) && readJson(stateFile).active) throw new Error('This wizard already has an active setup. Run restore before setting up again.');
  const metaFile=path.join(p.library,'_meta.json');
  const before=fs.existsSync(metaFile) ? fs.readFileSync(metaFile) : null;
  const meta=before ? JSON.parse(before.toString('utf8').replace(/^\uFEFF/,'')) : {appliedId:'',entries:[]};
  if(!Array.isArray(meta.entries)) throw new Error('Existing Desktop metadata is invalid. No changes made.');
  const id=crypto.randomUUID();
  const backup=path.join(p.install,'backups',id);
  fs.mkdirSync(backup,{recursive:true,mode:0o700});
  if(before) fs.writeFileSync(path.join(backup,'_meta.json'),before,{mode:0o600});
  const entry={inferenceProvider:'gateway',inferenceCredentialKind:'static',inferenceGatewayBaseUrl:settings.gatewayUrl || `http://127.0.0.1:${settings.port}`,inferenceGatewayApiKey:settings.token,inferenceGatewayAuthScheme:'bearer',inferenceModels:[{name:ALIAS,labelOverride:`Ollama: ${settings.model} (proxy)`,anthropicFamilyTier:'sonnet'}]};
  const after=JSON.stringify({...meta,appliedId:id,entries:[...meta.entries,{id,name:'Ollama proxy wizard'}]},null,2)+'\n';
  const state={active:true,id,library:p.library,backup,metaExisted:!!before,afterHash:hash(after)};
  // Save recovery information before changing either Desktop file.
  writeJson(stateFile,state);
  try { writeJson(path.join(p.library,id+'.json'),entry); atomic(metaFile,after); }
  catch(error) {
    if(before) atomic(metaFile,before); else if(fs.existsSync(metaFile)) fs.unlinkSync(metaFile);
    const file=path.join(p.library,id+'.json'); if(fs.existsSync(file)) fs.unlinkSync(file);
    writeJson(stateFile,{...state,active:false}); throw error;
  }
  return state;
}
function restoreConfiguration(p) {
  const stateFile=path.join(p.install,'state.json');
  if(!fs.existsSync(stateFile) || !readJson(stateFile).active) return false;
  const state=readJson(stateFile);
  if(state.library!==p.library || !/^[a-f0-9-]{36}$/.test(state.id)) throw new Error('Unexpected restore target.');
  const metaFile=path.join(p.library,'_meta.json');
  if(!fs.existsSync(metaFile) || hash(fs.readFileSync(metaFile))!==state.afterHash) throw new Error('Desktop configurations changed since setup. Restore through Developer > Configure Third-Party Inference to preserve those changes.');
  if(state.metaExisted) atomic(metaFile,fs.readFileSync(path.join(state.backup,'_meta.json'))); else fs.unlinkSync(metaFile);
  const entry=path.join(p.library,state.id+'.json'); if(fs.existsSync(entry)) fs.unlinkSync(entry);
  writeJson(stateFile,{...state,active:false}); return true;
}
module.exports={ALIAS,paths,normalizeUrl,hash,atomic,writeJson,readJson,checkManaged,applyConfiguration,restoreConfiguration};
