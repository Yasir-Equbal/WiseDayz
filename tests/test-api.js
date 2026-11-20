'use strict';
const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {createServer}=require('../server');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'daywise-api-'));const server=createServer({dataFile:path.join(dir,'db.json')});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`,origin='http://localhost:8000';let cookie='',csrf='';
 const req=async(route,method='GET',body=null)=>{const res=await fetch(base+route,{method,headers:{origin,...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{}),...(csrf&&['POST','PUT'].includes(method)?{'x-csrf-token':csrf}:{})},body:body?JSON.stringify(body):undefined});let data={};try{data=await res.json()}catch{};const sc=res.headers.get('set-cookie')||'';if(sc){const s=sc.match(/daywise_session=([^;,]+)/),c=sc.match(/daywise_csrf=([^;,]+)/);if(s&&c){cookie=`daywise_session=${s[1]}; daywise_csrf=${c[1]}`;csrf=decodeURIComponent(c[1])}else if(sc.includes('Max-Age=0')){cookie='';csrf=''}}return {status:res.status,data,headers:res.headers}};
 try{
  const pre=await fetch(base+'/api/workspace',{method:'OPTIONS',headers:{origin,'access-control-request-method':'PUT','access-control-request-headers':'x-csrf-token,content-type'}});assert.equal(pre.status,204);assert.equal(pre.headers.get('access-control-allow-origin'),origin);assert.equal(pre.headers.get('access-control-allow-credentials'),'true');
  assert.equal((await req('/api/health')).data.ok,true);assert.equal((await req('/api/me')).status,401);
  const registered=await req('/api/auth/register','POST',{name:'Test User',email:'test@example.com',password:'correct horse battery'});assert.equal(registered.status,201);assert.ok(cookie.includes('daywise_session='));
  assert.equal((await req('/api/auth/register','POST',{name:'Duplicate',email:'test@example.com',password:'correct horse battery'})).status,409);
  assert.equal((await req('/api/me')).data.user.email,'test@example.com');const initial=await req('/api/workspace');assert.equal(initial.data.data,null);assert.equal(initial.data.version,1);
  const saved=await req('/api/workspace','PUT',{expectedVersion:1,data:{tasks:[{id:'t1',title:'Test'}]}});assert.equal(saved.status,200);assert.equal(saved.data.version,2);
  assert.equal((await req('/api/workspace','PUT',{expectedVersion:1,data:{tasks:[]}})).status,409);assert.equal((await req('/api/workspace')).data.data.tasks[0].title,'Test');
  assert.equal((await req('/api/auth/logout','POST',{})).status,200);assert.equal((await req('/api/me')).status,401);
  const bad=await req('/api/auth/login','POST',{email:'test@example.com',password:'wrong password'});assert.equal(bad.status,401);
  const login=await req('/api/auth/login','POST',{email:'test@example.com',password:'correct horse battery'});assert.equal(login.status,200);assert.ok(cookie.includes('daywise_session='));
  assert.equal((await req('/api/auth/logout','POST',{})).status,200);assert.equal((await req('/api/me')).status,401);
  console.log('API tests: 14 checks passed');
 }finally{server.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1)});
