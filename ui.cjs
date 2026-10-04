const color=process.stdout.isTTY && !process.env.NO_COLOR;
const paint=(code,text)=>color?`\x1b[${code}m${text}\x1b[0m`:text;
const clean=text=>String(text).replace(/[\x00-\x1f\x7f-\x9f]/g,'');
function heading(){
  console.log('\n'+paint('36;1','  CLAUDE BRIDGE TO LOCAL'));
  console.log('  Claude Desktop + Ollama');
  console.log(paint('90','  '+ '─'.repeat(Math.min(58,Math.max(20,(process.stdout.columns || 80)-6)))));
  console.log('  Connect a model on your computer or local network.\n');
}
function step(number,title){console.log('\n'+paint('36;1',`  ${number}/5  ${title}`));}
function hint(text){console.log(paint('90','  '+text));}
function summary(rows){console.log('\n'+paint('36;1','  Review your setup'));for(const [label,value] of rows)console.log('  '+paint('90',label.padEnd(18))+clean(value));console.log();}
function status({running,active,remoteHosted,ollamaUrl,localBridge,gatewayUrl,model,logs}){
  heading();
  console.log('  '+paint(running?'32;1':'33;1',running?'● Bridge reachable':'● Bridge unreachable')+'  '+paint('90',remoteHosted?'Hosted remotely':'Running on this computer'));
  console.log('  '+paint(active?'32':'90',active?'Desktop configuration applied':'Desktop configuration restored'));
  const section=(title,rows)=>{
    console.log('\n'+paint('36;1','  '+title));
    for(const [label,value] of rows){
      const text=clean(value ?? 'Not configured');
      const width=process.stdout.columns || 100;
      if(text.length+24>width){console.log('  '+paint('90',label));console.log('    '+text);}
      else console.log('  '+paint('90',label.padEnd(22))+text);
    }
  };
  section('CONNECTION',[['Ollama server',ollamaUrl],['Local bridge',localBridge],['Desktop gateway',gatewayUrl]]);
  section('MODEL & SETTINGS',[['Model',model],['Automatic startup',remoteHosted?'Managed on remote server':'Off — start again after reboot'],['Logs',logs]]);
  console.log('\n  '+paint('90',running?'Next: claudebl doctor  ·  claudebl open':remoteHosted?'Check the bridge on the remote server.':'Next: claudebl start'));
  console.log();
}
module.exports={heading,step,hint,summary,status,clean,paint};
