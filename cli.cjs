#!/usr/bin/env node
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const net=require('node:net');
const readline=require('node:readline/promises');
const {Writable}=require('node:stream');
const {spawn}=require('node:child_process');
const core=require('./core.cjs');
const ui=require('./ui.cjs');
const {openDesktop}=require('./desktop.cjs');
const remote=require('./remote.cjs');
const p=core.paths();
const settingsFile=path.join(p.install,'settings.json');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(url,options={},timeout=10000){const response=await fetch(url,{...options,signal:AbortSignal.timeout(timeout)});if(!response.ok)throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0,200)}`);return response.json();}
function settings(){if(!fs.existsSync(settingsFile))throw new Error('Run setup first.');return core.readJson(settingsFile);}
async function health(s){return request((s.gatewayUrl || `http://127.0.0.1:${s.port}`)+'/health',{headers:{authorization:`Bearer ${s.token}`}},5000);}
async function start(){
  const s=settings();
  if(s.mode==='remote'){await health(s);console.log('Remote bridge is reachable; manage its process on the server.');return;}
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
  const s=settings();if(s.mode==='remote'){console.log('Remote bridge remains running; manage it on the server.');return;}let h;
  try{h=await health(s);}catch{console.log('Proxy is not responding; no process was killed.');return;}
  if(h.instance!==s.instance || h.service!=='claude-desktop-ollama-proxy')throw new Error('Another service is on this port; it will not be stopped.');
  await request(`http://127.0.0.1:${s.port}/__shutdown`,{method:'POST',headers:{authorization:`Bearer ${s.token}`}},3000);
  console.log('Proxy stopped. Desktop routing is still saved; use restore to undo it.');
}
async function availablePort(port){await new Promise((resolve,reject)=>{const server=net.createServer();server.on('error',()=>reject(new Error(`Port ${port} is occupied. Stop the existing proxy or choose --port 11436.`)));server.listen(port,'127.0.0.1',()=>server.close(resolve));});}
async function doctor(){
  const s=settings();
  if(s.mode!=='remote'){
  const tags=await request(s.url+'/api/tags');
  if(!tags.models?.some(model=>model.name===s.model || model.model===s.model))throw new Error('Selected model is missing from Ollama.');
  console.log('Ollama is reachable; selected model exists.');
  }
  const h=await health(s);if(h.instance!==s.instance)throw new Error('Proxy instance does not match.');
  const response=await request((s.gatewayUrl || `http://127.0.0.1:${s.port}`)+'/v1/messages',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${s.token}`},body:JSON.stringify({model:core.ALIAS,max_tokens:32,thinking:{type:'disabled'},messages:[{role:'user',content:'Reply with OK.'}]})},30000);
  if(!Array.isArray(response.content))throw new Error('Provider returned an unexpected Messages response.');
  console.log('Messages API test passed: '+response.content.filter(block=>block.type==='text').map(block=>block.text).join(''));
  console.log('This verifies the bridge, not full Claude Desktop feature compatibility.');
}
function args(argv){
  const options={};let command=argv[0] && !argv[0].startsWith('--') ? argv.shift() : 'setup';
  const known=new Set(['provider','location','url','model','port','app','config']);
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
    ui.heading();
    ui.hint('Experimental compatibility bridge · automatic startup is off');
    ui.step(1,'Choose a provider');
    const provider=options.provider || await ask('  Provider','ollama');
    if(provider.toLowerCase()!=='ollama')throw new Error('Version 1 supports Ollama only.');
    ui.step(2,'Where is your model server?');
    console.log('  1  This computer     Ollama runs on this device');
    console.log('  2  Remote / LAN      Use the bridge hosted on your Ollama server');
    let location=options.location || await ask('  Select location','1');
    location=({'1':'local','2':'lan'}[location] || location).toLowerCase();
    if(!['local','lan'].includes(location))throw new Error('Location must be local or lan.');
    if(location==='lan'){
      ui.step(3,'Remote bridge connection');
      ui.hint('The bridge must be running on the remote server behind HTTPS.');
      ui.hint('Use its HTTPS address, not the Ollama HTTP API port.');
      const gatewayUrl=remote.remoteUrl(options.url || await ask('  Remote bridge URL (https://bridge.example.com)'));
      ui.step(4,'Authenticate');
      let credential=process.env.CLAUDEBL_REMOTE_TOKEN;
      if(!credential){
        if(!process.stdin.isTTY)throw new Error('Set CLAUDEBL_REMOTE_TOKEN to the remote bridge credential.');
        rl?.close();rl=undefined;
        process.stdout.write('  Remote bridge credential (hidden): ');
        const hidden=new Writable({write(chunk,encoding,callback){callback();}});
        hidden.isTTY=true;hidden.columns=process.stdout.columns || 80;
        const secretInput=readline.createInterface({input:process.stdin,output:hidden,terminal:true});
        try{credential=await secretInput.question('');}finally{secretInput.close();process.stdout.write('\n');}
      }
      ui.step(5,'Review and connect');
      ui.summary([['Bridge location','Remote server'],['Desktop endpoint',gatewayUrl],['Local proxy','Not started']]);
      if(!options.yes && !/^y(es)?$/i.test(await ask('  Save remote Desktop routing? y/n','n'))){console.log('Cancelled. No configuration changed.');return;}
      await remote.connect({url:gatewayUrl,credential});
      if(options.test)await doctor();
      return;
    }
    const input=options.url || (location==='local'?'http://127.0.0.1:11434':await ask('Ollama LAN server URL (example http://ollama-server.local:11434)'));
    const url=core.normalizeUrl(input);
    ui.step(3,'Select a model');
    ui.hint('Connecting to '+ui.clean(url)+' ...');
    const tags=await request(url+'/api/tags');
    const models=tags.models || [];
    if(!models.length)throw new Error('No models found. Pull a model in Ollama, then rerun setup.');
    models.forEach((model,i)=>console.log(`${String(i+1).padStart(3)}  ${ui.clean(model.name)}${model.remote_host?' (Ollama cloud-backed)':''}${model.capabilities && !model.capabilities.includes('tools')?' (no tool capability reported)':''}`));
    const choice=options.model || await ask('  Model number or name','1');
    const selected=/^\d+$/.test(choice) ? models[Number(choice)-1] : models.find(model=>model.name===choice || model.model===choice);
    if(!selected)throw new Error('Selected model is not in this Ollama server.');
    if(selected.capabilities && !selected.capabilities.includes('tools'))console.log('This model may not handle Code/Cowork tool calls.');
    ui.step(4,'Local connection');
    ui.hint('The proxy listens only on this computer. Press Enter for the default.');
    const port=Number(options.port || await ask('Local proxy port','11435'));
    if(!Number.isInteger(port) || port<1024 || port>65535)throw new Error('Port must be an integer from 1024 to 65535.');
    await availablePort(port);
    ui.step(5,'Review and connect');
    ui.summary([['Provider',url],['Model',selected.name],['Proxy','http://127.0.0.1:'+port],['Automatic startup','Off'],['Desktop library',p.library],['Backups',path.join(p.install,'backups')]]);
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
  if(options.version || command==='version'){console.log('ClaudeCodeBridgeToLocal '+require('./package.json').version);return;}
  if(options.help || command==='help'){console.log('Commands: setup, start, open, stop, status, doctor, restore, version, server-init, serve, connect\nRemote: server-init --url OLLAMA-URL --model MODEL; serve --config FILE; connect --url HTTPS-BRIDGE\nOpen: claudebl open [--app PATH]\nSetup flags: --provider ollama --location local|lan --url URL --model MODEL --port PORT --yes --test\nExample: claudebl setup --provider ollama --location lan --url https://bridge.example.com --yes');return;}
  switch(command){
    case 'server-init':await remote.serverInit(options);break;
    case 'serve':remote.serve(options);break;
    case 'connect':await remote.connect(options);break;
    case 'setup':await setup(options);break;
    case 'start':await start();break;
    case 'open':await openDesktop({app:options.app});break;
    case 'stop':await stop();break;
    case 'doctor':await doctor();break;
    case 'status':{
      if(!fs.existsSync(settingsFile)){console.log('Not installed by this wizard.');break;}
      const s=settings();const stateFile=path.join(p.install,'state.json');const active=fs.existsSync(stateFile) && core.readJson(stateFile).active;
      let running=false;try{running=(await health(s)).instance===s.instance;}catch{}
      const remoteHosted=s.mode==='remote';
      const localBridge=remoteHosted ? 'Not used (bridge hosted on remote server)' : `http://127.0.0.1:${s.port}`;
      const desktopEndpoint=s.gatewayUrl || localBridge;
      ui.status({running,active,remoteHosted,ollamaUrl:s.url,localBridge,gatewayUrl:desktopEndpoint,model:s.model,logs:remoteHosted?'On remote server':path.join(p.install,'proxy.log')});break;
    }
    case 'restore':await stop();console.log(core.restoreConfiguration(p)?'Previous Desktop configuration restored. Fully quit and reopen Desktop.':'No active wizard configuration to restore.');break;
    default:throw new Error('Unknown command. Run claudebl help.');
  }
}
if(require.main===module)main().catch(error=>{console.error('Error: '+error.message);process.exitCode=1;});
module.exports={args};
