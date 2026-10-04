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
    for(const file of ['server.cjs','core.cjs'])fs.copyFileSync(path.join(__dirname,file),path.join(p.install,file));
    const s={url:'http://127.0.0.1:1',model:'mock',port,token:'test-secret',instance:'cli-test'};
    core.writeJson(path.join(p.install,'settings.json'),s);core.applyConfiguration(p,s);
    assert.match((await run('start')).stdout,/Proxy started/);
    assert.match((await run('start')).stdout,/already running/);
    assert.match((await run('status')).stdout,/Bridge reachable/);
    assert.match((await run('stop')).stdout,/Proxy stopped/);
    assert.match((await run('restore')).stdout,/configuration restored/);
    assert.equal(fs.existsSync(path.join(p.library,'_meta.json')),false);
  }finally{try{await run('stop');}catch{}fs.rmSync(dir,{recursive:true,force:true});}
});
