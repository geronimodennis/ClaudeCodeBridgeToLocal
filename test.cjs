const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const core=require('./core.cjs');
const {createProxy}=require('./server.cjs');
const {args}=require('./cli.cjs');
const {remoteUrl}=require('./remote.cjs');
const exec=promisify(execFile);
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
const close=server=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
test('remote bridge enforces HTTPS, protects health, and refuses network shutdown',async()=>{
  assert.equal(remoteUrl('https://bridge.example.com/'),'https://bridge.example.com');
  for(const url of ['http://bridge.example.com','https://user:secret@bridge.example.com','https://bridge.example.com/path'])assert.throws(()=>remoteUrl(url));
  const proxy=createProxy({remote:true,url:'http://127.0.0.1:1',model:'mock',instance:'remote-test',token:'test-token'});
  const port=await listen(proxy);const base=`http://127.0.0.1:${port}`;
  try{
    assert.equal((await fetch(base+'/health')).status,401);
    const headers={authorization:'Bearer test-token'};
    assert.equal((await fetch(base+'/health',{headers})).status,200);
    assert.equal((await fetch(base+'/__shutdown',{method:'POST',headers})).status,404);
    assert.equal((await fetch(base+'/health',{headers})).status,200);
  }finally{await close(proxy);}
});
test('platform paths and Ollama root URL validation',()=>{
  assert.equal(core.paths('win32','home',{LOCALAPPDATA:'local'}).library,path.join('local','Claude-3p','configLibrary'));
  assert.equal(core.paths('darwin','home',{}).library,path.join('home','Library','Application Support','Claude-3p','configLibrary'));
  assert.equal(core.paths('linux','home',{}).library,path.join('home','.config','Claude-3p','configLibrary'));
  assert.equal(core.paths('linux','home',{XDG_CONFIG_HOME:'xdg'}).library,path.join('xdg','Claude-3p','configLibrary'));
  assert.equal(core.normalizeUrl('ollama-server.local:11434/v1/'),'http://ollama-server.local:11434');
  for(const url of ['ftp://server','http://user:password@server','http://server?token=secret','http://server/api'])assert.throws(()=>core.normalizeUrl(url));
  assert.equal(args(['setup','--location','lan','--yes']).options.location,'lan');
  assert.throws(()=>args(['setup','--typo']));
});
test('backup restores exact prior bytes and leaves unrelated entries intact',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'desktop-proxy-test-'));
  try {
    const p={install:path.join(dir,'install'),library:path.join(dir,'library')};
    fs.mkdirSync(p.library);
    const old=Buffer.from('\uFEFF'+JSON.stringify({appliedId:'old',entries:[{id:'old',name:'Existing'}]}));
    fs.writeFileSync(path.join(p.library,'_meta.json'),old);
    const state=core.applyConfiguration(p,{port:11435,token:'test',model:'test-model'});
    assert.equal(core.readJson(path.join(p.library,'_meta.json')).entries.length,2);
    assert.deepEqual(fs.readFileSync(path.join(state.backup,'_meta.json')),old);
    assert.throws(()=>core.applyConfiguration(p,{port:11435,token:'test',model:'test-model'}));
    assert.equal(core.restoreConfiguration(p),true);
    assert.deepEqual(fs.readFileSync(path.join(p.library,'_meta.json')),old);
    assert.equal(fs.existsSync(path.join(p.library,state.id+'.json')),false);
    core.applyConfiguration(p,{port:11435,token:'test',model:'test-model'});
    fs.appendFileSync(path.join(p.library,'_meta.json'),' ');
    assert.throws(()=>core.restoreConfiguration(p),/changed since setup/);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('new-library restore removes only wizard-created files',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'desktop-proxy-test-'));
  try{const p={install:path.join(dir,'install'),library:path.join(dir,'library')};core.applyConfiguration(p,{port:11435,token:'test',model:'test-model'});fs.writeFileSync(path.join(p.library,'unrelated.txt'),'keep');core.restoreConfiguration(p);assert.deepEqual(fs.readdirSync(p.library),['unrelated.txt']);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('proxy authenticates, maps model IDs, preserves tools and streaming, and propagates errors',async()=>{
  let captured;
  const upstream=http.createServer(async(req,res)=>{
    let data='';for await(const chunk of req)data+=chunk;
    captured={body:JSON.parse(data),headers:req.headers};
    if(req.url.endsWith('count_tokens')){res.writeHead(404,{'content-type':'application/json'});res.end('{"error":"unsupported"}');return;}
    if(captured.body.stream){res.writeHead(200,{'content-type':'text/event-stream'});const data=Buffer.from('event: message_start\ndata: '+JSON.stringify({type:'message_start',message:{type:'message',model:'actual-model',content:[]}})+'\n\nevent: content_block_delta\ndata: '+JSON.stringify({type:'content_block_delta',delta:{type:'text_delta',text:'你好'}})+'\n\n');for(let i=0;i<data.length;i+=5)res.write(data.subarray(i,i+5));res.end();}
    else {res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({type:'message',model:'actual-model',content:[{type:'tool_use',name:'read_file',input:{path:'a.txt'}}]}));}
  });
  const upstreamPort=await listen(upstream);
  const proxy=createProxy({url:`http://127.0.0.1:${upstreamPort}`,model:'actual-model',token:'secret',instance:'test'});
  const port=await listen(proxy);
  const base=`http://127.0.0.1:${port}`;
  const headers={'content-type':'application/json',authorization:'Bearer secret'};
  try{
    assert.equal((await fetch(base+'/v1/models')).status,401);
    assert.equal((await (await fetch(base+'/v1/models',{headers})).json()).data[0].id,core.ALIAS);
    const body={model:core.ALIAS,max_tokens:20,messages:[{role:'user',content:'hello'}],tools:[{name:'read_file',input_schema:{type:'object'}}]};
    const response=await (await fetch(base+'/v1/messages',{method:'POST',headers,body:JSON.stringify(body)})).json();
    assert.equal(response.model,core.ALIAS);assert.equal(captured.body.model,'actual-model');assert.deepEqual(captured.body.tools,body.tools);assert.equal(captured.headers.authorization,'Bearer ollama');
    const stream=await (await fetch(base+'/v1/messages',{method:'POST',headers,body:JSON.stringify({...body,stream:true})})).text();
    assert.match(stream,/claude-sonnet-4-6/);assert.match(stream,/你好/);assert.doesNotMatch(stream,/actual-model/);
    assert.equal((await fetch(base+'/v1/messages/count_tokens',{method:'POST',headers,body:JSON.stringify(body)})).status,404);
    assert.equal((await fetch(base+'/v1/messages',{method:'POST',headers,body:'{bad'})).status,400);
    assert.equal((await fetch(base+'/v1/messages',{method:'POST',headers,body:JSON.stringify({...body,model:'other'})})).status,400);
  }finally{await close(proxy);await close(upstream);}
});
test('CLI starts and stops detached installed proxy and restores isolated Desktop state',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'desktop-proxy-cli-test-'));
  const env={...process.env,LOCALAPPDATA:dir,HOME:dir,USERPROFILE:dir,XDG_CONFIG_HOME:dir};
  const p=core.paths(process.platform,dir,env);
  const probe=http.createServer();const port=await listen(probe);await close(probe);
  const cli=path.join(__dirname,'cli.cjs');
  const run=command=>exec(process.execPath,[cli,command],{env,timeout:20000});
  try{
    fs.mkdirSync(p.install,{recursive:true});
    for(const file of ['server.cjs','core.cjs','compat.cjs'])fs.copyFileSync(path.join(__dirname,file),path.join(p.install,file));
    const s={url:'http://127.0.0.1:1',model:'mock',port,token:'test-secret',instance:'cli-test'};
    core.writeJson(path.join(p.install,'settings.json'),s);core.applyConfiguration(p,s);
    assert.match((await run('start')).stdout,/Proxy started/);
    assert.match((await run('start')).stdout,/already running/);
    assert.match((await run('status')).stdout,/Bridge reachable/);
    assert.match((await run('restart')).stdout,/Runtime backup:/);
    assert.equal(core.readJson(path.join(p.install,'settings.json')).token,s.token);
    assert.match((await run('stop')).stdout,/Proxy stopped/);
    assert.match((await run('restore')).stdout,/configuration restored/);
    assert.equal(fs.existsSync(path.join(p.library,'_meta.json')),false);
  }finally{try{await run('stop');}catch{}fs.rmSync(dir,{recursive:true,force:true});}
});
const {adaptRequest}=require('./compat.cjs');
test('compatibility adapts caching/thinking without mutating input and rejects unsupported semantics',()=>{
 const input={model:core.ALIAS,max_tokens:10,thinking:{type:'adaptive'},system:[{type:'text',text:'system',cache_control:{type:'ephemeral'}}],messages:[{role:'user',content:[{type:'tool_result',tool_use_id:'tool1',is_error:true,content:[{type:'text',text:'failed'}]}]}],tools:[{type:'custom',name:'read',input_schema:{type:'object'},defer_loading:false}]};
 const {body,notices}=adaptRequest(input,'actual');assert.equal(body.model,'actual');assert.equal(body.thinking.type,'enabled');assert.equal(notices.length,2);assert.equal(input.thinking.type,'adaptive');assert.ok(input.system[0].cache_control);assert.deepEqual(body.messages,input.messages);
 for(const extra of [{tools:[{type:'web_search_20250305'}]},{context_management:{}},{output_config:{format:{type:'json_schema'}}},{messages:[{role:'user',content:[{type:'image',source:{type:'url',url:'https://example.com/a.png'}}]}]}])assert.throws(()=>adaptRequest({...input,...extra},'actual'));
});
test('slow upstream gets streaming pings and a bounded error; cancellation releases request',async()=>{
 let cancelled;const cancellation=new Promise(resolve=>cancelled=resolve);
 const upstream=http.createServer((req,res)=>{req.resume();res.on('close',cancelled);});const up=await listen(upstream);
 const proxy=createProxy({url:`http://127.0.0.1:${up}`,model:'mock',token:'secret',upstreamTimeoutMs:150,pingIntervalMs:20});const port=await listen(proxy);
 const headers={'x-api-key':'secret','content-type':'application/json'};const body={model:core.ALIAS,max_tokens:10,messages:[{role:'user',content:'hello'}]};
 try{
 const response=await fetch(`http://127.0.0.1:${port}/v1/messages`,{method:'POST',headers,body:JSON.stringify({...body,stream:true})});assert.equal(response.headers.get('content-type'),'text/event-stream');assert.ok(response.headers.get('request-id'));
 const text=await response.text();assert.match(text,/event: ping/);assert.match(text,/event: error/);assert.match(text,/did not complete|became idle/);await cancellation;
 const stalled=await fetch(`http://127.0.0.1:${port}/v1/messages`,{method:'POST',headers,body:JSON.stringify(body)});assert.equal(stalled.status,504);assert.equal((await stalled.json()).error.type,'api_error');
 }finally{await close(proxy);await close(upstream);}
});
test('LAN setup accepts HTTP Ollama and installs a local bridge without remote credentials',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lan-setup-test-'));const env={...process.env,LOCALAPPDATA:dir,HOME:dir,USERPROFILE:dir,XDG_CONFIG_HOME:dir};delete env.CLAUDEBL_REMOTE_TOKEN;
 const upstream=http.createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({models:[{name:'mock-model'}]}));});const up=await listen(upstream);const probe=http.createServer();const port=await listen(probe);await close(probe);
 const cli=path.join(__dirname,'cli.cjs');const p=core.paths(process.platform,dir,env);
 try{const result=await exec(process.execPath,[cli,'setup','--provider','ollama','--location','lan','--url',`http://127.0.0.1:${up}`,'--model','mock-model','--port',String(port),'--yes'],{env,timeout:20000});assert.match(result.stdout,/Setup saved/);const s=core.readJson(path.join(p.install,'settings.json'));assert.equal(s.location,'lan');assert.equal(s.url,`http://127.0.0.1:${up}`);assert.notEqual(s.mode,'remote');assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status,200);}
 finally{try{await exec(process.execPath,[cli,'restore'],{env,timeout:10000});}catch{}await close(upstream);fs.rmSync(dir,{recursive:true,force:true});}
});
test('unlimited upstream waiting preserves delayed Ollama error status and body',async()=>{
 const error={type:'error',error:{type:'overloaded_error',message:'Original Ollama error',details:'preserved'}};
 const upstream=http.createServer((req,res)=>{req.resume();setTimeout(()=>{res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify(error));},180);});const up=await listen(upstream);
 const proxy=createProxy({url:`http://127.0.0.1:${up}`,model:'mock',token:'secret',upstreamTimeoutMs:0});const port=await listen(proxy);
 try{const response=await fetch(`http://127.0.0.1:${port}/v1/messages`,{method:'POST',headers:{'content-type':'application/json','x-api-key':'secret'},body:JSON.stringify({model:core.ALIAS,max_tokens:10,messages:[{role:'user',content:'test'}]})});assert.equal(response.status,503);assert.deepEqual(await response.json(),error);}finally{await close(proxy);await close(upstream);}
});
