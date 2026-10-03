const http=require('node:http');
const https=require('node:https');
const fs=require('node:fs');
const path=require('node:path');
const {Transform,pipeline}=require('node:stream');
const {StringDecoder}=require('node:string_decoder');
const {ALIAS,readJson}=require('./core.cjs');
function createProxy(settings, log=()=>{}) {
  const origin=new URL(settings.url);
  const transport=origin.protocol==='https:' ? https : http;
  const json=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
  function rename(value) { if(value.type==='message' && value.model) value.model=ALIAS; if(value.message?.model) value.message.model=ALIAS; return value; }
  function sseTransform() {
    const decoder=new StringDecoder('utf8'); let pending='';
    const line=s=>{if(s.startsWith('data: ')){try{return 'data: '+JSON.stringify(rename(JSON.parse(s.slice(6))));}catch{}}return s;};
    return new Transform({transform(chunk,encoding,cb){pending+=decoder.write(chunk);let end;while((end=pending.indexOf('\n'))>=0){this.push(line(pending.slice(0,end))+'\n');pending=pending.slice(end+1);}cb();},flush(cb){pending+=decoder.end();if(pending)this.push(line(pending));cb();}});
  }
  const server=http.createServer(async(req,res)=>{
    const route=new URL(req.url,'http://localhost').pathname;
    if(req.method==='GET' && route==='/health') return json(res,200,{service:'claude-desktop-ollama-proxy',instance:settings.instance,model:settings.model,upstream:settings.url});
    const authorized=req.headers.authorization===`Bearer ${settings.token}` || req.headers['x-api-key']===settings.token;
    if(!authorized) return json(res,401,{type:'error',error:{type:'authentication_error',message:'Proxy credential required.'}});
    if(req.method==='POST' && route==='/__shutdown'){json(res,200,{stopped:true});server.close();server.closeAllConnections();return;}
    if(req.method==='GET' && (route==='/v1/models' || route==='/v1/models/'+ALIAS)) {
      const model={id:ALIAS,type:'model',display_name:`Ollama: ${settings.model} (proxy)`,created_at:'2026-10-04T00:00:00Z'};
      return json(res,200,route.endsWith(ALIAS)?model:{data:[model],has_more:false,first_id:ALIAS,last_id:ALIAS});
    }
    if(req.method!=='POST' || !['/v1/messages','/v1/messages/count_tokens'].includes(route)) return json(res,404,{type:'error',error:{type:'not_found_error',message:'Endpoint not supported by this bridge.'}});
    try {
      let size=0;const chunks=[];
      for await(const chunk of req){size+=chunk.length;if(size>64*1024*1024)throw new Error('Request exceeds 64 MiB');chunks.push(chunk);}
      const body=JSON.parse(Buffer.concat(chunks).toString());
      if(body.model!==ALIAS) return json(res,400,{type:'error',error:{type:'invalid_request_error',message:'Choose the Ollama proxy model in Desktop.'}});
      body.model=settings.model;
      const bytes=Buffer.from(JSON.stringify(body));
      log(`${route} stream=${!!body.stream} tools=${body.tools?.length || 0}`);
      const upstream=transport.request(new URL(route,origin),{method:'POST',headers:{'content-type':'application/json','content-length':bytes.length,'anthropic-version':'2023-06-01','authorization':'Bearer ollama'}},response=>{
        log(`upstream status=${response.statusCode}`);
        const contentType=response.headers['content-type'] || 'application/json';
        if(contentType.includes('text/event-stream')){
          res.writeHead(response.statusCode,{'content-type':contentType,'cache-control':'no-cache'});
          pipeline(response,sseTransform(),res,error=>{if(error)log('Stream disconnected');});
        } else {
          const parts=[];let length=0;
          response.on('data',part=>{length+=part.length;if(length>64*1024*1024)response.destroy(new Error('Response too large'));else parts.push(part);});
          response.on('end',()=>{let data=Buffer.concat(parts);try{data=Buffer.from(JSON.stringify(rename(JSON.parse(data.toString()))));}catch{}res.writeHead(response.statusCode,{'content-type':contentType});res.end(data);});
          response.on('error',()=>{if(!res.headersSent)json(res,502,{type:'error',error:{type:'api_error',message:'Upstream response interrupted.'}});else res.destroy();});
        }
      });
      upstream.setTimeout(600000,()=>upstream.destroy(new Error('Ollama response timed out after ten minutes.')));
      upstream.on('error',error=>{log('Upstream connection failed');if(!res.headersSent)json(res,502,{type:'error',error:{type:'api_error',message:error.message}});else res.destroy();});
      res.on('close',()=>{if(!res.writableFinished)upstream.destroy();});upstream.end(bytes);
    } catch(error){if(!res.headersSent)json(res,400,{type:'error',error:{type:'invalid_request_error',message:error.message}});}
  });
  server.requestTimeout=600000;
  return server;
}
if(require.main===module){
  const settings=readJson(process.argv[2]);
  const log=event=>fs.appendFileSync(path.join(path.dirname(process.argv[2]),'proxy.log'),`${new Date().toISOString()} ${event}\n`,{mode:0o600});
  const server=createProxy(settings,log);
  server.on('error',error=>{log(error.message);process.exitCode=1;});
  server.listen(settings.port,'127.0.0.1',()=>log(`Listening on 127.0.0.1:${settings.port}`));
}
module.exports={createProxy};
