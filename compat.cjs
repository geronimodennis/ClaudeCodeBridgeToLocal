const {ALIAS}=require('./core.cjs');
class CompatibilityError extends Error{}
function adaptRequest(input,model,{countTokens=false}={}){
  if(!input || typeof input!=='object' || Array.isArray(input))throw new CompatibilityError('Expected a JSON request object.');
  const body=structuredClone(input);const notices=[];
  if(body.model!==ALIAS)throw new CompatibilityError('Choose the configured Ollama proxy model.');
  if(!Array.isArray(body.messages) || !body.messages.length)throw new CompatibilityError('messages must be a nonempty array.');
  if(!countTokens && (!Number.isInteger(body.max_tokens) || body.max_tokens<1))throw new CompatibilityError('max_tokens must be a positive integer.');
  if(body.stream!==undefined && typeof body.stream!=='boolean')throw new CompatibilityError('stream must be a boolean.');
  if(body.service_tier && body.service_tier!=='auto')throw new CompatibilityError('Priority service tiers are not implemented by Ollama.');
  delete body.service_tier;
  for(const key of ['context_management','container','mcp_servers'])if(body[key]!==undefined)throw new CompatibilityError(key+' is not implemented by this bridge; configure local function tools instead.');
  if(body.output_config?.format)throw new CompatibilityError('Anthropic structured output schemas are not implemented by this bridge.');
  function block(value){
    if(value.cache_control){delete value.cache_control;notices.push('Prompt cache directives removed: no Anthropic cache semantics are claimed.');}
    if(value.type==='document' || value.type==='server_tool_use' || value.type?.endsWith('_tool_result') && value.type!=='tool_result')throw new CompatibilityError('Unsupported hosted/document content block: '+value.type);
    if(value.type==='image' && value.source?.type!=='base64')throw new CompatibilityError('Ollama image compatibility requires a base64 image source.');
    if(Array.isArray(value.content))value.content.forEach(block);
  }
  if(Array.isArray(body.system))body.system.forEach(block);
  for(const message of body.messages){
    if(!['user','assistant'].includes(message.role))throw new CompatibilityError('Message role must be user or assistant; put system prompts in system.');
    if(typeof message.content!=='string' && !Array.isArray(message.content))throw new CompatibilityError('Message content must be a string or block array.');
    if(Array.isArray(message.content))message.content.forEach(block);
  }
  if(body.tools){
    if(!Array.isArray(body.tools))throw new CompatibilityError('tools must be an array.');
    for(const tool of body.tools){
      if(tool.type && tool.type!=='custom')throw new CompatibilityError('Hosted tool '+tool.type+' is unsupported; use a client-side function tool.');
      if(tool.defer_loading)throw new CompatibilityError('Deferred tool discovery is unsupported; send the full tool schema.');
      if(!tool.name || !tool.input_schema)throw new CompatibilityError('Function tools require name and input_schema.');
      delete tool.defer_loading;delete tool.type;block(tool);
    }
  }
  if(body.thinking?.type==='adaptive'){body.thinking={type:'enabled'};notices.push('Adaptive thinking mapped to enabled; Ollama does not provide identical adaptive semantics.');}
  body.model=model;
  return {body,notices:[...new Set(notices)]};
}
function adaptResponse(value){
  if(value.type==='message')value.model=ALIAS;
  if(value.message?.type==='message')value.message=adaptResponse(value.message);
  if(value.usage){value.usage.cache_creation_input_tokens ??= 0;value.usage.cache_read_input_tokens ??= 0;}
  return value;
}
function errorEnvelope(status,message){
  const type=status===400?'invalid_request_error':status===401?'authentication_error':status===403?'permission_error':status===404?'not_found_error':status===429?'rate_limit_error':status===529?'overloaded_error':'api_error';
  return {type:'error',error:{type,message}};
}
module.exports={CompatibilityError,adaptRequest,adaptResponse,errorEnvelope};
