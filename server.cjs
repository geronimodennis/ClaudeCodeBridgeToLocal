const http=require('node:http');
const https=require('node:https');
const fs=require('node:fs');
const path=require('node:path');
const {Transform,pipeline}=require('node:stream');
const {StringDecoder}=require('node:string_decoder');
const {ALIAS,readJson}=require('./core.cjs');
const {adaptRequest,adaptResponse,errorEnvelope}=require('./compat.cjs');
const crypto=require('node:crypto');
function createProxy(settings, log=()=>{}) {
  const origin=new URL(settings.url);
  const transport=origin.protocol==='https:' ? https : http;
  const json=(res,status,body)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(body));};
  function rename(value) { return adaptResponse(value); }
  function sseTransform() {
    const decoder=new StringDecoder('utf8'); let pending='';
    const line=s=>{if(s.startsWith('data: ')){try{return 'data: '+JSON.stringify(rename(JSON.parse(s.slice(6))));}catch{}}return s;};
    return new Transform({transform(chunk,encoding,cb){pending+=decoder.write(chunk);let end;while((end=pending.indexOf('\n'))>=0){this.push(line(pending.slice(0,end))+'\n');pending=pending.slice(end+1);}cb();},flush(cb){pending+=decoder.end();if(pending)this.push(line(pending));cb();}});
  }
  const server=http.createServer(async(req,res)=>{
    const route=new URL(req.url,'http://localhost').pathname;
    if(req.method==='GET' && route==='/health' && !settings.remote) return json(res,200,{service:'claude-desktop-ollama-proxy',instance:settings.instance,model:settings.model,upstream:settings.url});
    const authorized=req.headers.authorization===`Bearer ${settings.token}` || req.headers['x-api-key']===settings.token;
    if(!authorized) return json(res,401,{type:'error',error:{type:'authentication_error',message:'Proxy credential required.'}});
    if(req.method==='GET' && route==='/health') return json(res,200,{service:'claude-desktop-ollama-proxy',instance:settings.instance,model:settings.model,upstream:settings.url});
    if(settings.remote && route==='/__shutdown') return json(res,404,{type:'error',error:{type:'not_found_error',message:'Manage this bridge on the server.'}});
    if(req.method==='POST' && route==='/__shutdown'){json(res,200,{stopped:true});server.close();server.closeAllConnections();return;}
    if(req.method==='GET' && (route==='/v1/models' || route==='/v1/models/'+ALIAS)) {
      const model={id:ALIAS,type:'model',display_name:`Ollama: ${settings.model} (proxy)`,created_at:'2026-10-04T00:00:00Z'};
      return json(res,200,route.endsWith(ALIAS)?model:{data:[model],has_more:false,first_id:ALIAS,last_id:ALIAS});
    }
    if(req.method!=='POST' || !['/v1/messages','/v1/messages/count_tokens'].includes(route)) return json(res,404,{type:'error',error:{type:'not_found_error',message:'Endpoint not supported by this bridge.'}});
    try {
      let size=0;const chunks=[];
      for await(const chunk of req){size+=chunk.length;if(size>64*1024*1024)throw new Error('Request exceeds 64 MiB');chunks.push(chunk);}
      const {body,notices}=adaptRequest(JSON.parse(Buffer.concat(chunks).toString()),settings.model,{countTokens:route.endsWith('count_tokens')});
      const requestId='req_'+crypto.randomUUID();const started=Date.now();res.setHeader('request-id',requestId);
      for(const notice of notices)log(requestId+' compatibility: '+notice);
      let pingTimer,deadline,clientCancelled=false;
      const fail=(status,message)=>{const value=errorEnvelope(status,message);if(!res.headersSent)json(res,status,value);else if(!res.writableEnded)res.end('event: error\ndata: '+JSON.stringify(value)+'\n\n');};
      if(body.stream){pingTimer=setInterval(()=>{if(res.writableEnded)return;if(!res.headersSent){res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','x-accel-buffering':'no'});res.flushHeaders();}res.write('event: ping\ndata: {"type":"ping"}\n\n');},settings.pingIntervalMs || 10000);pingTimer.unref();}
      res.once('close',()=>{clearInterval(pingTimer);clearTimeout(deadline);});
      const bytes=Buffer.from(JSON.stringify(body));
      log(`${requestId} ${route} stream=${!!body.stream} tools=${body.tools?.length || 0} messages=${body.messages.length} bytes=${bytes.length} max_tokens=${body.max_tokens} thinking=${body.thinking?.type || 'default'}`);
      res.once('finish',()=>log(`${requestId} completed elapsed_ms=${Date.now()-started}`));
      const upstream=transport.request(new URL(route,origin),{method:'POST',headers:{'content-type':'application/json','content-length':bytes.length,'anthropic-version':'2023-06-01','authorization':'Bearer ollama'}},response=>{
        log(`${requestId} upstream status=${response.statusCode} wait_ms=${Date.now()-started}`);
        const contentType=response.headers['content-type'] || 'application/json';
        if(contentType.includes('text/event-stream')){
          if(!res.headersSent)res.writeHead(response.statusCode,{'content-type':contentType,'cache-control':'no-cache','x-accel-buffering':'no'});
          response.once('data',()=>log(`${requestId} first_data_ms=${Date.now()-started}`));
          pipeline(response,sseTransform(),res,error=>{if(error)log(`${requestId} stream_disconnected elapsed_ms=${Date.now()-started} code=${error.code || 'unknown'}`);});
        } else {
          const parts=[];let length=0;
          response.on('data',part=>{length+=part.length;if(length>64*1024*1024)response.destroy(new Error('Response too large'));else parts.push(part);});
          response.on('end',()=>{
            let value;try{value=JSON.parse(Buffer.concat(parts).toString());}catch{if(response.statusCode>=400 && !res.headersSent){res.writeHead(response.statusCode,{'content-type':contentType});res.end(Buffer.concat(parts));}else fail(502,'Ollama returned a non-JSON response.');return;}
            if(response.statusCode>=400){if(!res.headersSent){res.writeHead(response.statusCode,{'content-type':contentType});res.end(Buffer.concat(parts));}else if(!res.writableEnded){res.end('event: error\ndata: '+JSON.stringify(value)+'\n\n');}return;}
            if(body.stream){fail(502,'Ollama returned JSON instead of a streaming response.');return;}
            if(!res.headersSent)res.writeHead(response.statusCode,{'content-type':'application/json'});res.end(JSON.stringify(rename(value)));
          });
          response.on('error',()=>{if(!res.headersSent)json(res,502,{type:'error',error:{type:'api_error',message:'Upstream response interrupted.'}});else res.destroy();});
        }
      });
      const timeout=Number(settings.upstreamTimeoutMs ?? 0);
      if(Number.isFinite(timeout) && timeout>0){
      deadline=setTimeout(()=>upstream.destroy(Object.assign(new Error('Ollama did not complete within '+timeout/1000+' seconds. Check server load and model context size.'),{code:'ETIMEDOUT'})),timeout);deadline.unref();
      upstream.setTimeout(timeout,()=>upstream.destroy(Object.assign(new Error('Ollama connection became idle.'),{code:'ETIMEDOUT'})));
      }
      upstream.on('error',error=>{if(clientCancelled)return;log(`${requestId} error=${error.code || 'unknown'} elapsed_ms=${Date.now()-started} ${error.message}`);fail(error.code==='ETIMEDOUT'?504:502,error.message);});
      res.on('close',()=>{if(!res.writableFinished){clientCancelled=true;log(`${requestId} client_disconnected elapsed_ms=${Date.now()-started}; upstream cancelled`);upstream.destroy();}});upstream.end(bytes);
    } catch(error){if(!res.headersSent)json(res,400,{type:'error',error:{type:'invalid_request_error',message:error.message}});}
  });
  server.requestTimeout=0;
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
