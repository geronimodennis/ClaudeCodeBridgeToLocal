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
module.exports={heading,step,hint,summary,clean,paint};
