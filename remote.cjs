const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const core=require('./core.cjs');
const {createProxy}=require('./server.cjs');
async function json(url,options={}){
  const response=await fetch(url,{...options,signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('Remote server returned HTTP '+response.status);
  return response.json();
}
function remoteUrl(input){const url=new URL(input);if(url.protocol!=='https:' || url.username || url.password || url.search || url.hash || !['','/'].includes(url.pathname))throw new Error('Remote bridge URL must be an HTTPS origin, such as https://bridge.example.com.');return url.origin;}
async function serverInit(options){
  if(!options.url || !options.model)throw new Error('Use server-init --url http://127.0.0.1:11434 --model YOUR-MODEL [--config FILE]');
  const file=path.resolve(options.config || 'remote-server.json');
  if(fs.existsSync(file))throw new Error('Server configuration already exists. Preserve it or choose another --config file.');
  const url=core.normalizeUrl(options.url);const tags=await json(url+'/api/tags');
  if(!tags.models?.some(model=>model.name===options.model || model.model===options.model))throw new Error('Selected model is not on this Ollama server.');
  const port=Number(options.port || 11435);if(!Number.isInteger(port) || port<1024 || port>65535)throw new Error('Choose a port from 1024 to 65535.');
  const token=process.env.CLAUDEBL_REMOTE_TOKEN || crypto.randomBytes(32).toString('hex');
  if(token.length<32)throw new Error('Use a remote credential at least 32 characters long.');
  core.writeJson(file,{remote:true,url,model:options.model,port,token,instance:crypto.randomUUID()});
  console.log('Remote server settings saved: '+file+'\nThe credential is in this file. Keep it private and transfer it securely to the Desktop client.\nRun claudebl serve --config "'+file+'" behind an HTTPS reverse proxy.');
}
function serve(options){
  const file=path.resolve(options.config || 'remote-server.json');const settings=core.readJson(file);
  if(!settings.remote || typeof settings.token!=='string' || settings.token.length<32)throw new Error('Use a remote server configuration created by server-init.');
  const server=createProxy(settings,event=>fs.appendFileSync(path.join(path.dirname(file),'remote-proxy.log'),new Date().toISOString()+' '+event+'\n',{mode:0o600}));
  server.on('error',error=>{console.error(error.message);process.exitCode=1;});
  server.listen(settings.port,'127.0.0.1',()=>console.log('Server bridge listening on 127.0.0.1:'+settings.port+'. Expose it through your HTTPS reverse proxy. Ctrl+C stops it.'));
  return server;
}
async function connect(options){
  const p=core.paths();const stateFile=path.join(p.install,'state.json');
  if(fs.existsSync(stateFile) && core.readJson(stateFile).active)throw new Error('Restore the existing Desktop bridge configuration before connecting a remote bridge.');
  core.checkManaged();
  const gatewayUrl=remoteUrl(options.url || '');const token=process.env.CLAUDEBL_REMOTE_TOKEN;
  if(!token || token.length<32)throw new Error('Set CLAUDEBL_REMOTE_TOKEN to the credential from your remote server configuration.');
  const headers={authorization:'Bearer '+token};const h=await json(gatewayUrl+'/health',{headers});
  if(h.service!=='claude-desktop-ollama-proxy' || !h.model || !h.instance)throw new Error('Endpoint is not a compatible remote bridge.');
  const models=await json(gatewayUrl+'/v1/models',{headers});if(!models.data?.some(model=>model.id===core.ALIAS))throw new Error('Remote bridge does not advertise the expected model route.');
  const s={mode:'remote',gatewayUrl,url:h.upstream,model:h.model,instance:h.instance,token};
  core.applyConfiguration(p,s);
  try{core.writeJson(path.join(p.install,'settings.json'),s);}catch(error){core.restoreConfiguration(p);throw error;}
  console.log('Desktop now points to '+gatewayUrl+'. Fully quit and reopen Claude Desktop. No local proxy was started.');
}
module.exports={remoteUrl,serverInit,serve,connect};
