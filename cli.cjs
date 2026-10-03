#!/usr/bin/env node
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const net=require('node:net');
const readline=require('node:readline/promises');
const {spawn}=require('node:child_process');
const core=require('./core.cjs');
const p=core.paths();
const settingsFile=path.join(p.install,'settings.json');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(url,options={},timeout=10000){const response=await fetch(url,{...options,signal:AbortSignal.timeout(timeout)});if(!response.ok)throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0,200)}`);return response.json();}
function settings(){if(!fs.existsSync(settingsFile))throw new Error('Run setup first.');return core.readJson(settingsFile);}
async function health(s){return request(`http://127.0.0.1:${s.port}/health`,{},2000);}
async function start(){
  const s=settings();
  try {const h=await health(s);if(h.instance!==s.instance || h.service!=='claude-desktop-ollama-proxy')throw new Error('Another service is using the proxy port.');console.log('Proxy is already running.');return;}
  catch(error){if(error.message==='Another service is using the proxy port.')throw error;}
  await availablePort(s.port);
  const child=spawn(process.execPath,[path.join(p.install,'server.cjs'),settingsFile],{detached:true,stdio:'ignore',windowsHide:true});
  let failure;child.on('error',error=>{failure=error;});child.unref();
  for(let i=0;i<40;i++){if(failure)throw failure;try{if((await health(s)).instance===s.instance){console.log(`Proxy started at http://127.0.0.1:${s.port}`);return;}}catch{}await wait(100);}
  throw new Error('Proxy did not start. See '+path.join(p.install,'proxy.log'));
}
async function stop(){
  if(!fs.existsSync(settingsFile)){console.log('No wizard installation found.');return;}
  const s=settings();let h;
  try{h=await health(s);}catch{console.log('Proxy is not responding; no process was killed.');return;}
  if(h.instance!==s.instance || h.service!=='claude-desktop-ollama-proxy')throw new Error('Another service is on this port; it will not be stopped.');
  await request(`http://127.0.0.1:${s.port}/__shutdown`,{method:'POST',headers:{authorization:`Bearer ${s.token}`}},3000);
  console.log('Proxy stopped. Desktop routing is still saved; use restore to undo it.');
}
async function availablePort(port){await new Promise((resolve,reject)=>{const server=net.createServer();server.on('error',()=>reject(new Error(`Port ${port} is occupied. Stop the existing proxy or choose --port 11436.`)));server.listen(port,'127.0.0.1',()=>server.close(resolve));});}
async function doctor(){
  const s=settings();
  const tags=await request(s.url+'/api/tags');
  if(!tags.models?.some(model=>model.name===s.model || model.model===s.model))throw new Error('Selected model is missing from Ollama.');
  console.log('Ollama is reachable; selected model exists.');
  const h=await health(s);if(h.instance!==s.instance)throw new Error('Proxy instance does not match.');
  const response=await request(`http://127.0.0.1:${s.port}/v1/messages`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${s.token}`},body:JSON.stringify({model:core.ALIAS,max_tokens:32,thinking:{type:'disabled'},messages:[{role:'user',content:'Reply with OK.'}]})},30000);
  if(!Array.isArray(response.content))throw new Error('Provider returned an unexpected Messages response.');
  console.log('Messages API test passed: '+response.content.filter(block=>block.type==='text').map(block=>block.text).join(''));
  console.log('This verifies the bridge, not full Claude Desktop feature compatibility.');
}
function args(argv){
  const options={};let command=argv[0] && !argv[0].startsWith('--') ? argv.shift() : 'setup';
  const known=new Set(['provider','location','url','model','port']);
  while(argv.length){const arg=argv.shift();if(['--yes','--test','--help','--version'].includes(arg)){options[arg.slice(2)]=true;continue;}if(!arg.startsWith('--') || !known.has(arg.slice(2)) || !argv.length)throw new Error('Unknown or incomplete option: '+arg);options[arg.slice(2)]=argv.shift();}
  return {command,options};
}
async function setup(options){
  const existing=path.join(p.install,'state.json');
  if(fs.existsSync(existing) && core.readJson(existing).active)throw new Error('Wizard setup is already active. Run restore first to reconfigure.');
  core.checkManaged();
  let rl;
  const ask=async(question,defaultValue)=>{
    if(!process.stdin.isTTY)throw new Error('Interactive setup needs a terminal. Supply --provider ollama --location local|lan --url URL --model MODEL --yes.');
    rl ||= readline.createInterface({input:process.stdin,output:process.stdout});
    return (await rl.question(question+(defaultValue?` [${defaultValue}]`:'')+': ')).trim() || defaultValue;
  };
  try {
    console.log('Claude Desktop → local proxy → Ollama\nExperimental bridge: the actual model remains Ollama, not Claude.');
    const provider=options.provider || await ask('Model provider (currently supported: ollama)','ollama');
    if(provider.toLowerCase()!=='ollama')throw new Error('Version 1 supports Ollama only.');
    let location=options.location || await ask('Where is Ollama? 1 = this computer, 2 = remote LAN','1');
    location=({'1':'local','2':'lan'}[location] || location).toLowerCase();
    if(!['local','lan'].includes(location))throw new Error('Location must be local or lan.');
    const input=options.url || (location==='local'?'http://127.0.0.1:11434':await ask('Ollama LAN server URL (example http://zf13-dg:11434)'));
    const url=core.normalizeUrl(input);
    if(location==='local' && !['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname))throw new Error('Choose LAN for a remote server address.');
    console.log('Checking '+url+' ...');
    const tags=await request(url+'/api/tags');
    const models=tags.models || [];
    if(!models.length)throw new Error('No models found. Pull a model in Ollama, then rerun setup.');
    models.forEach((model,i)=>console.log(`${i+1}. ${model.name}${model.remote_host?' (Ollama cloud-backed)':''}${model.capabilities && !model.capabilities.includes('tools')?' (no tool capability reported)':''}`));
    const choice=options.model || await ask('Choose a model number or exact model name','1');
    const selected=/^\d+$/.test(choice) ? models[Number(choice)-1] : models.find(model=>model.name===choice || model.model===choice);
    if(!selected)throw new Error('Selected model is not in this Ollama server.');
    if(selected.capabilities && !selected.capabilities.includes('tools'))console.log('This model may not handle Code/Cowork tool calls.');
    const port=Number(options.port || await ask('Local proxy port','11435'));
    if(!Number.isInteger(port) || port<1024 || port>65535)throw new Error('Port must be an integer from 1024 to 65535.');
    await availablePort(port);
    console.log(`\nProvider: ${url}\nActual model: ${selected.name}\nDesktop proxy: http://127.0.0.1:${port}\nDesktop library: ${p.library}\nAutostart: off\nBackups: ${path.join(p.install,'backups')}`);
    if(!options.yes && !/^y(es)?$/i.test(await ask('Save this configuration and start the proxy? y/n','n'))){console.log('Cancelled. No configuration changed.');return;}
    fs.mkdirSync(p.install,{recursive:true,mode:0o700});
    for(const name of ['server.cjs','core.cjs'])fs.copyFileSync(path.join(__dirname,name),path.join(p.install,name));
    const s={version:1,provider:'ollama',location,url,model:selected.name,port,token:crypto.randomBytes(32).toString('hex'),instance:crypto.randomUUID()};
    core.writeJson(settingsFile,s);
    core.applyConfiguration(p,s);
    try{await start();}catch(error){core.restoreConfiguration(p);throw new Error('Startup failed; Desktop settings rolled back. '+error.message);}
    console.log('Setup saved. Fully quit and reopen Claude Desktop. Choose “Ollama: '+s.model+' (proxy)”.');
    console.log('After reboot, run start again. Stop leaves Desktop routing saved; restore returns to the previous configuration.');
    const test=options.test || (!options.yes && /^y(es)?$/i.test(await ask('Test a short model response now (30-second limit)? y/n','n')));
    if(test){try{await doctor();}catch(error){console.log('Setup remains installed, but inference is unverified: '+error.message);console.log('A cold or busy model can take longer. Check Ollama and retry doctor.');}}
  } finally {rl?.close();}
}
async function main(){
  if(Number(process.versions.node.split('.')[0])<20)throw new Error('Node.js 20 or newer is required.');
  const {command,options}=args(process.argv.slice(2));
  if(options.version){console.log('ClaudeCodeBridgeToLocal '+require('./package.json').version);return;}
  if(options.help || command==='help'){console.log('Commands: setup, start, stop, status, doctor, restore\nSetup flags: --provider ollama --location local|lan --url URL --model MODEL --port PORT --yes --test\nExample: claudebl setup --provider ollama --location lan --url http://zf13-dg:11434 --model "qwn3.8-27B-MemMap-config:latest" --yes');return;}
  switch(command){
    case 'setup':await setup(options);break;
    case 'start':await start();break;
    case 'stop':await stop();break;
    case 'doctor':await doctor();break;
    case 'status':{
      if(!fs.existsSync(settingsFile)){console.log('Not installed by this wizard.');break;}
      const s=settings();const stateFile=path.join(p.install,'state.json');const active=fs.existsSync(stateFile) && core.readJson(stateFile).active;
      let running=false;try{running=(await health(s)).instance===s.instance;}catch{}
      console.log(`Proxy: ${running?'running':'stopped'}\nDesktop wizard configuration: ${active?'applied':'restored'}\nProvider: ${s.url}\nModel: ${s.model}\nAutomatic startup: off\nLogs: ${path.join(p.install,'proxy.log')}`);break;
    }
    case 'restore':await stop();console.log(core.restoreConfiguration(p)?'Previous Desktop configuration restored. Fully quit and reopen Desktop.':'No active wizard configuration to restore.');break;
    default:throw new Error('Unknown command. Run claudebl help.');
  }
}
if(require.main===module)main().catch(error=>{console.error('Error: '+error.message);process.exitCode=1;});
module.exports={args};
