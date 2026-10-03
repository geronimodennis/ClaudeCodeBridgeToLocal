const fs=require('node:fs');
const path=require('node:path');
const {spawn,execFileSync}=require('node:child_process');
function launchPlan({platform=process.platform,env=process.env,app,exists=fs.existsSync,query=execFileSync}={}){
  if(app){if(!exists(app))throw new Error('Desktop executable does not exist: '+app);return {file:path.resolve(app),args:[]};}
  if(platform==='darwin')return {file:'/usr/bin/open',args:['-a','Claude']};
  if(platform==='linux')return {file:'claude-desktop',args:[]};
  if(platform!=='win32')throw new Error('Unsupported platform. Use open --app PATH.');
  // Discover Store/MSIX Desktop without accidentally starting the Claude Code CLI.
  try{
    const script="Get-StartApps | Where-Object { $_.Name -match '^Claude' -and $_.AppID -match '(Claude_|AnthropicPBC\\.Claude_)' } | Select-Object -First 1 -ExpandProperty AppID";
    const id=query('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',windowsHide:true,timeout:15000}).trim();
    if(id && /^[A-Za-z0-9_.!\-]+$/.test(id))return {file:'explorer.exe',args:['shell:AppsFolder\\'+id]};
  }catch{}
  const candidates=[
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA,'AnthropicClaude','claude.exe'),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA,'Programs','Claude','Claude.exe'),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA,'Claude','Claude.exe'),
    env.ProgramFiles && path.join(env.ProgramFiles,'Claude','claude-desktop.exe'),
    env.ProgramFiles && path.join(env.ProgramFiles,'Claude','Claude.exe')
  ].filter(Boolean);
  const file=candidates.find(exists);
  if(file)return {file,args:[]};
  throw new Error('Claude Desktop was not found. Install it or use claudebl open --app "C:\\path\\claude-desktop.exe".');
}
async function openDesktop(options={}){
  const plan=launchPlan(options);
  await new Promise((resolve,reject)=>{
    const child=spawn(plan.file,plan.args,{detached:true,stdio:'ignore',windowsHide:false});
    child.once('error',error=>reject(new Error('Could not open Claude Desktop: '+error.message+' Use --app PATH for a custom installation.')));
    child.once('spawn',()=>{child.unref();resolve();});
  });
  console.log('Claude Desktop launch requested.');
}
module.exports={launchPlan,openDesktop};
