'use strict';
// Daywise API. JSON adapter is for local development/tests; DATABASE_URL selects PostgreSQL.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function loadEnvFile(file=path.join(__dirname,'.env')){
 try{for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){const m=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);if(!m||m[1] in process.env)continue;let value=m[2];if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);process.env[m[1]]=value}}
 catch(e){if(e.code!=='ENOENT')throw e}
}
loadEnvFile();
const PORT = Number(process.env.PORT || 8787);
const DATA_FILE = path.resolve(process.env.DAYWISE_DATA_FILE || path.join(__dirname, 'data', 'daywise-db.json'));
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000, MAX_BODY = 2 * 1024 * 1024;
const ALLOWED_ORIGIN = process.env.DAYWISE_ALLOWED_ORIGIN || 'http://localhost:8000';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const scrypt = (password, salt) => new Promise((resolve,reject)=>crypto.scrypt(password,salt,64,(e,key)=>e?reject(e):resolve(key.toString('hex'))));
const safeEqual = (a,b) => {const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y)};
const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
function emptyDb(){return {users:[],sessions:[],workspaces:{}}}
function readDb(file=DATA_FILE){try{const p=JSON.parse(fs.readFileSync(file,'utf8'));return {...emptyDb(),...p,users:p.users||[],sessions:p.sessions||[],workspaces:p.workspaces||{}}}catch(e){if(e.code==='ENOENT')return emptyDb();throw e}}
function writeDb(db,file=DATA_FILE){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(db,null,2),{mode:0o600});fs.renameSync(tmp,file)}
class JsonStore {
 constructor(file){this.file=file;this.db=readDb(file)} persist(){writeDb(this.db,this.file)}
 async userByEmail(email){return this.db.users.find(u=>u.email===email)||null}
 async userById(id){return this.db.users.find(u=>u.id===id)||null}
 async createUser(u){if(this.db.users.some(x=>x.email===u.email)){const e=new Error('duplicate');e.code='DUPLICATE_EMAIL';throw e}this.db.users.push(u);this.db.workspaces[u.id]={version:1,data:null,updatedAt:u.createdAt};this.persist()}
 async createSession(s){this.db.sessions=this.db.sessions.filter(x=>x.expiresAt>Date.now());this.db.sessions.push(s);this.persist()}
 async userForToken(hash,now){const s=this.db.sessions.find(x=>x.tokenHash===hash&&x.expiresAt>now);return s?this.userById(s.userId):null}
 async revokeSession(hash){this.db.sessions=this.db.sessions.filter(x=>x.tokenHash!==hash);this.persist()}
 async cleanupSessions(now){this.db.sessions=this.db.sessions.filter(x=>x.expiresAt>now);this.persist()}
 async getWorkspace(id){return this.db.workspaces[id]||{version:0,data:null,updatedAt:null}}
 async saveWorkspace(id,expected,data,now){const current=await this.getWorkspace(id);if(current.version!==expected)return null;const next={version:current.version+1,data,updatedAt:now};this.db.workspaces[id]=next;this.persist();return next}
}
function publicUser(u){return {id:u.id,name:u.name,email:u.email,createdAt:u.createdAt}}
function json(res,status,body,extra={}){const data=JSON.stringify(body);res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(data),'cache-control':'no-store','x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer',...extra});res.end(data)}
function cookies(req){return Object.fromEntries(String(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),decodeURIComponent(x.slice(i+1))]}))}
function sessionCookies(token,csrf,expiresAt){const secure=process.env.NODE_ENV==='production'?'; Secure':'';const maxAge=Math.max(0,Math.floor((expiresAt-Date.now())/1000));return [`daywise_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`,`daywise_csrf=${encodeURIComponent(csrf)}; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`]}
const clearCookies=()=>['daywise_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0','daywise_csrf=; Path=/; SameSite=Lax; Max-Age=0'];
function readBody(req){return new Promise((resolve,reject)=>{let raw='',size=0;req.on('data',c=>{size+=c.length;if(size>MAX_BODY){reject(Object.assign(new Error('Request body too large'),{status:413}));req.destroy();return}raw+=c});req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{})}catch{reject(Object.assign(new Error('Invalid JSON'),{status:400}))}});req.on('error',reject)})}
function createServer({dataFile=DATA_FILE,clock=()=>Date.now(),store=null}={}){
 const repo=store||new JsonStore(dataFile),attempts=new Map();
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost'),origin=req.headers.origin;
  if(origin&&origin===ALLOWED_ORIGIN){res.setHeader('access-control-allow-origin',origin);res.setHeader('access-control-allow-credentials','true');res.setHeader('vary','Origin')}
  if(req.method==='OPTIONS'){if(origin&&origin!==ALLOWED_ORIGIN)return json(res,403,{error:'Origin not allowed.'});res.writeHead(204,{'access-control-allow-methods':'GET,POST,PUT,OPTIONS','access-control-allow-headers':'content-type,authorization,x-csrf-token'});return res.end()}
  if(url.pathname==='/api/health'&&req.method==='GET')return json(res,200,{ok:true,service:'daywise-api',database:process.env.DATABASE_URL?'postgresql':'json-development',time:new Date(clock()).toISOString()});
  try{
   const body=['POST','PUT'].includes(req.method)?await readBody(req):{};
   const jar=cookies(req);const bearer=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
   const token=()=>bearer||jar.daywise_session||'';
   const cookieAuth=()=>!bearer&&!!jar.daywise_session;
   const user=async()=>{const t=token();return t?repo.userForToken(hashToken(t),clock()):null};
   if(cookieAuth()&&['POST','PUT','PATCH','DELETE'].includes(req.method)){
    const csrf=String(req.headers['x-csrf-token']||'');
    if(!origin||origin!==ALLOWED_ORIGIN||!jar.daywise_csrf||!safeEqual(csrf,jar.daywise_csrf))return json(res,403,{error:'CSRF validation failed.'});
   }
   if(url.pathname==='/api/auth/register'&&req.method==='POST'){
    const name=String(body.name||'').trim(),email=String(body.email||'').trim().toLowerCase(),password=String(body.password||'');
    if(name.length<1||name.length>80||email.length>254||!EMAIL_RE.test(email)||password.length<10||password.length>200)return json(res,400,{error:'Enter a name, valid email, and password of 10–200 characters.'});
    const id=crypto.randomUUID(),salt=crypto.randomBytes(16).toString('hex'),passwordHash=await scrypt(password,salt),createdAt=clock();
    const u={id,name,email,salt,passwordHash,createdAt};try{await repo.createUser(u)}catch(e){if(e.code==='DUPLICATE_EMAIL'||e.code==='23505')return json(res,409,{error:'An account with this email already exists.'});throw e}
    const raw=crypto.randomBytes(32).toString('base64url'),csrf=crypto.randomBytes(24).toString('base64url'),expiresAt=clock()+SESSION_TTL;await repo.createSession({tokenHash:hashToken(raw),userId:id,expiresAt});return json(res,201,{user:publicUser(u),expiresAt},{'set-cookie':sessionCookies(raw,csrf,expiresAt)});
   }
   if(url.pathname==='/api/auth/login'&&req.method==='POST'){
    const email=String(body.email||'').trim().toLowerCase(),password=String(body.password||''),ip=req.socket.remoteAddress||'unknown',key=ip+'|'+email;
    const recent=(attempts.get(key)||[]).filter(t=>clock()-t<60000);if(recent.length>=8)return json(res,429,{error:'Too many login attempts. Try again in one minute.'});recent.push(clock());attempts.set(key,recent);
    const u=await repo.userByEmail(email);if(!u){await scrypt(password,crypto.randomBytes(16).toString('hex'));return json(res,401,{error:'Invalid email or password.'})}
    const candidate=await scrypt(password,u.salt);if(!safeEqual(candidate,u.passwordHash))return json(res,401,{error:'Invalid email or password.'});
    await repo.cleanupSessions(clock());const raw=crypto.randomBytes(32).toString('base64url'),csrf=crypto.randomBytes(24).toString('base64url'),expiresAt=clock()+SESSION_TTL;await repo.createSession({tokenHash:hashToken(raw),userId:u.id,expiresAt});return json(res,200,{user:publicUser(u),expiresAt},{'set-cookie':sessionCookies(raw,csrf,expiresAt)});
   }
   if(url.pathname==='/api/auth/logout'&&req.method==='POST'){if(token())await repo.revokeSession(hashToken(token()));return json(res,200,{ok:true},{'set-cookie':clearCookies()})}
   const u=await user();if(!u)return json(res,401,{error:'Authentication required.'});
   if(url.pathname==='/api/me'&&req.method==='GET')return json(res,200,{user:publicUser(u)});
   if(url.pathname==='/api/workspace'&&req.method==='GET')return json(res,200,await repo.getWorkspace(u.id));
   if(url.pathname==='/api/workspace'&&req.method==='PUT'){
    if(!body.data||typeof body.data!=='object'||Array.isArray(body.data))return json(res,400,{error:'Workspace data must be a JSON object.'});
    const serialized=JSON.stringify(body.data);if(Buffer.byteLength(serialized)>MAX_BODY)return json(res,413,{error:'Workspace is too large.'});
    const expected=Number(body.expectedVersion);if(!Number.isInteger(expected)||expected<0)return json(res,400,{error:'A valid expectedVersion is required.'});
    const next=await repo.saveWorkspace(u.id,expected,body.data,clock());if(!next){const current=await repo.getWorkspace(u.id);return json(res,409,{error:'Workspace version conflict. Fetch the latest workspace before saving.',currentVersion:current.version})}return json(res,200,next);
   }
   return json(res,404,{error:'Route not found.'});
  }catch(err){if(!res.headersSent)json(res,err.status||500,{error:err.status?err.message:'Internal server error.'})}
 });return server;
}
async function main(){let store=null;if(process.env.DATABASE_URL){const {PostgresStore}=require('./postgres-store');store=await PostgresStore.connect(process.env.DATABASE_URL)}else console.warn('WARNING: Using JSON development storage. Set DATABASE_URL for PostgreSQL.');
 const server=createServer({store});server.listen(PORT,()=>console.log(`Daywise API listening on http://localhost:${PORT}`));
 const shutdown=async()=>{server.close(async()=>{if(store)await store.close();process.exit(0)})};process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
}
if(require.main===module)main().catch(e=>{console.error('API startup failed:',e.message);process.exit(1)});
module.exports={createServer,readDb,writeDb,JsonStore};
