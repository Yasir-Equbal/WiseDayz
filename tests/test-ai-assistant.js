'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createServer}=require('../server');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wisedayz-local-'));
 const server=createServer({dataFile:path.join(dir,'db.json')});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const base=`http://127.0.0.1:${server.address().port}`;
  const response=await fetch(base+'/api/assistant/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:'hello'})});
  assert.equal(response.status,401);
  const login=await fetch(base+'/api/assistant/chat');
  assert.equal(login.status,401);
  const source=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  assert.match(source,/function sendChat\(\)/);
  assert.doesNotMatch(source,/apiRequest\('\/api\/assistant\/chat'/);
  const backend=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
  assert.doesNotMatch(backend,/api\.openai\.com/);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'..','.env.example'),'utf8'),/OPENAI_API_KEY/);
  console.log('No-external-AI checks: 5 passed');
 }finally{server.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1)});
