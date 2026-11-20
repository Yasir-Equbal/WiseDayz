'use strict';
const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {createServer}=require('../server');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'daywise-cookie-'));const server=createServer({dataFile:path.join(dir,'db.json')});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;const origin='http://localhost:8000';
 const call=async(route,method='GET',body=null,cookie='',csrf='')=>{const r=await fetch(base+route,{method,headers:{origin,...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{}),...(csrf?{'x-csrf-token':csrf}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),setCookie:r.headers.get('set-cookie')||''}};
 try{
  const reg=await call('/api/auth/register','POST',{name:'Cookie User',email:'cookie@example.com',password:'long enough password'});assert.equal(reg.status,201);assert.match(reg.setCookie,/daywise_session=.*HttpOnly/);assert.match(reg.setCookie,/daywise_csrf=/);
  const session=decodeURIComponent(reg.setCookie.match(/daywise_session=([^;,]+)/)[1]);const csrf=decodeURIComponent(reg.setCookie.match(/daywise_csrf=([^;,]+)/)[1]);const cookie=`daywise_session=${session}; daywise_csrf=${csrf}`;
  assert.equal((await call('/api/me','GET',null,cookie)).status,200);
  assert.equal((await call('/api/workspace','PUT',{expectedVersion:1,data:{tasks:[]}},cookie)).status,403);
  assert.equal((await call('/api/workspace','PUT',{expectedVersion:1,data:{tasks:[]}},cookie,csrf)).status,200);
  const badOrigin=await fetch(base+'/api/auth/logout',{method:'POST',headers:{origin:'https://attacker.example',cookie,'content-type':'application/json','x-csrf-token':csrf},body:'{}'});assert.equal(badOrigin.status,403);
  assert.equal((await call('/api/auth/logout','POST',{},cookie,csrf)).status,200);
  assert.equal((await call('/api/me','GET',null,cookie)).status,401);
  console.log('Cookie security tests: 7 checks passed');
 }finally{server.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1)});
