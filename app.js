/* wisedayZ — local-first smart scheduler desktop edition. All data stays in this browser. */
const STORE='daywise.v1';
const API_BASE=localStorage.getItem('daywise.apiBase')||window.DAYWISE_API_BASE||'http://localhost:8787';
const AUTH_KEY='daywise.auth.v2', QUEUE_KEY='daywise.sync.queue.v1';
let authSession=(()=>{try{return JSON.parse(localStorage.getItem(AUTH_KEY))||null}catch{return null}})();
let cloudVersion=0, syncTimer=null, syncBusy=false, syncPending=false;
const $=(s,r=document)=>r.querySelector(s); const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const todayISO=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const addDays=(iso,n)=>{const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const fmtDate=(iso,opts={weekday:'short',month:'short',day:'numeric'})=>new Intl.DateTimeFormat(undefined,opts).format(new Date(iso+'T12:00:00'));
const fmtTime=t=>{if(!t)return '—';const [h,m]=t.split(':').map(Number);return new Date(2000,0,1,h,m).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})};
const mins=t=>{if(!t)return 0;const [h,m]=t.split(':').map(Number);return h*60+m};
const timeOf=n=>`${String(Math.floor(n/60)%24).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const uid=()=>Math.random().toString(36).slice(2,10);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const defaultState=()=>{
 const d=todayISO(), y=addDays(d,-1), tmr=addDays(d,1);
 const routines=[{id:'r-college',name:'College day',description:'A balanced weekday routine',days:[1,2,3,4,5],wake:'06:00',sleep:'22:30',active:true,color:'teal'},{id:'r-weekend',name:'Weekend reset',description:'Flexible learning and personal time',days:[0,6],wake:'07:00',sleep:'23:00',active:false,color:'blue'},{id:'r-exam',name:'Exam preparation',description:'Focused revision routine',days:[1,2,3,4,5,6],wake:'05:30',sleep:'22:00',active:false,color:'amber'}];
 const tasks=[
 {id:uid(),title:'Morning routine',date:d,start:'06:15',duration:30,remaining:30,priority:'medium',category:'Personal',status:'completed',fixed:false,routineId:'r-college',actual:30,createdAt:Date.now()-50000},
 {id:uid(),title:'SystemVerilog practice',date:d,start:'07:00',duration:90,remaining:90,priority:'high',category:'Study',status:'pending',fixed:false,routineId:'r-college',actual:0,createdAt:Date.now()-40000},
 {id:uid(),title:'College',date:d,start:'10:00',duration:300,remaining:300,priority:'high',category:'College',status:'pending',fixed:true,routineId:'r-college',actual:0,createdAt:Date.now()-30000},
 {id:uid(),title:'Revision and notes',date:d,start:'16:00',duration:60,remaining:60,priority:'medium',category:'Study',status:'pending',fixed:false,routineId:'r-college',actual:0,createdAt:Date.now()-20000},
 {id:uid(),title:'Workout',date:d,start:'18:00',duration:60,remaining:60,priority:'medium',category:'Fitness',status:'pending',fixed:false,routineId:'r-college',actual:0,createdAt:Date.now()-10000},
 {id:uid(),title:'Read a book',date:y,start:'20:00',duration:30,remaining:20,priority:'low',category:'Personal',status:'partial',fixed:false,routineId:'r-college',actual:10,createdAt:Date.now()-80000},
 {id:uid(),title:'Complete project documentation',date:tmr,start:'19:00',duration:60,remaining:60,priority:'high',category:'Project',status:'pending',fixed:false,routineId:'r-college',actual:0,createdAt:Date.now()}
 ];
 return {user:{name:'Yasir',email:'yasir@example.com',timezone:Intl.DateTimeFormat().resolvedOptions().timeZone},preferences:{wake:'06:00',sleep:'22:30',notifications:true,approval:true,quiet:true,theme:'light',defaultDuration:60,focusMinutes:25,breakMinutes:5,timerMinutes:15},routines,tasks,history:[],proposals:[],habits:[{id:uid(),name:'Read for 20 minutes',days:[1,2,3,4,5,6,0],done:[]},{id:uid(),name:'Daily revision',days:[1,2,3,4,5,6],done:[]},{id:uid(),name:'Exercise',days:[1,3,5,6],done:[]}],notifications:[],wakeRecords:{},focusSessions:[],activeRoutine:'r-college',onboarded:true};
};
let state;try{state=JSON.parse(localStorage.getItem(STORE))||defaultState()}catch{state=defaultState()}
// Lightweight schema migration keeps older v1/v2 browser data usable.
state.notifications ||= []; state.preferences ||= {}; state.preferences.notifications ??= true;
state.preferences.focusMinutes ??= 25;
state.preferences.breakMinutes ??= 5;
state.preferences.timerMinutes ??= 15;
// v5 schema migration: dependency and recurring-series metadata are optional in older backups.
state.tasks ||= []; state.routines ||= []; state.history ||= [];
state.tasks.forEach(t=>{t.dependsOn ||= null; t.seriesId ??= null; t.actual ??= 0; t.remaining ??= Math.max(0,(t.duration||0)-t.actual);});
state.schemaVersion=6;

function applyTheme(theme = state.preferences?.theme || 'light') {
 const dark = theme === 'dark';
 document.documentElement.dataset.theme = dark ? 'dark' : 'light';
 document.body?.classList.toggle('dark-mode', dark);
 const meta = document.querySelector('meta[name="theme-color"]');
 if (meta) meta.setAttribute('content', dark ? '#0b1220' : '#101b2d');
 const btn = $('#theme-toggle');
 if (btn) {
  btn.textContent = dark ? '☀' : '☾';
  btn.title = dark ? 'Switch to light mode' : 'Switch to night mode';
  btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to night mode');
 }
 if (!document.getElementById('wisedayz-dark-theme-style')) {
  const style = document.createElement('style');
  style.id = 'wisedayz-dark-theme-style';
  style.textContent = `
   body.dark-mode { background: #0b1220 !important; color: #e2e8f0 !important; }
   body.dark-mode .main-area, body.dark-mode .page-content { background: #0b1220 !important; color: #e2e8f0 !important; }
   body.dark-mode .topbar { background: #0f172a !important; border-bottom-color: #1e293b !important; color: #e2e8f0 !important; }
   body.dark-mode .card, body.dark-mode .stat-card, body.dark-mode .routine-card, body.dark-mode .focus-timer, body.dark-mode .modal, body.dark-mode .account-panel { background: #111c30 !important; border-color: #1e293b !important; color: #e2e8f0 !important; box-shadow: 0 10px 28px rgba(0,0,0,0.35) !important; }
   body.dark-mode .wake-card { background: linear-gradient(145deg, #13233c, #0f1a2e) !important; border-color: #243654 !important; color: #e2e8f0 !important; }
   body.dark-mode .callout { background: #132238 !important; border-color: #253a5a !important; color: #cbd5e1 !important; }
   body.dark-mode .today-chip, body.dark-mode .tag, body.dark-mode .icon-btn, body.dark-mode .mini-icon, body.dark-mode .btn:not(.btn-primary):not(.btn-danger):not(.btn-soft) { background: #18263e !important; border-color: #2a3d5c !important; color: #e2e8f0 !important; }
   body.dark-mode .btn-soft { background: rgba(88, 187, 168, 0.16) !important; color: #7ce0cc !important; border-color: rgba(88, 187, 168, 0.35) !important; }
   body.dark-mode .input, body.dark-mode .select, body.dark-mode .textarea { background: #0d1627 !important; border-color: #293b59 !important; color: #f1f5f9 !important; }
   body.dark-mode .task-table th { background: #152238 !important; color: #94a3b8 !important; border-bottom-color: #1e293b !important; }
   body.dark-mode .task-table td, body.dark-mode .schedule-row, body.dark-mode .routine-mini, body.dark-mode .habit-row, body.dark-mode .history-row, body.dark-mode .settings-row, body.dark-mode .proposal-item, body.dark-mode .prepare-task-row, body.dark-mode .modal-head, body.dark-mode .modal-foot { border-color: #1e293b !important; }
   body.dark-mode .history-row { background: transparent !important; color: #cbd5e1 !important; opacity: 0.78; transition: background 0.15s ease, opacity 0.15s ease; }
   body.dark-mode .history-row strong { color: #cbd5e1 !important; }
   body.dark-mode .history-row small, body.dark-mode .history-row time { color: #94a3b8 !important; }
   body.dark-mode .history-row.notification-unread { background: #162640 !important; border-color: #2b456e !important; border-left: 3px solid #58bba8 !important; opacity: 1 !important; }
   body.dark-mode .history-row.notification-unread strong { color: #f8fafc !important; }
   body.dark-mode .history-row.notification-unread small, body.dark-mode .history-row.notification-unread time { color: #cbd5e1 !important; }
   body.dark-mode .history-icon { background: #182944 !important; border-color: #2a3f63 !important; color: #7ce0cc !important; }
   body.dark-mode .history-row.notification-unread .history-icon { background: rgba(88, 187, 168, 0.18) !important; border-color: rgba(88, 187, 168, 0.4) !important; color: #7ce0cc !important; }
   body.dark-mode .day-column, body.dark-mode .calendar-day { background: #111c30 !important; border-color: #1e293b !important; color: #e2e8f0 !important; }
   body.dark-mode .day-task { background: #182742 !important; color: #e2e8f0 !important; }
   body.dark-mode .tool-tile { background: #16243b !important; border-color: #263957 !important; color: #e2e8f0 !important; }
   body.dark-mode .chat-ai { background: #16243b !important; color: #e2e8f0 !important; }
   body.dark-mode .muted, body.dark-mode .card-subtitle, body.dark-mode .task-meta, body.dark-mode .stat-foot, body.dark-mode .eyebrow, body.dark-mode .breadcrumbs span { color: #94a3b8 !important; }
   body.dark-mode .progress-track { background: #1e293b !important; }
   body.dark-mode .divider { background: #1e293b !important; }
  `;
  document.head.appendChild(style);
 }
}
function toggleTheme() {
 state.preferences.theme = state.preferences?.theme === 'dark' ? 'light' : 'dark';
 applyTheme(state.preferences.theme);
 save();
 const btn = $('#settings-theme-btn');
 if (btn) btn.textContent = state.preferences.theme === 'dark' ? '☀ Switch to light mode' : '☾ Switch to night mode';
 toast(state.preferences.theme === 'dark' ? 'Night mode enabled' : 'Light mode enabled');
}

function save(){localStorage.setItem(STORE,JSON.stringify(state));updateBadges();scheduleCloudSync()}
function log(type,task,detail=''){state.history.unshift({id:uid(),type,taskId:task?.id||null,title:task?.title||'Schedule',detail,at:Date.now()});save()}
function pushNotification(title,message,type='info',key=''){
 const dedupe=key||`${type}:${title}:${message}`;
 if(state.notifications.some(n=>n.dedupe===dedupe))return;
 const item={id:uid(),title,message,type,createdAt:Date.now(),read:false,dedupe};
 state.notifications.unshift(item);state.notifications=state.notifications.slice(0,200);save();
 if(state.preferences.notifications && 'Notification' in window && Notification.permission==='granted'){try{new Notification(title,{body:message,tag:dedupe})}catch{}}
}
function toast(msg,type=''){const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=msg;$('#toast-root').append(el);setTimeout(()=>el.remove(),2800)}
let updateCheckInProgress=false;
let latestUpdateInfo=null;
async function checkForAppUpdate(manual=false){
 const bridge=window.wisedayzUpdater;
 if(!bridge){if(manual)toast('Update checker is available only in the desktop app','error');return}
 if(updateCheckInProgress)return;
 updateCheckInProgress=true;
 const status=$('#update-status');
 if(status)status.textContent='Checking for updates…';
 try{
  const result=await bridge.checkForUpdates();
  latestUpdateInfo=result;
  if(status)status.textContent=result.updateAvailable?`Version ${result.latestVersion} is available`:`You are using the latest version (${result.currentVersion})`;
  const downloadButton=$('#download-update-button');
  if(downloadButton)downloadButton.hidden=!result.updateAvailable;
  if(result.updateAvailable){
   if(manual)toast(`wisedayZ ${result.latestVersion} is available`,'success');
   else toast(`Update available: wisedayZ ${result.latestVersion}`,'success');
  }else if(manual)toast('wisedayZ is up to date','success');
 }catch(error){
  if(status)status.textContent='Could not check for updates. Check your internet connection.';
  if(manual)toast(error.message||'Update check failed','error');
 }finally{updateCheckInProgress=false}
}
async function downloadAppUpdate(){
 const bridge=window.wisedayzUpdater;
 if(!bridge||!latestUpdateInfo?.updateAvailable){toast('Check for updates first','error');return}
 const buttonEl=$('#download-update-button');
 if(buttonEl){buttonEl.disabled=true;buttonEl.textContent='Downloading…'}
 const status=$('#update-status');
 if(status)status.textContent='Downloading installer…';
 try{
  const result=await bridge.downloadUpdate();
  if(status)status.textContent='Download complete. Opening installer…';
  toast('Installer downloaded. wisedayZ will close to start installation.','success');
  await bridge.installUpdate();
 }catch(error){
  if(status)status.textContent='Download failed. Please try again.';
  toast(error.message||'Update download failed','error');
  if(buttonEl){buttonEl.disabled=false;buttonEl.textContent='Download & install'}
 }
}

function setCloudStatus(label,kind=''){
 const el=$('#cloud-status');if(el){el.textContent=label;el.className=`cloud-status ${kind}`;el.title=label}
 const b=$('#account-button');if(b)b.textContent=authSession?'Account':'Sign in';
}
async function apiRequest(path,options={}){
 const headers={'content-type':'application/json',...(options.headers||{})};
 const csrf=document.cookie.split('; ').find(x=>x.startsWith('daywise_csrf='))?.split('=').slice(1).join('=');
 if(csrf&&['POST','PUT','PATCH','DELETE'].includes(options.method||'GET'))headers['x-csrf-token']=decodeURIComponent(csrf);
 const response=await fetch(`${API_BASE}${path}`,{...options,headers,credentials:'include'});
 let data={};try{data=await response.json()}catch{}
 if(!response.ok)throw Object.assign(new Error(data.error||`Request failed (${response.status})`),{status:response.status,data});
 return data;
}
function scheduleCloudSync(){
 if(!authSession)return;
 syncPending=true;localStorage.setItem(QUEUE_KEY,JSON.stringify({data:state,queuedAt:Date.now(),baseVersion:cloudVersion}));setCloudStatus('Sync queued','syncing');clearTimeout(syncTimer);syncTimer=setTimeout(flushCloudSync,900);
}
async function flushCloudSync(){
 if(!authSession||syncBusy||!syncPending)return;
 syncBusy=true;syncPending=false;setCloudStatus('Syncing…','syncing');
 try{
  const queued=JSON.parse(localStorage.getItem(QUEUE_KEY)||'null');const snapshot=queued?.data||state;
  const result=await apiRequest('/api/workspace',{method:'PUT',body:JSON.stringify({expectedVersion:cloudVersion,data:snapshot})});
  cloudVersion=result.version;localStorage.removeItem(QUEUE_KEY);setCloudStatus('Synced','online');
 }catch(err){
  if(err.status===409){setCloudStatus('Sync conflict','error');showSyncConflict();}
  else if(err.status===401){authSession=null;localStorage.removeItem(AUTH_KEY);setCloudStatus('Session expired','error');}
  else{syncPending=false;localStorage.setItem(QUEUE_KEY,JSON.stringify({data:state,queuedAt:Date.now(),baseVersion:cloudVersion}));setCloudStatus(navigator.onLine?'Sync failed — retry queued':'Offline — changes saved locally','error');}
 }finally{syncBusy=false;if(syncPending)setTimeout(flushCloudSync,300)}
}
function showAccount(){
 const root=$('#account-root');if(!root)return;
 if(authSession){root.innerHTML=`<div class="account-backdrop" data-action="close-account"><section class="account-panel" role="dialog" aria-modal="true"><h2>Cloud account</h2><p>Signed in as <strong>${esc(authSession.user?.email||'')}</strong>. Your workspace syncs securely when online. Offline edits are queued in this browser for retry.</p><div class="field"><label>API endpoint</label><input id="api-base-input" class="input" value="${esc(API_BASE)}" placeholder="http://localhost:8787"></div><div class="account-error" id="account-error"></div><div class="account-actions"><button class="btn" data-action="save-api-base">Save API endpoint</button><button class="btn" data-action="pull-cloud">Restore cloud workspace</button><button class="btn btn-danger" data-action="logout">Sign out</button><button class="btn" data-action="close-account">Close</button></div></section></div>`;
 }else{
 root.innerHTML=`<div class="account-backdrop" data-action="close-account"><section class="account-panel" role="dialog" aria-modal="true"><h2>Welcome to wisedayZ</h2><p>Sign in to sync your schedule across browsers using the development API. You can continue offline without an account.</p><div class="account-tabs"><button class="btn btn-primary" type="button" data-account-mode="login">Sign in</button><button class="btn" type="button" data-account-mode="register">Create account</button></div><form id="account-form" data-mode="login"><div class="field" id="account-name-wrap" hidden><label>Your name</label><input class="input" name="name" autocomplete="name" maxlength="80"></div><div class="field"><label>Email</label><input class="input" type="email" name="email" required autocomplete="email"></div><div class="field"><label>Password (minimum 10 characters)</label><input class="input" type="password" name="password" required minlength="10" autocomplete="current-password"></div><div class="account-error" id="account-error" role="alert"></div><div class="account-actions"><button class="btn btn-primary" id="account-submit" type="submit">Sign in</button><button class="btn" type="button" data-action="close-account">Continue offline</button></div></form></section></div>`;
 }
}
function showSyncConflict(){
 const root=$('#account-root');root.innerHTML=`<div class="account-backdrop"><section class="account-panel"><h2>Cloud sync conflict</h2><p>The cloud workspace changed after this browser last synced. wisedayZ paused automatic upload to avoid silently overwriting newer data.</p><div class="account-actions"><button class="btn btn-primary" data-action="pull-cloud">Load cloud version</button><button class="btn" data-action="keep-local">Keep this browser's version</button></div></section></div>`;
}
async function restoreCloudWorkspace(){
 try{setCloudStatus('Loading cloud…','syncing');const ws=await apiRequest('/api/workspace');cloudVersion=ws.version||0;
  if(ws.data){validateBackup(ws.data);state=migrateImportedState(ws.data);localStorage.setItem(STORE,JSON.stringify(state));applyTheme();updateBadges();render();}
  else{syncPending=true;await flushCloudSync();}localStorage.removeItem(QUEUE_KEY);
  $('#account-root').innerHTML='';setCloudStatus('Synced','online');toast(ws.data?'Cloud workspace loaded':'Workspace uploaded to cloud','success');
 }catch(err){setCloudStatus('Restore failed','error');const e=$('#account-error');if(e)e.textContent=err.message;else toast(err.message,'error')}
}
async function finishAuth(endpoint,body){
 const result=await apiRequest(endpoint,{method:'POST',headers:{},body:JSON.stringify(body)});
 authSession={user:result.user,expiresAt:result.expiresAt};localStorage.setItem(AUTH_KEY,JSON.stringify(authSession));
 const ws=await apiRequest('/api/workspace');cloudVersion=ws.version||0;const queued=JSON.parse(localStorage.getItem(QUEUE_KEY)||'null');
 if(queued){if(queued.baseVersion===cloudVersion){syncPending=true;await flushCloudSync()}else{showSyncConflict();setCloudStatus('Sync conflict','error')}}
 else if(ws.data){validateBackup(ws.data);state=migrateImportedState(ws.data);state.user={...(state.user||{}),name:result.user.name,email:result.user.email};localStorage.setItem(STORE,JSON.stringify(state));updateBadges();render();}
 else{state.user={...(state.user||{}),name:result.user.name,email:result.user.email};syncPending=true;await flushCloudSync();}
 if($('#account-root').innerHTML==='')setCloudStatus('Synced','online');toast(`Signed in as ${result.user.name}`,'success');
}
async function validateSavedSession(){
 try{const me=await apiRequest('/api/me');authSession={...(authSession||{}),user:me.user};localStorage.setItem(AUTH_KEY,JSON.stringify(authSession));const ws=await apiRequest('/api/workspace');cloudVersion=ws.version||0;const queued=JSON.parse(localStorage.getItem(QUEUE_KEY)||'null');if(queued){if(queued.baseVersion===cloudVersion){syncPending=true;flushCloudSync()}else{showSyncConflict();setCloudStatus('Sync conflict','error')}}else if(ws.data){validateBackup(ws.data);state=migrateImportedState(ws.data);localStorage.setItem(STORE,JSON.stringify(state));updateBadges();render()}setCloudStatus(queued&&queued.baseVersion!==cloudVersion?'Sync conflict':'Synced',queued&&queued.baseVersion!==cloudVersion?'error':'online')}
 catch{authSession=null;localStorage.removeItem(AUTH_KEY);setCloudStatus('Offline');}
}
window.addEventListener('online',()=>{if(localStorage.getItem(QUEUE_KEY)){syncPending=true;flushCloudSync()}else if(authSession)validateSavedSession()});
window.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&navigator.onLine&&localStorage.getItem(QUEUE_KEY)){syncPending=true;flushCloudSync()}});
function updateBadges(){$('#incomplete-count').textContent=state.tasks.filter(t=>['incomplete','partial'].includes(t.status)).length;$('#sidebar-name').textContent=state.user.name||'User';$('#top-date').textContent=fmtDate(todayISO(),{weekday:'short',month:'short',day:'numeric',year:'numeric'});const unread=state.notifications.filter(n=>!n.read).length;const dot=$('#notification-button i');if(dot)dot.style.display=unread?'block':'none';$('#notification-count')?.replaceChildren(document.createTextNode(String(unread)))}
const routes={home:'Overview',daily:'Today',weekly:'Weekly planner',monthly:'Monthly planner',routines:'My routines',tasks:'All tasks',incomplete:'Incomplete tasks',completed:'Completed tasks',assistant:'Planning helper',focus:'Focus studio',habits:'Habits',insights:'Insights',history:'Activity history',settings:'Settings',profile:'Profile',help:'Help & support',alarm:'Alarm & wake-up',report:'Daily report',notifications:'Notifications'};
let route=location.hash.slice(1)||'home';if(!routes[route])route='home';
function go(r){if(!routes[r])r='home';location.hash=r;}
window.addEventListener('hashchange',()=>{route=location.hash.slice(1)||'home';render()});
function activeTasks(date=todayISO()){return state.tasks.filter(t=>t.date===date&&!['completed','skipped'].includes(t.status)).sort((a,b)=>a.start.localeCompare(b.start))}
function taskById(id){return state.tasks.find(t=>t.id===id)}
function statusLabel(s){return ({pending:'Upcoming',progress:'In progress',completed:'Completed',incomplete:'Incomplete',partial:'Partially done',skipped:'Skipped'})[s]||s}
function statusClass(s){return `status-${s==='pending'?'pending':s==='progress'?'progress':s==='completed'?'completed':s==='partial'?'partial':s==='skipped'?'skipped':'incomplete'}`}
function badge(s){return `<span class="task-status ${statusClass(s)}">${statusLabel(s)}</span>`}
function heading(title,sub,actions=''){return `<div class="page-heading"><div><div class="eyebrow">DAYWISE WORKSPACE</div><h1>${title}</h1><p>${sub}</p></div><div class="heading-actions">${actions}</div></div>`}
function button(label,action,cls='btn',extra=''){return `<button class="${cls}" data-action="${action}" ${extra}>${label}</button>`}
function stat(label,value,foot,icon,color='green'){return `<div class="card stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon stat-${color}">${icon}</span></div><div class="stat-value">${value}</div><div class="stat-foot">${foot}</div></div>`}
function taskRow(t){return `<div class="schedule-row"><div class="schedule-time">${fmtTime(t.start)}</div><div class="timeline-dot"></div><div><div class="task-name">${esc(t.title)}</div><div class="task-meta">${t.duration} min · ${esc(t.category||'General')} · ${t.priority} priority</div></div><div>${badge(t.status)}</div></div>`}
function taskTable(tasks){if(!tasks.length)return `<div class="empty-state"><div class="empty-icon">☷</div><h3>Nothing here yet</h3><p>Tasks you create will appear here. Start with one small action.</p><button class="btn btn-primary" data-action="add-task">＋ Add a task</button></div>`;return `<div class="table-wrap"><table class="task-table"><thead><tr><th>TASK</th><th>DATE & TIME</th><th>DURATION</th><th>PRIORITY</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>${tasks.map(t=>`<tr><td><strong>${esc(t.title)}</strong><div class="task-meta">${esc(t.category||'General')} ${t.fixed?'· Fixed':''}</div></td><td>${fmtDate(t.date,{month:'short',day:'numeric'})}<div class="task-meta">${fmtTime(t.start)}</div></td><td>${t.remaining??t.duration} min ${t.actual?`<div class="task-meta">${t.actual} min done</div>`:''}</td><td><span class="priority priority-${t.priority}">${t.priority}</span></td><td>${badge(t.status)}</td><td><div class="table-actions"><button class="mini-icon" data-action="view-task" data-id="${t.id}" title="View">↗</button><button class="mini-icon" data-action="edit-task" data-id="${t.id}" title="Edit">✎</button></div></td></tr>`).join('')}</tbody></table></div>`}
function getRoutine(){return state.routines.find(r=>r.id===state.activeRoutine)||state.routines[0]}
function dashboard(){const d=todayISO(),all=state.tasks.filter(t=>t.date===d),done=all.filter(t=>t.status==='completed').length,pending=all.filter(t=>!['completed','skipped'].includes(t.status)).length,pct=all.length?Math.round(done/all.length*100):0,focus=state.focusSessions.filter(s=>s.date===d).reduce((a,s)=>a+s.minutes,0),next=activeTasks(d)[0],r=getRoutine(),wake=state.wakeRecords[d];return `${heading(`Good ${new Date().getHours()<12?'morning':new Date().getHours()<18?'afternoon':'evening'}, ${esc(state.user.name)}.`,`Here’s your day at a glance. Keep your focus on what matters.`,button('＋ Add task','add-task','btn btn-primary')+button('✧ Prepare schedule','prepare-schedule','btn btn-soft')+button('Review schedule','reschedule','btn'))}<div class="grid stats-grid">${stat('Tasks completed',`${done}/${all.length}`,`${pct}% of today’s plan`,'✓','green')}${stat('Still to do',pending,'Tasks remaining today','◷','blue')}${stat('Focus time',`${Math.floor(focus/60)}h ${focus%60}m`,'Tracked focus sessions','◎','amber')}${stat('Incomplete tasks',state.tasks.filter(t=>['incomplete','partial'].includes(t.status)).length,'Need a new time slot','↗','red')}</div><div class="grid dashboard-grid"><div class="grid"><div class="card card-pad"><div class="section-head"><div><div class="card-title">Today’s schedule</div><div class="card-subtitle">${fmtDate(d,{weekday:'long',month:'long',day:'numeric'})} · ${all.length} planned activities</div></div><a class="text-link" href="#daily">View full day →</a></div>${activeTasks(d).length?`<div class="schedule-list">${activeTasks(d).map(taskRow).join('')}</div>`:`<div class="empty-state"><div class="empty-icon">☀</div><h3>Your day is open</h3><p>Add a task or use Prepare Schedule to build your day.</p><button class="btn btn-primary" data-action="add-task">＋ Add a task</button></div>`}<div class="progress-wrap"><div class="progress-label"><span>Daily completion</span><strong>${pct}%</strong></div><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div></div></div><div class="wake-card"><div class="eyebrow">WAKE-UP CHECK-IN</div><h3>${wake?'You’re checked in':'Ready to start your day?'}</h3><p>${wake?`You confirmed waking up at ${fmtTime(wake.time)}. Your actual start time is saved.`:'Confirm when you are awake. wisedayZ will compare your actual start with your plan and prepare schedule suggestions.'}</p><div class="wake-time">${wake?fmtTime(wake.time):r?.wake||state.preferences.wake}</div>${wake?button('✓ Wake-up recorded','wake-info','btn btn-soft'):button('I am awake','wake-confirm','btn btn-primary')}</div><div class="card card-pad"><div class="section-head"><div><div class="card-title">Your routines</div><div class="card-subtitle">Choose the routine that fits today</div></div><a class="text-link" href="#routines">Manage →</a></div>${state.routines.map(r=>`<div class="routine-mini"><span class="routine-name"><i class="routine-dot" style="background:${r.id===state.activeRoutine?'#58bba8':'#aeb9c6'}"></i>${esc(r.name)}</span><span class="routine-days">${r.id===state.activeRoutine?'<b class="tag teal">Active</b>':`${r.days.length} days`}</span></div>`).join('')}</div></div><div class="grid"><div class="card card-pad"><div class="section-head"><div><div class="card-title">Focus tools</div><div class="card-subtitle">Give one task your full attention</div></div><a class="text-link" href="#focus">Open studio →</a></div><div class="quick-tools"><button class="tool-tile" data-action="focus-mode" data-mode="pomodoro"><span>◷</span><strong>Pomodoro</strong></button><button class="tool-tile" data-action="focus-mode" data-mode="stopwatch"><span>⏱</span><strong>Stopwatch</strong></button><button class="tool-tile" data-action="focus-mode" data-mode="timer"><span>⌛</span><strong>Timer</strong></button></div></div><div class="card card-pad"><div class="section-head"><div><div class="card-title">Needs your attention</div><div class="card-subtitle">Tasks waiting for a new plan</div></div><a class="text-link" href="#incomplete">See all →</a></div>${state.tasks.filter(t=>['incomplete','partial'].includes(t.status)).slice(0,3).map(t=>`<div class="routine-mini"><span class="routine-name">${esc(t.title)}</span>${badge(t.status)}</div>`).join('')||'<p class="small muted">No incomplete tasks. You are up to date.</p>'}</div><div class="callout"><strong>✧ wisedayZ tip</strong><br>Keep fixed commitments protected. Flexible tasks can move when your day changes — your plan should support your life, not compete with it.</div></div></div>`}
function daily(){const d=selectedDate;return `${heading('Daily schedule','Plan the day one block at a time.',button('✧ Prepare schedule','prepare-schedule','btn btn-soft')+button('✧ Suggest changes','reschedule','btn')+button('＋ Add task','add-task','btn btn-primary'))}<div class="toolbar"><button class="btn btn-small" data-action="date-prev">←</button><input class="input" style="width:155px" type="date" id="selected-date" value="${d}"><button class="btn btn-small" data-action="date-next">→</button><span class="tag teal">${fmtDate(d,{weekday:'long'})}</span></div><div class="card card-pad"><div class="section-head"><div><div class="card-title">${fmtDate(d,{month:'long',day:'numeric',year:'numeric'})}</div><div class="card-subtitle">${state.tasks.filter(t=>t.date===d).length} scheduled task occurrences</div></div>${button('Add task','add-task','btn btn-small btn-primary')}</div>${activeTasks(d).length?`<div class="schedule-list">${activeTasks(d).map(t=>`<div class="schedule-row"><div class="schedule-time">${fmtTime(t.start)}<small class="muted" style="display:block">${t.duration}m</small></div><div class="timeline-dot"></div><div><div class="task-name">${esc(t.title)}</div><div class="task-meta">${esc(t.category)} · ${t.fixed?'Fixed commitment':'Flexible'} · ${t.priority} priority</div><div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">${button('Open','view-task','btn btn-small','data-id="'+t.id+'"')}${t.status==='pending'?button('Start','start-task','btn btn-small btn-soft','data-id="'+t.id+'"'):''}${button('✓','complete-task','btn btn-small','data-id="'+t.id+'" title="Complete"')}</div></div><div>${badge(t.status)}</div></div>`).join('')}</div>`:'<div class="empty-state"><div class="empty-icon">◷</div><h3>No tasks scheduled</h3><p>This day is free. Add a task to start building your plan.</p><button class="btn btn-primary" data-action="add-task">＋ Add a task</button></div>'}</div>`}
let selectedDate=todayISO(),weekOffset=0,monthOffset=0;
function weekly(){const start=addDays(todayISO(),-((new Date().getDay()+6)%7)+weekOffset*7),days=Array.from({length:7},(_,i)=>addDays(start,i));return `${heading('Weekly planner','See your commitments across the week.',button('＋ Add task','add-task','btn btn-primary'))}<div class="toolbar"><button class="btn btn-small" data-action="week-prev">← Previous</button><span class="tag">${fmtDate(start,{month:'short',day:'numeric'})} — ${fmtDate(days[6],{month:'short',day:'numeric',year:'numeric'})}</span><button class="btn btn-small" data-action="week-next">Next →</button><button class="btn btn-small" data-action="week-now">This week</button></div><div class="week-grid">${days.map(d=>`<div class="day-column ${d===todayISO()?'today':''}"><div class="day-head"><small>${fmtDate(d,{weekday:'short'})}</small><strong>${new Date(d+'T12:00:00').getDate()}</strong></div>${state.tasks.filter(t=>t.date===d).sort((a,b)=>a.start.localeCompare(b.start)).map(t=>`<div class="day-task ${t.priority==='high'?'high':''} ${t.status==='completed'?'done':''}" data-action="view-task" data-id="${t.id}"><b>${fmtTime(t.start)}</b><br>${esc(t.title)}</div>`).join('')}${button('+ Add','add-task','btn btn-small btn-block','data-date="'+d+'"')}</div>`).join('')}</div><div class="callout" style="margin-top:15px">Tip: Select any task to view or edit it. Use routines to create different patterns for college days, weekends and exam periods.</div>`}
function monthly(){const base=new Date();base.setDate(1);base.setMonth(base.getMonth()+monthOffset);const year=base.getFullYear(),month=base.getMonth(),first=new Date(year,month,1),offset=(first.getDay()+6)%7,days=new Date(year,month+1,0).getDate(),cells=Math.ceil((offset+days)/7)*7;return `${heading('Monthly planner','Keep an eye on deadlines, routines and the bigger picture.',button('＋ Add task','add-task','btn btn-primary'))}<div class="toolbar"><button class="btn btn-small" data-action="month-prev">←</button><strong>${base.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</strong><button class="btn btn-small" data-action="month-next">→</button><button class="btn btn-small" data-action="month-now">This month</button></div><div class="card card-pad"><div class="calendar-grid">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>`<div class="calendar-dow">${x}</div>`).join('')}${Array.from({length:cells},(_,i)=>{const n=i-offset+1,valid=n>0&&n<=days,iso=valid?`${year}-${String(month+1).padStart(2,'0')}-${String(n).padStart(2,'0')}`:'',ts=valid?state.tasks.filter(t=>t.date===iso):[];return `<button class="calendar-day ${!valid?'other':''} ${iso===todayISO()?'today':''}" ${valid?`data-action="select-calendar-day" data-date="${iso}"`:''}><strong>${valid?n:n<1?new Date(year,month,0).getDate()+n:n-days}</strong>${ts.length?`<small>${ts.length} task${ts.length>1?'s':''}</small>`:''}${ts.slice(0,2).map(t=>`<small>· ${esc(t.title).slice(0,18)}</small>`).join('')}</button>`}).join('')}</div></div>`}
function routines(){return `${heading('My routines','Create different schedules for the different seasons of your life.',button('＋ Create routine','add-routine','btn btn-primary'))}<div class="grid three-col">${state.routines.map(r=>`<div class="card routine-card"><div class="routine-card-top"><span class="routine-symbol">${r.color==='blue'?'◈':r.color==='amber'?'☼':'⟳'}</span>${r.id===state.activeRoutine?'<span class="tag teal">Active routine</span>':'<span class="tag">Inactive</span>'}</div><h3>${esc(r.name)}</h3><p>${esc(r.description||'No description')}</p><div class="routine-meta"><span>☀ ${fmtTime(r.wake)}</span><span>☾ ${fmtTime(r.sleep)}</span></div><div class="routine-meta">${r.days.map(x=>['Su','Mo','Tu','We','Th','Fr','Sa'][x]).join(' · ')} · ${state.tasks.filter(t=>t.routineId===r.id).length} tasks</div><div class="routine-actions">${r.id!==state.activeRoutine?button('Activate','activate-routine','btn btn-small btn-soft','data-id="'+r.id+'"'):button('Active','routine-active','btn btn-small','disabled')}${button('Edit','edit-routine','btn btn-small','data-id="'+r.id+'"')}${button('···','routine-menu','btn btn-small','data-id="'+r.id+'"')}</div></div>`).join('')}</div>`}
function tasksPage(filter){let list=state.tasks.slice().sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start));if(filter==='incomplete')list=list.filter(t=>['incomplete','partial'].includes(t.status));if(filter==='completed')list=list.filter(t=>t.status==='completed');return `${heading(filter==='incomplete'?'Incomplete tasks':filter==='completed'?'Completed tasks':'All tasks',filter==='incomplete'?'Unfinished work is kept safe and given another chance.':filter==='completed'?'A record of the work you have finished.':'One place for every task and scheduled occurrence.',button('＋ Add task','add-task','btn btn-primary'))}<div class="toolbar"><input class="input" id="task-search" style="max-width:250px" placeholder="Search tasks…"><select class="select" id="task-filter" style="max-width:160px"><option value="all">All statuses</option><option value="pending">Upcoming</option><option value="progress">In progress</option><option value="partial">Partially done</option><option value="incomplete">Incomplete</option><option value="completed">Completed</option><option value="skipped">Skipped</option></select><select class="select" id="task-sort" style="max-width:150px"><option value="date">Sort by date</option><option value="priority">Sort by priority</option><option value="title">Sort by title</option></select></div><div class="card card-pad" id="task-table-container">${taskTable(list)}</div>`}
function assistant(){return `${heading('Planning helper','Use simple planning commands and wisedayZ’s built-in scheduling rules.',`<span class="tag teal">Approval required for schedule changes</span>`)}<div class="card card-pad"><div class="assistant-thread" id="chat-thread"><div class="chat-bubble chat-ai"><div class="chat-label">DAYWISE PLANNING HELPER</div>Hello ${esc(state.user.name)}. I use local rules to help you review your day, find incomplete tasks and prepare schedule proposals. No external AI service is used. I will always show you a proposal before changing your schedule.</div><div class="chat-bubble chat-user">I woke up later than planned. Prepare a new schedule.</div><div class="chat-bubble chat-ai"><div class="chat-label">DAYWISE PLANNING HELPER</div>Use Prepare today’s schedule to review your tasks and choose before wake-up, after wake-up or flexible. Nothing changes until you approve the proposal.</div></div><div class="chat-compose"><input class="input" id="chat-input" placeholder="Try: prepare my schedule, show incomplete tasks, or review my day…"><button class="btn btn-primary" data-action="send-chat">Send ↗</button></div><div class="toolbar" style="margin-top:13px"><button class="btn btn-small btn-soft" data-action="prepare-schedule">✧ Prepare today's schedule</button><button class="btn btn-small" data-action="reschedule">Review schedule changes</button><button class="btn btn-small" data-action="show-incomplete">Show incomplete tasks</button><button class="btn btn-small" data-action="daily-report">Review my day</button></div></div>`}
//bug fixing in focus mode by yasir
let focusMode = 'pomodoro';
let focusTaskId = '';

const focusTimers = {
    pomodoro: {
        seconds: (state.preferences.focusMinutes || 25) * 60,
        running: false,
        interval: null,
        elapsedSeconds: 0,
        startedAt: null,
        taskId: null,
        taskTitle: ''
    },
    stopwatch: {
        seconds: 0,
        running: false,
        interval: null,
        elapsedSeconds: 0,
        startedAt: null,
        taskId: null,
        taskTitle: ''
    },
    timer: {
        seconds: (state.preferences.timerMinutes || 15) * 60,
        running: false,
        interval: null,
        elapsedSeconds: 0,
        startedAt: null,
        taskId: null,
        taskTitle: ''
    }
};

function focusCurrent() {
    return focusTimers[focusMode];
}
function focusPage(){const focusMins=state.preferences.focusMinutes||25,breakMins=state.preferences.breakMinutes||5;return `${heading('Focus studio','A quiet space for focused work, timed sessions and breaks.',`<span class="tag teal">Your focus, your pace</span>`)}<div class="grid two-col"><div class="card focus-timer"><div class="toolbar" style="justify-content:center"><button class="btn btn-small ${focusMode==='pomodoro'?'btn-soft focus-mode-active':''}" aria-pressed="${focusMode==='pomodoro'}" data-action="set-focus-mode" data-mode="pomodoro">Pomodoro</button><button class="btn btn-small ${focusMode==='stopwatch'?'btn-soft focus-mode-active':''}" aria-pressed="${focusMode==='stopwatch'}" data-action="set-focus-mode" data-mode="stopwatch">Stopwatch</button><button class="btn btn-small ${focusMode==='timer'?'btn-soft focus-mode-active':''}" aria-pressed="${focusMode==='timer'}" data-action="set-focus-mode" data-mode="timer">Timer</button></div><div class="timer-ring"><div><strong id="focus-clock">${clockDisplay()}</strong><small id="focus-label">${focusMode==='pomodoro'?'FOCUS SESSION':focusMode==='stopwatch'?'STOPWATCH':'COUNTDOWN'}</small></div></div><div class="timer-controls">${button(focusCurrent().running ? 'Pause' : 'Start', 'focus-toggle', 'btn btn-primary')}${button('Reset','focus-reset','btn')}</div><div class="field" style="max-width:220px;margin:20px auto 0"><label>Link to a task (optional)</label><select class="select" id="focus-task"><option value="">No linked task</option>${state.tasks.filter(t=>t.date===todayISO()&&t.status!=='completed').map(t=>`<option value="${t.id}" ${focusTaskId===t.id?'selected':''}>${esc(t.title)}</option>`).join('')}</select></div></div><div class="grid"><div class="card card-pad"><div class="card-title">Session settings</div><div class="card-subtitle">Adjust your focus and break intervals</div><div class="form-grid" style="margin-top:15px"><div class="field"><label>Focus minutes</label><input class="input" type="number" id="focus-minutes" min="1" max="180" value="${focusMins}"></div><div class="field"><label>Break minutes</label><input class="input" type="number" id="break-minutes" min="1" max="60" value="${breakMins}"></div></div><button class="btn btn-soft btn-block" style="margin-top:13px" data-action="save-focus-settings">Save timer settings</button></div><div class="card card-pad"><div class="section-head"><div class="card-title">Today's focus sessions</div><span class="tag">${state.focusSessions.filter(s=>s.date===todayISO()).length} sessions</span></div>${state.focusSessions.filter(s=>s.date===todayISO()).map(s=>`<div class="routine-mini"><span class="routine-name">${esc(s.taskTitle||'Focus session')}</span><span class="routine-days">${s.minutes} min</span></div>`).join('')||'<p class="small muted">Completed focus sessions will appear here.</p>'}</div></div></div>`}
//bug fix
function clockDisplay() {
    const s = focusCurrent().seconds;

    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
//
function habits(){return `${heading('Habits','Build consistency through small repeatable actions.',button('＋ Add habit','add-habit','btn btn-primary'))}<div class="card card-pad"><div class="section-head"><div><div class="card-title">Your habits</div><div class="card-subtitle">Check in when you complete a habit today.</div></div><span class="tag teal">${state.habits.filter(h=>h.done.includes(todayISO())).length}/${state.habits.length} done today</span></div>${state.habits.map(h=>`<div class="habit-row"><div><strong style="font-size:11px">${esc(h.name)}</strong><div class="task-meta">${h.days.length} days per week · ${h.done.length} total check-ins</div></div><div class="habit-days">${['M','T','W','T','F','S','S'].map((d,i)=>`<span class="habit-day ${h.done.includes(addDays(todayISO(),-((new Date().getDay()+6)%7)+i))?'checked':''}">${d}</span>`).join('')}</div><button class="btn btn-small ${h.done.includes(todayISO())?'btn-soft':''}" data-action="toggle-habit" data-id="${h.id}">${h.done.includes(todayISO())?'✓ Done':'Check in'}</button></div>`).join('')||'<div class="empty-state">No habits created yet.</div>'}</div>`}
let insightPeriod='weekly',insightDate=todayISO();
function studyMinutesForDate(iso){
 const sessionMins=state.focusSessions.filter(s=>s.date===iso&&(!s.taskId||taskById(s.taskId)?.category==='Study')).reduce((a,s)=>a+(Number(s.minutes)||0),0);
 const taskMins=state.tasks.filter(t=>t.date===iso&&t.category==='Study').reduce((a,t)=>a+(t.status==='completed'?(Number(t.actual)||Number(t.duration)||0):(Number(t.actual)||0)),0);
 return Math.max(sessionMins,taskMins);
}
function fmtHours(mins){const h=Math.floor(mins/60),m=Math.round(mins%60);return h?`${h}h ${m}m`:`${m}m`;}
function insights(){
 const d=todayISO(),ref=insightDate||d;
 const studyToday=studyMinutesForDate(d);
 const studySelectedDay=studyMinutesForDate(ref);
 const weekStart=addDays(ref,-((new Date(ref+'T12:00:00').getDay()+6)%7));
 const weekDays=Array.from({length:7},(_,i)=>addDays(weekStart,i));
 const weekStudyVals=weekDays.map(studyMinutesForDate);
 const studyWeekTotal=weekStudyVals.reduce((a,b)=>a+b,0);
 const refObj=new Date(ref+'T12:00:00'),y=refObj.getFullYear(),m=refObj.getMonth();
 const daysInMonth=new Date(y,m+1,0).getDate();
 const monthDays=Array.from({length:daysInMonth},(_,i)=>`${y}-${String(m+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`);
 const monthStudyVals=monthDays.map(studyMinutesForDate);
 const studyMonthTotal=monthStudyVals.reduce((a,b)=>a+b,0);
 const yearMonths=Array.from({length:12},(_,mi)=>{
  const prefix=`${y}-${String(mi+1).padStart(2,'0')}-`;
  const dim=new Date(y,mi+1,0).getDate();
  let total=0;
  for(let day=1;day<=dim;day++)total+=studyMinutesForDate(`${prefix}${String(day).padStart(2,'0')}`);
  return {label:new Date(y,mi,1).toLocaleDateString(undefined,{month:'short'}),mins:total};
 });
 const studyYearTotal=yearMonths.reduce((a,x)=>a+x.mins,0);
 let chartTitle='',chartSub='',chartBadge='',bars=[];
 if(insightPeriod==='daily'){
  const dayStudyTasks=state.tasks.filter(t=>t.date===ref&&t.category==='Study');
  const dayStudySessions=state.focusSessions.filter(s=>s.date===ref&&(!s.taskId||taskById(s.taskId)?.category==='Study'));
  chartTitle=`Daily study breakdown · ${fmtDate(ref,{weekday:'short',month:'short',day:'numeric'})}`;
  chartSub=`Total studied: ${fmtHours(studySelectedDay)} (${(studySelectedDay/60).toFixed(1)} hrs)`;
  chartBadge='Daily';
  const items=[...dayStudyTasks.map(t=>({label:t.title.slice(0,10),mins:t.status==='completed'?(Number(t.actual)||Number(t.duration)||0):(Number(t.actual)||0)})),...dayStudySessions.filter(s=>!s.taskId).map(s=>({label:(s.taskTitle||'Focus').slice(0,10),mins:Number(s.minutes)||0}))].filter(x=>x.mins>0);
  bars=items.length?items:[{label:'No study',mins:0}];
 }else if(insightPeriod==='weekly'){
  chartTitle='Weekly study hours';
  chartSub=`${fmtDate(weekStart,{month:'short',day:'numeric'})} — ${fmtDate(weekDays[6],{month:'short',day:'numeric'})} · Total: ${fmtHours(studyWeekTotal)} (${(studyWeekTotal/60).toFixed(1)} hrs)`;
  chartBadge='Weekly';
  bars=weekDays.map((iso,i)=>({label:fmtDate(iso,{weekday:'short'}),mins:weekStudyVals[i]}));
 }else if(insightPeriod==='monthly'){
  chartTitle=`Monthly study hours · ${refObj.toLocaleDateString(undefined,{month:'long',year:'numeric'})}`;
  chartSub=`Total: ${fmtHours(studyMonthTotal)} (${(studyMonthTotal/60).toFixed(1)} hrs) · Daily avg: ${fmtHours(Math.round(studyMonthTotal/daysInMonth))}`;
  chartBadge='Monthly';
  bars=monthDays.map((iso,i)=>({label:(i+1)%5===1||i===daysInMonth-1?String(i+1):'',mins:monthStudyVals[i],title:`${fmtDate(iso,{month:'short',day:'numeric'})}: ${fmtHours(monthStudyVals[i])}`}));
 }else{
  chartTitle=`Yearly study hours · ${y}`;
  chartSub=`Total: ${fmtHours(studyYearTotal)} (${(studyYearTotal/60).toFixed(1)} hrs) · Monthly avg: ${fmtHours(Math.round(studyYearTotal/12))}`;
  chartBadge='Yearly';
  bars=yearMonths.map(x=>({label:x.label,mins:x.mins}));
 }
 const maxBar=Math.max(60,...bars.map(b=>b.mins));
 const completed=state.tasks.filter(t=>t.status==='completed').length,incomplete=state.tasks.filter(t=>['incomplete','partial'].includes(t.status)).length,focus=state.focusSessions.reduce((a,s)=>a+s.minutes,0),all=state.tasks.length,pct=all?Math.round(completed/all*100):0;
 return `${heading('Productivity insights','Track your study hours and patterns across days, weeks and months.',button('Daily report','daily-report','btn btn-primary'))}<div class="toolbar"><button class="btn btn-small ${insightPeriod==='daily'?'btn-primary':''}" data-action="set-insight-period" data-period="daily">Daily</button><button class="btn btn-small ${insightPeriod==='weekly'?'btn-primary':''}" data-action="set-insight-period" data-period="weekly">Weekly</button><button class="btn btn-small ${insightPeriod==='monthly'?'btn-primary':''}" data-action="set-insight-period" data-period="monthly">Monthly</button><button class="btn btn-small ${insightPeriod==='yearly'?'btn-primary':''}" data-action="set-insight-period" data-period="yearly">Yearly</button><input class="input" style="width:155px" type="date" id="insight-date" value="${ref}"></div><div class="grid stats-grid">${stat('Studied today',`${(studyToday/60).toFixed(1)} hrs`,`${fmtHours(studyToday)} logged today`,'◷','blue')}${stat('Weekly study',`${(studyWeekTotal/60).toFixed(1)} hrs`,`${fmtHours(studyWeekTotal)} this week`,'◎','teal')}${stat('Monthly study',`${(studyMonthTotal/60).toFixed(1)} hrs`,`${fmtHours(studyMonthTotal)} this month`,'▥','amber')}${stat('Overall completion',`${pct}%`,`${completed}/${all} tasks completed`,'✓','green')}</div><div class="grid two-col"><div class="card card-pad"><div class="section-head"><div><div class="card-title">${chartTitle}</div><div class="card-subtitle">${chartSub}</div></div><span class="tag teal">${chartBadge}</span></div><div class="bar-chart" style="gap:${bars.length>15?'2px':'8px'}">${bars.map(b=>`<div class="bar-col" title="${esc(b.title||`${b.label}: ${fmtHours(b.mins)}`)}"><div class="bar" style="height:${Math.max(3,b.mins/maxBar*125)}px"></div><small>${esc(b.label)}</small></div>`).join('')}</div></div><div class="card card-pad"><div class="card-title">Task status breakdown</div><div class="card-subtitle">All recorded task occurrences</div>${[['Completed',completed,'#58bba8'],['Upcoming / active',state.tasks.filter(t=>['pending','progress'].includes(t.status)).length,'#7890ed'],['Incomplete / partial',incomplete,'#d78c83'],['Skipped',state.tasks.filter(t=>t.status==='skipped').length,'#aab3bd']].map(([n,v,c])=>`<div style="margin-top:18px"><div class="progress-label"><span>${n}</span><strong>${v}</strong></div><div class="progress-track"><div class="progress-fill" style="background:${c};width:${all?v/all*100:0}%"></div></div></div>`).join('')}</div></div><div class="callout" style="margin-top:15px">Study hours combine completed/logged <strong>Study</strong> category tasks and Focus Studio sessions. Switch between Daily, Weekly, Monthly, and Yearly views above to inspect your study consistency.</div>`;
}
function notificationsPage(){const unread=state.notifications.filter(n=>!n.read).length;return `${heading('Notifications','Task reminders and schedule updates in one place.',button('Mark all read','mark-all-read','btn')+button('Notification settings','notification-settings','btn btn-primary'))}<div class="card card-pad"><div class="section-head"><div><div class="card-title">Your notifications</div><div class="card-subtitle">${unread} unread · ${state.notifications.length} total</div></div><span class="tag teal">Local reminders</span></div>${state.notifications.length?state.notifications.map(n=>`<div class="history-row ${n.read?'':'notification-unread'}"><span class="history-icon">${n.type==='task'?'◷':n.type==='success'?'✓':n.type==='warning'?'!':'♧'}</span><div><strong>${esc(n.title)}</strong><small>${esc(n.message)}</small></div><div class="notification-actions"><time>${new Date(n.createdAt).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</time>${button(n.read?'Read':'Mark read','read-notification','btn btn-small','data-id="'+n.id+'"')}</div></div>`).join(''):'<div class="empty-state"><div class="empty-icon">♧</div><h3>You are all caught up</h3><p>Task reminders and schedule updates will appear here while wisedayZ is open.</p></div>'}</div><div class="callout" style="margin-top:14px">Browser reminders run while this page is open. Reliable background and closed-app notifications require a deployed service worker and push backend, which are not part of this local prototype.</div>`}
function historyPage(){return `${heading('Activity history','A transparent record of task and schedule changes.',button('Export CSV','export-history','btn'))}<div class="card card-pad">${state.history.length?state.history.map(h=>`<div class="history-row"><span class="history-icon">${h.type==='completed'?'✓':h.type==='rescheduled'?'↻':h.type==='created'?'＋':'◷'}</span><div><strong>${esc(h.title)}</strong><small>${esc(h.detail||h.type)} · ${h.type}</small></div><time>${new Date(h.at).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</time></div>`).join(''):'<div class="empty-state"><div class="empty-icon">↺</div><h3>No activity yet</h3><p>Task changes, completions and approved schedule updates will appear here.</p></div>'}</div>`}
function settings(){return `${heading('Settings','Make wisedayZ work the way you do.',button('Save preferences','save-settings','btn btn-primary'))}<div class="grid two-col"><div class="card card-pad"><div class="card-title">Planning preferences</div><div class="card-subtitle">Default times and scheduling behavior</div><div class="form-grid" style="margin-top:16px"><div class="field"><label>Default wake-up</label><input class="input" id="pref-wake" type="time" value="${state.preferences.wake}"></div><div class="field"><label>Preferred bedtime</label><input class="input" id="pref-sleep" type="time" value="${state.preferences.sleep}"></div><div class="field"><label>Default task duration (minutes)</label><input class="input" id="pref-duration" type="number" min="5" value="${state.preferences.defaultDuration}"></div><div class="field"><label>Timezone</label><input class="input" value="${esc(state.user.timezone)}" disabled></div></div><div class="divider"></div><div class="settings-row"><div><strong>Appearance</strong><small>Switch between light mode and night mode.</small></div><button class="btn btn-small" id="settings-theme-btn" data-action="toggle-theme">${state.preferences.theme==='dark'?'☀ Switch to light mode':'☾ Switch to night mode'}</button></div><div class="settings-row"><div><strong>Schedule approval</strong><small>Review every schedule proposal before applying changes.</small></div><span class="tag teal">Always on</span></div><div class="settings-row"><div><strong>Protect sleep window</strong><small>The scheduler avoids placing tasks inside your sleep period.</small></div><input type="checkbox" class="switch" id="pref-quiet" ${state.preferences.quiet?'checked':''}></div><div class="settings-row"><div><strong>Notifications</strong><small>Receive task reminders and schedule updates.</small></div><input type="checkbox" class="switch" id="pref-notifications" ${state.preferences.notifications?'checked':''}></div></div><div class="card card-pad"><div class="card-title">Data & account</div><div class="card-subtitle">Your data is stored locally and can sync to your account when online.</div><div class="settings-row"><div><strong>Export your data</strong><small>Download routines, tasks and history as JSON.</small></div>${button('Export JSON','export-data','btn btn-small')}</div><div class="settings-row"><div><strong>Import backup</strong><small>Restore a wisedayZ JSON backup.</small></div><label class="btn btn-small">Import<input type="file" id="import-data" accept="application/json" hidden></label></div><div class="settings-row"><div><strong>Reset demo data</strong><small>Restore the original sample workspace.</small></div>${button('Reset','reset-data','btn btn-small btn-danger')}</div><div class="callout" style="margin-top:15px">Cloud sync is available after signing in. Scheduling uses local rules. No external AI service or API key is required.</div></div><div class="card card-pad" style="margin-top:15px"><div class="card-title">Software updates</div><div class="card-subtitle">Keep wisedayZ up to date with the latest desktop release.</div><div class="settings-row"><div><strong>Installed version</strong><small id="update-status">${latestUpdateInfo?(latestUpdateInfo.updateAvailable?`Version ${latestUpdateInfo.latestVersion} is available`:`You are using the latest version (${latestUpdateInfo.currentVersion})`):'Select Check for updates to check the latest release.'}</small></div><div style="display:flex;gap:8px;flex-wrap:wrap">${button('Check for updates','check-app-update','btn btn-small')}${button('Download & install','download-app-update','btn btn-small btn-primary',`id="download-update-button" ${latestUpdateInfo?.updateAvailable?'':'hidden'}`)}</div></div></div></div>`}
function profile(){return `${heading('Profile','Your personal workspace information.',button('Save profile','save-profile','btn btn-primary'))}<div class="card card-pad" style="max-width:620px"><div class="row" style="display:flex;align-items:center;gap:13px;margin-bottom:20px"><span class="avatar" style="width:54px;height:54px;font-size:20px">${esc((state.user.name||'U')[0].toUpperCase())}</span><div><strong>${esc(state.user.name)}</strong><div class="small muted">Personal workspace</div></div></div><div class="form-grid"><div class="field"><label>Full name</label><input class="input" id="profile-name" value="${esc(state.user.name)}"></div><div class="field"><label>Email</label><input class="input" id="profile-email" type="email" value="${esc(state.user.email)}"></div></div></div>`}
function help(){return `${heading('Help & support','Guidance for using your personal scheduler.')}<div class="grid two-col"><div class="card card-pad"><div class="card-title">How schedule proposals work</div><p class="small muted" style="line-height:1.8">wisedayZ checks your available time, fixed commitments, task priorities, deadlines and remaining task durations. It prepares a proposal for you to review. Your active schedule changes only after you approve the proposal.</p><div class="divider"></div><div class="card-title">How partial completion works</div><p class="small muted" style="line-height:1.8">When you stop a task before finishing, record the time spent. wisedayZ calculates the remaining duration and can suggest another slot. Your original work history is preserved.</p></div><div class="card card-pad"><div class="card-title">Frequently asked questions</div>${[['Where is my data stored?','This prototype stores data in your browser local storage. Export a backup regularly.'],['Can the scheduler move college or meeting times?','No. Fixed tasks are protected unless you explicitly authorize a change.'],['Can I use multiple routines?','Yes. Activate the routine that matches your current schedule.'],['Does the app send real alarms?','This browser prototype supports in-app reminders; reliable background alarms require a native mobile implementation.']].map(([q,a])=>`<details style="padding:12px 0;border-bottom:1px solid #eef0f3"><summary style="font-size:10px;font-weight:700;cursor:pointer">${q}</summary><p class="small muted" style="line-height:1.7">${a}</p></details>`).join('')}</div></div>`}
function alarm(){const r=getRoutine(),w=state.wakeRecords[todayISO()];return `${heading('Alarm & wake-up','Confirm your actual start to help wisedayZ adapt the day.',button('✧ Prepare schedule','reschedule','btn btn-primary'))}<div class="grid two-col"><div class="wake-card"><div class="eyebrow">TODAY'S WAKE-UP</div><h3>${w?'Wake-up confirmed':'Your planned start'}</h3><p>${w?`You confirmed at ${fmtTime(w.time)}.`:'Your active routine expects you to wake up at this time.'}</p><div class="wake-time">${w?fmtTime(w.time):fmtTime(r?.wake||state.preferences.wake)}</div>${w?'<span class="tag teal">Recorded</span>':button('I am awake','wake-confirm','btn btn-primary')}</div><div class="card card-pad"><div class="card-title">Alarm preferences</div><div class="field" style="margin-top:15px"><label>Wake-up time for active routine</label><input class="input" type="time" id="alarm-time" value="${r?.wake||state.preferences.wake}"></div><div class="field" style="margin-top:12px"><label>Repeat</label><div class="small muted">Uses the active routine's selected days.</div></div><button class="btn btn-primary btn-block" style="margin-top:15px" data-action="save-alarm">Save wake-up time</button><div class="callout" style="margin-top:15px">Browser limitations: a web page cannot guarantee an alarm when it is closed or the device is asleep. Use a native app for dependable background alarms.</div></div></div>`}
function report(){const d=todayISO(),tasks=state.tasks.filter(t=>t.date===d),done=tasks.filter(t=>t.status==='completed'),open=tasks.filter(t=>['pending','progress','partial','incomplete'].includes(t.status)),focus=state.focusSessions.filter(s=>s.date===d).reduce((a,s)=>a+s.minutes,0);return `${heading('Daily report',`A clear review of ${fmtDate(d,{weekday:'long',month:'long',day:'numeric'})}.`,button('Export CSV','export-report','btn'))}<div class="grid stats-grid">${stat('Completed',done.length,`of ${tasks.length} scheduled tasks`,'✓','green')}${stat('Still open',open.length,'Need attention','◷','amber')}${stat('Focus time',`${focus} min`,'Tracked sessions','◎','blue')}${stat('Completion',`${tasks.length?Math.round(done.length/tasks.length*100):0}%`,'Daily plan','▥','green')}</div><div class="card card-pad"><div class="card-title">Today's task review</div>${tasks.length?taskTable(tasks):'<div class="empty-state">No scheduled tasks for today.</div>'}<div class="divider"></div><div class="card-title">Tomorrow's carry-forward suggestions</div><p class="small muted">The local scheduler can review unfinished tasks and prepare a proposal for a suitable future slot.</p>${button('Prepare proposal','reschedule','btn btn-primary btn-small')}</div>`}
function render(){applyTheme();updateBadges();$('#page-crumb').textContent=routes[route]||'Overview';$$('.nav-group a').forEach(a=>a.classList.toggle('active',a.dataset.route===route));const map={home:dashboard,daily,weekly,monthly,routines,tasks:()=>tasksPage('all'),incomplete:()=>tasksPage('incomplete'),completed:()=>tasksPage('completed'),assistant,focus:focusPage,habits,insights,history:historyPage,notifications:notificationsPage,settings,profile,help,alarm,report};$('#view').innerHTML=(map[route]||dashboard)();$('#sidebar').classList.remove('open');}
function modal(title,body,footer=''){const root=$('#modal-root');root.innerHTML=`<div class="modal-backdrop" data-action="backdrop-close"><div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h2>${title}</h2><button class="close-btn" data-action="close-modal">×</button></div><div class="modal-body">${body}</div>${footer?`<div class="modal-foot">${footer}</div>`:''}</div></div>`}
function closeModal(){$('#modal-root').innerHTML=''}
function taskForm(task=null,date=todayISO(),draft=null) {const t=task||{title:'',date,start:'09:00',duration:state.preferences.defaultDuration,priority:'medium',category:'Study',status:'pending',fixed:false,description:'',routineId:state.activeRoutine,deadline:'',repeat:'none',...(draft||{})};modal(task?'Edit task':'Create task',`<form id="task-form"><input type="hidden" name="id" value="${task?.id||''}"><div class="form-grid"><div class="field full"><label>Task title *</label><input class="input" name="title" required maxlength="90" placeholder="e.g. SystemVerilog practice" value="${esc(t.title)}"></div><div class="field"><label>Date *</label><input class="input" type="date" name="date" required value="${t.date}"></div><div class="field"><label>Start time *</label><input class="input" type="time" name="start" required value="${t.start}"></div><div class="field"><label>Duration (minutes) *</label><input class="input" type="number" min="5" max="1440" name="duration" required value="${t.duration}"></div><div class="field"><label>Priority</label><select class="select" name="priority"><option ${t.priority==='high'?'selected':''}>high</option><option ${t.priority==='medium'?'selected':''}>medium</option><option ${t.priority==='low'?'selected':''}>low</option></select></div><div class="field"><label>Category</label><select class="select" name="category">${['Study','College','Work','Project','Fitness','Personal','Health','Other'].map(c=>`<option ${t.category===c?'selected':''}>${c}</option>`).join('')}</select></div><div class="field"><label>Routine</label><select class="select" name="routineId"><option value="">No routine</option>${state.routines.map(r=>`<option value="${r.id}" ${t.routineId===r.id?'selected':''}>${esc(r.name)}</option>`).join('')}</select></div><div class="field"><label>Deadline (optional)</label><input class="input" type="date" name="deadline" value="${t.deadline||''}"></div><div class="field"><label>Prerequisite task (optional)</label><select class="select" name="dependsOn"><option value="">No prerequisite</option>${state.tasks.filter(x=>x.id!==task?.id&&!(['completed','skipped'].includes(x.status))).map(x=>`<option value="${x.id}" ${t.dependsOn===x.id?'selected':''}>${esc(x.title)} · ${fmtDate(x.date,{month:'short',day:'numeric'})}</option>`).join('')}</select></div><div class="field"><label>Repeat</label><select class="select" name="repeat"><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekdays">Weekdays</option><option value="weekly">Weekly</option></select></div><div class="field"><label>Scheduling type</label><select class="select" name="fixed"><option value="false" ${!t.fixed?'selected':''}>Flexible — can be moved</option><option value="true" ${t.fixed?'selected':''}>Fixed — protect this time</option></select></div><div class="field full"><label>Description / notes</label><textarea class="textarea" name="description" placeholder="Add useful details…">${esc(t.description||'')}</textarea></div></div></form>`,`${task?button('Delete','delete-task','btn btn-danger','data-id="'+task.id+'"'):''}<button class="btn" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="save-task">${task?'Save changes':'Create task'}</button>`)}
function routineForm(r=null){const x=r||{name:'',description:'',days:[1,2,3,4,5],wake:state.preferences.wake,sleep:state.preferences.sleep,color:'teal'};modal(r?'Edit routine':'Create routine',`<form id="routine-form"><input type="hidden" name="id" value="${r?.id||''}"><div class="field"><label>Routine name *</label><input class="input" name="name" required value="${esc(x.name)}" placeholder="e.g. Exam preparation"></div><div class="field" style="margin-top:12px"><label>Description</label><input class="input" name="description" value="${esc(x.description)}" placeholder="What is this routine for?"></div><div class="form-grid" style="margin-top:12px"><div class="field"><label>Wake-up time</label><input class="input" type="time" name="wake" value="${x.wake}"></div><div class="field"><label>Bedtime</label><input class="input" type="time" name="sleep" value="${x.sleep}"></div></div><div class="field" style="margin-top:14px"><label>Active days</label><div style="display:flex;gap:7px;flex-wrap:wrap">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d,i)=>`<label class="tag" style="cursor:pointer"><input type="checkbox" name="days" value="${i}" ${x.days.includes(i)?'checked':''}> ${d}</label>`).join('')}</div></div></form>`,`<button class="btn" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="save-routine">Save routine</button>`)}
function taskDetail(id){const t=taskById(id);if(!t)return;modal(esc(t.title),`<div style="display:flex;gap:8px;align-items:center;margin-bottom:14px">${badge(t.status)}<span class="tag">${t.priority} priority</span><span class="tag">${t.fixed?'Fixed':'Flexible'}</span></div><div class="grid two-col"><div><div class="small muted">Scheduled</div><strong>${fmtDate(t.date,{month:'long',day:'numeric',year:'numeric'})}</strong></div><div><div class="small muted">Start time</div><strong>${fmtTime(t.start)}</strong></div><div><div class="small muted">Original duration</div><strong>${t.duration} minutes</strong></div><div><div class="small muted">Remaining duration</div><strong>${t.remaining??t.duration} minutes</strong></div><div><div class="small muted">Time spent</div><strong>${t.actual||0} minutes</strong></div><div><div class="small muted">Category</div><strong>${esc(t.category)}</strong></div></div>${t.description?`<p class="small muted" style="line-height:1.7;margin-top:15px">${esc(t.description)}</p>`:''}<div class="divider"></div><div class="card-title">Update progress</div><div class="form-grid" style="margin-top:10px"><div class="field"><label>Minutes completed in this update</label><input class="input" id="task-progress-minutes" type="number" min="0" max="${t.remaining??t.duration}" value="${Math.min(t.remaining??t.duration,0)}"></div><div class="field"><label>Optional note</label><input class="input" id="task-progress-note" placeholder="What happened?"></div></div><p class="small muted">Recording time spent reduces the remaining duration. You can then mark the task complete or keep it partially complete.</p>`,`<button class="btn" data-action="edit-task" data-id="${id}">Edit</button><button class="btn btn-soft" data-action="mark-incomplete" data-id="${id}">Incomplete</button><button class="btn btn-primary" data-action="mark-complete" data-id="${id}">Complete</button><button class="btn" data-action="save-progress" data-id="${id}">Save progress</button>`)}
function wakeConfirm(){const d=todayISO(),r=getRoutine(),planned=r?.wake||state.preferences.wake;modal('Confirm your wake-up',`<div class="callout">Your planned wake-up was <strong>${fmtTime(planned)}</strong>. Confirm the actual time you got up. wisedayZ will use this to prepare a schedule proposal.</div><div class="field" style="margin-top:15px"><label>Actual wake-up time</label><input class="input" id="wake-actual" type="time" value="${timeOf(new Date().getHours()*60+new Date().getMinutes())}"></div><p class="small muted">Confirming does not change your schedule. It only prepares a proposal for your review.</p>`,`<button class="btn" data-action="close-modal">Not now</button><button class="btn btn-primary" data-action="save-wake">Confirm wake-up</button>`)}
function intervalsOverlap(aStart,aEnd,bStart,bEnd){return aStart<bEnd&&aEnd>bStart}
function findFreeSlot(date,duration,earliest,latest,occupied,preferred){
 const candidates=[];
 const step=5;
 for(let start=Math.max(0,Math.ceil(earliest/step)*step);start+duration<=Math.min(1440,latest);start+=step){
  const end=start+duration;
  if(occupied.some(x=>intervalsOverlap(start,end,x.start,x.end)))continue;
  const distance=Math.abs(start-preferred);
  candidates.push({start,end,distance});
 }
 candidates.sort((a,b)=>a.distance-b.distance||a.start-b.start);
 return candidates[0]||null;
}
function dependencyCycle(taskId, prerequisiteId, tasks=state.tasks){
 const byId=new Map(tasks.map(t=>[t.id,t]));
 let cursor=prerequisiteId,seen=new Set();
 while(cursor){if(cursor===taskId)return true;if(seen.has(cursor))return true;seen.add(cursor);cursor=byId.get(cursor)?.dependsOn||null;}
 return false;
}
function workloadWarnings(tasks=state.tasks){
 const byDate=new Map();
 for(const t of tasks){if(['completed','skipped'].includes(t.status))continue;const minsLeft=Math.max(0,Number(t.remaining??t.duration)||0);byDate.set(t.date,(byDate.get(t.date)||0)+minsLeft);}
 return [...byDate.entries()].filter(([,total])=>total>600).sort(([a],[b])=>a.localeCompare(b)).map(([date,total])=>({date,total,reason:`${Math.round(total/60*10)/10} hours of unfinished work exceed the 10-hour daily workload guideline`}));
}
function validateBackup(data){
 if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('Backup must contain a JSON object');
 if(!Array.isArray(data.tasks)||!Array.isArray(data.routines))throw new Error('Backup must include task and routine arrays');
 const ids=new Set();
 for(const t of data.tasks){if(!t||typeof t!=='object'||!t.id||!t.title||!/^\d{4}-\d{2}-\d{2}$/.test(t.date)||!/^\d{2}:\d{2}$/.test(t.start)||!Number.isFinite(Number(t.duration))||Number(t.duration)<1)throw new Error('A task has missing or invalid required fields');if(ids.has(t.id))throw new Error(`Duplicate task id: ${t.id}`);ids.add(t.id);}
 const routineIds=new Set(data.routines.map(r=>r?.id).filter(Boolean));
 if(data.tasks.some(t=>t.routineId&&!routineIds.has(t.routineId)))throw new Error('A task references a routine that does not exist');
 if(data.tasks.some(t=>t.dependsOn&&!ids.has(t.dependsOn)))throw new Error('A task references a missing prerequisite');
 return true;
}
function migrateImportedState(data){
 const migrated={...data,schemaVersion:6,user:data.user||{},preferences:data.preferences||{},tasks:data.tasks||[],routines:data.routines||[],history:data.history||[],notifications:data.notifications||[],habits:data.habits||[],proposals:data.proposals||[],wakeRecords:data.wakeRecords||{},focusSessions:data.focusSessions||[]};
 migrated.preferences.focusMinutes ??= 25;
 migrated.preferences.breakMinutes ??= 5;
 migrated.preferences.timerMinutes ??= 15;
 migrated.tasks=migrated.tasks.map(t=>({...t,dependsOn:t.dependsOn||null,seriesId:t.seriesId??null,actual:Number(t.actual)||0,remaining:Number(t.remaining??Math.max(0,(Number(t.duration)||0)-(Number(t.actual)||0)))}));
 migrated.routines=migrated.routines.map(r=>({...r,days:Array.isArray(r.days)?r.days:[0,1,2,3,4,5,6]}));
 return migrated;
}
function prepareScheduleModal(){
 const d=todayISO(),todayTasks=state.tasks.filter(t=>t.date===d&&!['completed','skipped'].includes(t.status)).sort((a,b)=>a.start.localeCompare(b.start));
 const routine=getRoutine(),wake=state.wakeRecords[d]?.time||routine?.wake||state.preferences.wake||'06:00';
 const rows=todayTasks.length?todayTasks.map(t=>`<div class="prepare-task-row"><div><strong>${esc(t.title)}</strong><small>${fmtTime(t.start)} · ${Number(t.remaining??t.duration)||t.duration} min · ${esc(t.category||'General')}</small></div><label class="field prepare-choice"><span>When should this happen?</span><select class="select" id="prepare-wake-${t.id}"><option value="after" ${(t.wakePreference||'after')==='after'?'selected':''}>After wake-up</option><option value="before" ${t.wakePreference==='before'?'selected':''}>Before wake-up</option><option value="flexible" ${t.wakePreference==='flexible'?'selected':''}>Flexible / fit around my day</option></select></label></div>`).join(''):`<div class="empty-state"><div class="empty-icon">☀</div><h3>No tasks for today</h3><p>Add today's tasks first. They will appear here so you can choose when they should happen.</p>${button('＋ Add a task','add-task','btn btn-primary')}</div>`;
 modal('Prepare today’s schedule',`<div class="callout"><strong>Today's tasks</strong><br>Review your tasks and tell wisedayZ whether each should happen before or after your wake-up. Your confirmed wake-up time is <strong>${fmtTime(wake)}</strong>. You can also leave a task flexible. Nothing moves until you approve the proposal.</div><div class="prepare-task-list">${rows}</div>`,`<button class="btn" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="build-prepared-schedule" ${todayTasks.length?'':'disabled'}>Prepare proposal</button>`);
}
function createPreparedProposal(){
 const d=todayISO(),todayTasks=state.tasks.filter(t=>t.date===d&&!['completed','skipped'].includes(t.status));
 for(const t of todayTasks){const choice=document.getElementById(`prepare-wake-${t.id}`)?.value;if(choice)t.wakePreference=choice;}
 save();closeModal();const p=createProposal('Prepared today’s schedule using your before/after wake-up preferences');proposalModal(p);
}
function createProposal(reason='User requested a schedule review'){
 const today=todayISO(),routine=getRoutine(),wake=state.wakeRecords[today];
 const plannedWake=routine?.wake||state.preferences.wake||'06:00';
 const actualWake=wake?.time||plannedWake;
 const horizon=7,changes=[],warnings=[],plannedItems=[];
 const priorityRank={high:0,medium:1,low:2};
 const tasks=state.tasks.filter(t=>!['completed','skipped'].includes(t.status)&&t.date<=addDays(today,horizon-1));
 const fixedTasks=tasks.filter(t=>t.fixed);
 const flexibleTasks=tasks.filter(t=>!t.fixed);
 const occupiedByDate={};
 for(let i=0;i<horizon;i++)occupiedByDate[addDays(today,i)]=[];
 for(const t of fixedTasks){
  if(!occupiedByDate[t.date])continue;
  const start=mins(t.start),end=start+t.duration;
  occupiedByDate[t.date].push({start,end,taskId:t.id,fixed:true,title:t.title});
 }
 Object.values(occupiedByDate).forEach(slots=>slots.sort((a,b)=>a.start-b.start));
 flexibleTasks.sort((a,b)=>priorityRank[a.priority]-priorityRank[b.priority]||(a.deadline||'9999-12-31').localeCompare(b.deadline||'9999-12-31')||a.date.localeCompare(b.date)||a.start.localeCompare(b.start));
 for(const t of flexibleTasks){
  const duration=Math.max(5,Number(t.remaining??t.duration)||t.duration);
  const originalDate=t.date,originalStart=t.start;
  let chosen=null,chosenDate=null;
  for(let offset=0;offset<horizon;offset++){
   const date=addDays(today,offset);
   if(date<originalDate)continue; // Never pull a future task earlier than its planned date.
   if(t.deadline&&date>t.deadline)break;
   const r=state.routines.find(x=>x.id===t.routineId)||routine;
   const dayWake=offset===0?actualWake:(r?.wake||state.preferences.wake||'07:00');
   const daySleep=r?.sleep||state.preferences.sleep||'22:30';
   const wakePreference=offset===0?(t.wakePreference||'after'):'after';
   let earliest=wakePreference==='before'?Math.max(240,mins(dayWake)-120):mins(dayWake)+30;
   if(offset>0)earliest=Math.max(earliest,mins(dayWake));
   const latest=wakePreference==='before'?Math.max(earliest,mins(dayWake)-15):mins(daySleep);
   const preferred=(date===originalDate)?mins(originalStart):earliest;
   const slot=findFreeSlot(date,duration,earliest,latest,occupiedByDate[date]||[],preferred);
   if(slot){chosen={...slot};chosenDate=date;break;}
  }
  if(!chosen){warnings.push({taskId:t.id,title:t.title,reason:t.deadline?'No free slot before its deadline':'No suitable slot found within the next seven days'});continue;}
  const newStart=timeOf(chosen.start);
  (occupiedByDate[chosenDate] ||= []).push({start:chosen.start,end:chosen.end,taskId:t.id,fixed:false,title:t.title});
  occupiedByDate[chosenDate].sort((a,b)=>a.start-b.start);
  if(chosenDate!==originalDate||newStart!==originalStart){
   const movedFromPast=originalDate<today;
   changes.push({taskId:t.id,oldDate:originalDate,oldStart:originalStart,newDate:chosenDate,newStart,kind:chosenDate!==today?'carry':'move',reason:movedFromPast?'Bring unfinished work into the next available slot':chosenDate!==originalDate?'Move to the next available day':'Fit around wake-up time and existing commitments',duration,oldStatus:t.status});
  }
 }
 for(const item of workloadWarnings(tasks)){warnings.push({title:fmtDate(item.date,{month:'short',day:'numeric'}),reason:item.reason});}
 const proposal={id:uid(),date:today,reason,createdAt:Date.now(),status:'pending',changes,warnings,horizonDays:horizon,actualWake,plannedWake};
 state.proposals.unshift(proposal);save();return proposal;
}
function proposalModal(p){
 if(!p)return;
 const changes=(p.changes||[]).map(c=>{const t=taskById(c.taskId);return {...c,title:t?.title||'Task',priority:t?.priority||'medium'};});
 const warnings=p.warnings||[];
 modal('Review schedule proposal',`<div class="callout"><strong>Why these changes?</strong><br>${esc(p.reason)}. The planner checks fixed commitments, task duration, priority, deadlines and each routine's sleep window. Your active schedule remains unchanged until approval.</div><div class="grid two-col" style="margin:14px 0"><div class="card card-pad"><div class="small muted">Planned wake-up</div><strong>${fmtTime(p.plannedWake||state.preferences.wake)}</strong></div><div class="card card-pad"><div class="small muted">Confirmed wake-up</div><strong>${fmtTime(p.actualWake||p.plannedWake||state.preferences.wake)}</strong></div></div><div style="margin:15px 0"><div class="section-head"><div class="card-title">${changes.length} suggested changes</div><span class="tag amber">Pending approval</span></div>${changes.length?changes.map(c=>`<div class="proposal-item"><div><strong>${esc(c.title)}</strong><small>${esc(c.reason)} · ${c.duration} min remaining</small><label class="small" style="display:flex;gap:6px;align-items:center;margin-top:7px"><input type="checkbox" class="proposal-check" value="${c.taskId}" checked> Include this change</label></div><div class="time-change"><del>${fmtDate(c.oldDate,{month:'short',day:'numeric'})} ${fmtTime(c.oldStart)}</del><b>${fmtDate(c.newDate,{month:'short',day:'numeric'})} · ${fmtTime(c.newStart)}</b></div></div>`).join(''):'<div class="empty-state"><h3>No schedule changes required</h3><p>Your current tasks fit within the available schedule.</p></div>'}</div>${warnings.length?`<div class="callout" style="margin-top:12px"><strong>Needs your attention (${warnings.length})</strong>${warnings.map(w=>`<p class="small">${esc(w.title)}: ${esc(w.reason)}</p>`).join('')}</div>`:''}<p class="small muted">Completed and fixed tasks are not moved. Unselected tasks remain unchanged. Changes are recorded in task history after approval.</p>`,`<button class="btn" data-action="reject-proposal" data-id="${p.id}">Reject</button><button class="btn btn-primary" data-action="approve-proposal" data-id="${p.id}" ${changes.length?'':'disabled'}>Approve selected changes</button>`);
}
function approveProposal(id){
 const p=state.proposals.find(x=>x.id===id);
 if(!p||p.status!=='pending')return;
 const selected=$$('.proposal-check:checked').map(x=>x.value);
 if(!selected.length){toast('Select at least one proposed change','error');return;}
 const applicable=p.changes.filter(c=>selected.includes(c.taskId));
 // Revalidate each proposal against the live schedule before applying it.
 const movingIds=new Set(applicable.map(c=>c.taskId));
 for(const c of applicable){
  const t=taskById(c.taskId);if(!t||t.fixed||['completed','skipped'].includes(t.status)){toast('A selected task is no longer eligible. Regenerate the proposal.','error');return;}
  const start=mins(c.newStart),end=start+Math.max(5,Number(t.remaining??t.duration)||t.duration);
  const conflict=state.tasks.find(other=>other.id!==t.id&&!movingIds.has(other.id)&&other.date===c.newDate&&!['completed','skipped'].includes(other.status)&&intervalsOverlap(start,end,mins(other.start),mins(other.start)+Math.max(5,Number(other.remaining??other.duration)||other.duration)));
  if(conflict){toast(`Schedule conflict with ${conflict.title}. Regenerate the proposal.`,'error');return;}
 }
 applicable.forEach(c=>{const t=taskById(c.taskId);if(!t)return;const old=`${t.date} ${t.start}`;t.date=c.newDate;t.start=c.newStart;if(t.status==='incomplete')t.status=t.actual>0?'partial':'pending';log('rescheduled',t,`${old} → ${t.date} ${t.start}; ${t.remaining??t.duration} minutes remaining`);});
 p.status='approved';p.approvedAt=Date.now();p.appliedTaskIds=applicable.map(c=>c.taskId);pushNotification('Schedule updated',`${applicable.length} proposed task change(s) were approved.`,'success',`proposal-approved:${p.id}`);save();closeModal();render();toast(`${applicable.length} schedule change${applicable.length===1?'':'s'} approved`,'success');
}
function rejectProposal(id){const p=state.proposals.find(x=>x.id===id);if(p){p.status='rejected';p.rejectedAt=Date.now();pushNotification('Proposal rejected','Your active schedule was left unchanged.','info',`proposal-rejected:${p.id}`);save()}closeModal();toast('Proposal rejected. Your active schedule was not changed.');}
// Expand a recurring task into dated occurrences. Dates are generated in local-calendar
// arithmetic (addDays), bounded to a short initial horizon, and filtered by routine days.
function expandRecurringDates(startDate,repeat,routineId,deadline=''){
 let dates=[startDate];
 if(repeat==='daily')dates=Array.from({length:7},(_,i)=>addDays(startDate,i));
 else if(repeat==='weekdays'){dates=[];for(let i=0;i<14&&dates.length<5;i++){const date=addDays(startDate,i),wd=new Date(date+'T12:00:00').getDay();if(wd>=1&&wd<=5)dates.push(date);}}
 else if(repeat==='weekly')dates=Array.from({length:4},(_,i)=>addDays(startDate,i*7));
 const routine=state.routines.find(r=>r.id===routineId);
 if(routine&&Array.isArray(routine.days)&&repeat!=='none')dates=dates.filter(date=>routine.days.includes(new Date(date+'T12:00:00').getDay()));
 if(deadline)dates=dates.filter(date=>date<=deadline);
 return [...new Set(dates)].sort();
}
function saveTaskFromForm(){
 const f=$('#task-form');if(!f.reportValidity())return;
 const fd=new FormData(f),id=fd.get('id'),existing=id?taskById(id):null;
 const duration=Number(fd.get('duration'));
 if(duration<5||duration>1440){toast('Duration must be between 5 and 1,440 minutes','error');return;}
 const actual=existing?.actual||0;
 if(duration<actual){toast(`Duration cannot be shorter than the ${actual} minutes already recorded`,'error');return;}
 const obj={title:fd.get('title').trim(),date:fd.get('date'),start:fd.get('start'),duration,remaining:existing?(existing.status==='completed'?0:Math.max(0,duration-actual)):duration,priority:fd.get('priority'),category:fd.get('category'),fixed:fd.get('fixed')==='true',routineId:fd.get('routineId')||null,deadline:fd.get('deadline'),repeat:fd.get('repeat'),description:fd.get('description'),status:existing?.status||'pending',actual,dependsOn:fd.get('dependsOn')||null};
 if(obj.dependsOn===id){toast('A task cannot depend on itself','error');return;}
 const prerequisite=obj.dependsOn?taskById(obj.dependsOn):null; if(prerequisite&&dependencyCycle(id,obj.dependsOn)){toast('Circular dependency detected. This prerequisite would create a dependency loop.','error');return;}
 if(prerequisite&&prerequisite.status!=='completed'&&(obj.date<prerequisite.date||(obj.date===prerequisite.date&&mins(obj.start)<mins(prerequisite.start)+Number(prerequisite.remaining??prerequisite.duration)))){toast('Schedule this task after its prerequisite is expected to finish','error');return;}
 if(obj.deadline&&obj.date>obj.deadline){toast('The task date cannot be after its deadline','error');return;}
 let dates=[obj.date];
 if(!existing)dates=expandRecurringDates(obj.date,obj.repeat,obj.routineId,obj.deadline);
 if(!dates.length){toast('No occurrences match the selected routine days and deadline','error');return;}
 // Prevent overlapping appointments and tasks before they enter the active schedule.
 for(const date of dates){
  const start=mins(obj.start),end=start+duration;
  const conflict=state.tasks.find(t=>t.id!==id&&t.date===date&&!['completed','skipped'].includes(t.status)&&intervalsOverlap(start,end,mins(t.start)+0,mins(t.start)+Math.max(5,Number(t.remaining??t.duration)||t.duration)));
  if(conflict){toast(`Time conflict on ${fmtDate(date,{month:'short',day:'numeric'})} with “${conflict.title}”. Choose another time.`,'error');return;}
 }
 if(existing){const series=existing.seriesId?state.tasks.filter(x=>x.seriesId===existing.seriesId&&!['completed','skipped'].includes(x.status)&&x.date>=existing.date):[existing];const applySeries=existing.seriesId&&series.length>1&&confirm(`Apply shared details to ${series.length} remaining occurrence(s) in this recurring series? Choose Cancel to edit only this occurrence.`);if(applySeries){series.forEach(x=>Object.assign(x,{title:obj.title,duration:obj.duration,remaining:x.status==='completed'?0:Math.max(0,obj.duration-(x.actual||0)),priority:obj.priority,category:obj.category,fixed:obj.fixed,routineId:obj.routineId,deadline:obj.deadline,description:obj.description,dependsOn:obj.dependsOn}));log('series-updated',existing,`Updated ${series.length} remaining recurring occurrences`);}else{Object.assign(existing,obj);log('updated',existing,'Task occurrence updated');}}
 else{const seriesId=obj.repeat==='none'?null:uid();for(let index=0;index<dates.length;index++){const date=dates[index];const task={...obj,id:uid(),date,seriesId,occurrenceIndex:index+1,occurrenceCount:dates.length,createdAt:Date.now(),actual:0,remaining:duration};state.tasks.push(task);if(index===0)log('created',task,seriesId?`Recurring series created (${dates.length} occurrences)`:'Task created');}}
 save();closeModal();render();toast(existing?'Task updated':'Task created','success');
}
function markComplete(t){if(!t)return;const blocked=state.tasks.find(x=>x.dependsOn===t.id&&!['completed','skipped'].includes(x.status));if(blocked){toast(`Complete dependent task first: ${blocked.title}`,'error');return;}t.status='completed';t.remaining=0;t.completedAt=Date.now();log('completed',t,'Task marked complete');pushNotification('Task completed',`${t.title} was marked complete.`,'success',`task-completed:${t.id}:${t.completedAt}`);save();render();toast('Task completed. Progress updated.','success')}
function startTask(t){if(!t)return;t.status='progress';t.startedAt=Date.now();log('started',t,'Task started');save();render();toast(`Started: ${t.title}`,'success');}
function saveProgress(id){const t=taskById(id);if(!t)return;const n=Math.max(0,Number($('#task-progress-minutes')?.value||0)),note=$('#task-progress-note')?.value||'';if(n>(t.remaining??t.duration)){toast('Entered time exceeds remaining duration','error');return}t.actual=(t.actual||0)+n;t.remaining=Math.max(0,(t.remaining??t.duration)-n);t.lastProgressAt=Date.now();t.progressNote=note;if(t.remaining===0){t.status='completed';t.completedAt=Date.now();log('completed',t,`Completed after ${t.actual} minutes`)}else if(t.actual>0){t.status='partial';log('partial',t,`${n} minutes recorded; ${t.remaining} minutes remain. ${note}`)}save();closeModal();render();toast(t.status==='completed'?'Task completed':'Progress saved. Remaining time updated','success')}
function recordIncomplete(t){if(!t)return;t.status='incomplete';log('incomplete',t,'Marked incomplete');pushNotification('Task needs rescheduling',`${t.title} has ${t.remaining??t.duration} minutes remaining.`,'warning',`task-incomplete:${t.id}:${todayISO()}`);save();closeModal();render();toast('Task moved to incomplete tasks')}
function addHabit(){modal('Create a habit',`<div class="field"><label>Habit name *</label><input class="input" id="habit-name" placeholder="e.g. Read 20 minutes"></div><div class="field" style="margin-top:12px"><label>Frequency</label><div class="small muted">For this first version, the habit is scheduled every day. You can check in on the days you complete it.</div></div>`,`<button class="btn" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="save-habit">Create habit</button>`)}
function sendChat(){
 const input=$('#chat-input'),msg=input?.value.trim();if(!msg)return;
 const thread=$('#chat-thread');thread.insertAdjacentHTML('beforeend',`<div class="chat-bubble chat-user">${esc(msg)}</div>`);input.value='';
 const reply=document.createElement('div');reply.className='chat-bubble chat-ai';reply.innerHTML='<div class="chat-label">DAYWISE PLANNING HELPER</div>';
 const q=msg.toLowerCase();let action=null,label='';
 if(/incomplete|unfinished|left over|not done/.test(q)){reply.append(document.createTextNode('Here are the tasks that still need attention.'));action='show-incomplete';label='Show incomplete tasks';}
 else if(/report|progress|how did i do|performance/.test(q)){reply.append(document.createTextNode('Open your daily report to review completed tasks and progress.'));action='daily-report';label='Open daily report';}
 else if(/add task|create task|new task/.test(q)){reply.append(document.createTextNode('Use the Add Task button to enter the title, date, time, duration and priority. The task will be checked for schedule conflicts before it is saved.'));action='add-task';label='Add a task';}
 else if(/schedule|plan|rearrange|reschedule|woke|wake up|late/.test(q)){reply.append(document.createTextNode('I can prepare a conflict-aware schedule using your task priorities, fixed commitments, deadlines and wake-up preferences. Review the proposal before applying it.'));action='prepare-schedule';label='Prepare today’s schedule';}
 else{reply.append(document.createTextNode('I can help with your schedule using built-in rules. Try “prepare my schedule”, “show incomplete tasks”, “add a task”, or “review my day”. No external AI service is connected.'));}
 if(action){const b=document.createElement('button');b.className='btn btn-primary btn-small';b.textContent=label;b.dataset.action=action;reply.append(document.createElement('br'),b)}
 thread.append(reply);thread.scrollTop=thread.scrollHeight;
}
//
function saveFocusSession(mode, timer, status = 'completed') {
    const seconds = timer.elapsedSeconds;

    // Ignore accidental sessions shorter than 30 seconds.
    if (seconds < 30) return;

    state.focusSessions.unshift({
        id: uid(),
        date: todayISO(),
        minutes: Math.round(seconds / 60),
        durationSeconds: seconds,
        taskId: timer.taskId || null,
        taskTitle: timer.taskTitle || '',
        type: mode,
        status,
        startedAt: timer.startedAt,
        endedAt: Date.now()
    });

    save();
}

function focusToggle() {
    const mode = focusMode;
    const timer = focusCurrent();

    // Pause the selected timer.
    if (timer.running) {
        timer.running = false;
        clearInterval(timer.interval);
        timer.interval = null;
        render();
        return;
    }

    // Start or resume the selected timer.
    timer.running = true;

    if (!timer.startedAt) {
        timer.startedAt = Date.now();

        const task = taskById(focusTaskId);
        timer.taskId = task?.id || null;
        timer.taskTitle = task?.title || '';
    }

    timer.interval = setInterval(() => {

        if (!timer.running) return;

        timer.elapsedSeconds++;

        if (mode === 'stopwatch') {
            timer.seconds++;
        } else {
            timer.seconds = Math.max(0, timer.seconds - 1);
        }

        // Update the visible clock only for the selected mode.
        if (focusMode === mode && route === 'focus') {
            const clock = $('#focus-clock');

            if (clock) {
                clock.textContent = clockDisplay();
            }
        }

        // Countdown completed.
        if (mode !== 'stopwatch' && timer.seconds <= 0) {

            timer.running = false;
            clearInterval(timer.interval);
            timer.interval = null;

            saveFocusSession(mode, timer, 'completed');

            const configuredMins = mode === 'pomodoro'
                ? (state.preferences.focusMinutes || 25)
                : (state.preferences.timerMinutes || 15);
            timer.seconds = configuredMins * 60;
            timer.elapsedSeconds = 0;
            timer.startedAt = null;
            timer.taskId = null;
            timer.taskTitle = '';

            toast(`${mode} session completed!`, 'success');

            if (focusMode === mode && route === 'focus') {
                render();
            }
        }

    }, 1000);

    render();
}
//
function scanTaskReminders(){
 if(!state.preferences.notifications)return;
 const now=new Date(),today=todayISO(),nowM=now.getHours()*60+now.getMinutes();
 for(const t of state.tasks){
  if(t.date!==today||!['pending'].includes(t.status))continue;
  const start=mins(t.start),delta=start-nowM;
  if(delta>=0&&delta<=10)pushNotification('Upcoming task',`${t.title} starts in ${delta===0?'now':delta+' minute(s)'}.`,'task',`reminder:${t.id}:${today}`);
  else if(delta<0&&delta>=-5)pushNotification('Task start time passed',`${t.title} was scheduled for ${fmtTime(t.start)}. Update its status when ready.`,'warning',`late:${t.id}:${today}`);
 }
}
function requestNotificationPermission(){if(!('Notification' in window)){toast('This browser does not support desktop notifications','error');return}Notification.requestPermission().then(p=>{toast(p==='granted'?'Browser notifications enabled':p==='denied'?'Browser notifications blocked. You can change this in browser settings.':'Permission not granted',p==='granted'?'success':'error');if(p==='granted')scanTaskReminders()})}
function exportFile(name,data,type='application/json'){const blob=new Blob([data],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url)}
function exportCSV(rows,name){const csv=rows.map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');exportFile(name,csv,'text/csv')}
async function handleAction(el,evt){const a=el.dataset.action,id=el.dataset.id;
 switch(a){
  case 'close-account': {
    const root = $('#account-root');
    if (root) {
        root.innerHTML = '';
    }
    setCloudStatus(authSession ? 'Account' : 'Offline');
    break;
  }
  case 'check-app-update':checkForAppUpdate(true);break;
  case 'download-app-update':downloadAppUpdate();break;
  case 'toggle-theme':toggleTheme();break;
  case 'open-account':showAccount();break;
  case 'save-api-base':{const v=$('#api-base-input')?.value.trim().replace(/\/$/,'');if(!v||!/^https?:\/\//.test(v)){toast('Enter a valid http(s) API endpoint','error');break}localStorage.setItem('daywise.apiBase',v);location.reload();break}
  case 'pull-cloud':restoreCloudWorkspace();break;
  case 'keep-local':{try{const ws=await apiRequest('/api/workspace');cloudVersion=ws.version||0;syncPending=true;await flushCloudSync();$('#account-root').innerHTML='';toast('Local workspace uploaded','success')}catch(err){toast(err.message,'error')}break}
  case 'logout':{if(localStorage.getItem(QUEUE_KEY)&&!confirm('There are unsynced changes saved in this browser. Sign out and keep them queued for your next sign-in?'))break;try{await apiRequest('/api/auth/logout',{method:'POST',body:'{}'})}catch{}authSession=null;localStorage.removeItem(AUTH_KEY);cloudVersion=0;setCloudStatus('Offline');$('#account-root').innerHTML='';toast('Signed out. Local data remains on this browser.');break}
  case 'backdrop-close':
  case 'close-modal':closeModal();break;
  case 'add-task':taskForm(null,el.dataset.date||selectedDate);break;
  case 'edit-task':taskForm(taskById(id));break;
  case 'view-task':taskDetail(id);break;
  case 'save-task':saveTaskFromForm();break;
  case 'delete-task':{const t=taskById(id);if(t){const mode=t.seriesId?prompt('Delete recurring task: enter 1 for this occurrence, 2 for this and future occurrences, or 3 for the entire series.','1'):'1';if(!['1','2','3'].includes(mode))break;const removed=t.seriesId?state.tasks.filter(x=>x.seriesId===t.seriesId&&(mode==='3'||(mode==='2'&&x.date>=t.date)||x.id===id)):[t];if(!confirm(`Delete ${removed.length} occurrence(s)? This cannot be undone.`))break;const removedIds=new Set(removed.map(x=>x.id));state.tasks=state.tasks.filter(x=>!removedIds.has(x.id));state.tasks.forEach(x=>{if(removedIds.has(x.dependsOn))x.dependsOn=null});log('deleted',t,`${removed.length} recurring occurrence(s) deleted; prerequisite links cleared`);save();closeModal();render();toast(`${removed.length} occurrence(s) deleted`)}break}
  case 'start-task':startTask(taskById(id));break;
  case 'complete-task':markComplete(taskById(id));break;
  case 'mark-complete':markComplete(taskById(id));break;
  case 'skip-task':{const t=taskById(id);if(t){t.status='skipped';log('skipped',t,'Task skipped');save();closeModal();render();toast('Task marked as skipped')}break}
  case 'mark-incomplete':recordIncomplete(taskById(id));break;
  case 'save-progress':saveProgress(id);break;
  case 'wake-confirm':wakeConfirm();break;
  case 'save-wake':{const time=$('#wake-actual').value;if(!time){toast('Choose your actual wake-up time','error');break}state.wakeRecords[todayISO()]={time,at:Date.now()};save();closeModal();render();toast('Wake-up recorded. Prepare today’s schedule when ready.','success');prepareScheduleModal();break}
  case 'wake-info':go('alarm');break;
  case 'prepare-schedule':prepareScheduleModal();break;
  case 'build-prepared-schedule':createPreparedProposal();break;
  case 'reschedule':{const p=createProposal('Schedule review requested');proposalModal(p);break}
  case 'open-proposal':proposalModal(state.proposals.find(p=>p.id===id));break;
  case 'approve-proposal':approveProposal(id);break;
  case 'reject-proposal':rejectProposal(id);break;
  case 'add-routine':routineForm();break;
  case 'edit-routine':routineForm(state.routines.find(r=>r.id===id));break;
  case 'save-routine':{const f=$('#routine-form');if(!f.reportValidity())break;const fd=new FormData(f),rid=fd.get('id'),r=rid?state.routines.find(x=>x.id===rid):{id:uid(),active:false,color:'teal'};Object.assign(r,{name:fd.get('name').trim(),description:fd.get('description'),wake:fd.get('wake'),sleep:fd.get('sleep'),days:fd.getAll('days').map(Number)});if(!r.days.length){toast('Select at least one active day','error');break}if(!rid)state.routines.push(r);log(rid?'updated':'created',null,`Routine ${r.name} ${rid?'updated':'created'}`);save();closeModal();render();toast('Routine saved','success');break}
  case 'activate-routine':{const r=state.routines.find(x=>x.id===id);if(r){const previousRoutine=state.activeRoutine;const affected=state.tasks.filter(t=>t.routineId===previousRoutine&&!['completed','skipped'].includes(t.status));const migrate=affected.length&&confirm(`Activate ${r.name}? ${affected.length} active task(s) belong to another routine. Move these tasks to this routine? Choose Cancel to switch routines without moving tasks.`);if(migrate)affected.forEach(t=>{t.routineId=id;log('routine-moved',t,`Moved to ${r.name}`)});state.activeRoutine=id;r.active=true;state.routines.forEach(x=>x.active=x.id===id);state.preferences.wake=r.wake;state.preferences.sleep=r.sleep;save();render();toast(`${r.name} activated`,'success')}break}
  case 'routine-menu':{const r=state.routines.find(x=>x.id===id);if(r&&confirm(`Delete routine “${r.name}”? Tasks already created will be kept.`)){state.routines=state.routines.filter(x=>x.id!==id);if(state.activeRoutine===id)state.activeRoutine=state.routines[0]?.id||null;save();render();toast('Routine deleted')}break}
  case 'date-prev':selectedDate=addDays(selectedDate,-1);render();break;
  case 'date-next':selectedDate=addDays(selectedDate,1);render();break;
  case 'week-prev':weekOffset--;render();break;
  case 'week-next':weekOffset++;render();break;
  case 'week-now':weekOffset=0;render();break;
  case 'month-prev':monthOffset--;render();break;
  case 'month-next':monthOffset++;render();break;
  case 'month-now':monthOffset=0;render();break;
  case 'select-calendar-day':selectedDate=el.dataset.date;go('daily');break;
  case 'set-insight-period':
    insightPeriod = el.dataset.period || 'weekly';
    render();
    break;
  case 'focus-mode':
  case 'set-focus-mode': {
    const newMode = el.dataset.mode;

    if (!focusTimers[newMode]) break;

    // Only change the selected mode.
    // Other timers continue running independently.
    focusMode = newMode;

    if (route === 'focus') {
        render();
    } else {
        go('focus');
    }

    break;
  }
  case 'focus-toggle': {
    focusToggle();
    break;
  }
  case 'focus-reset': {
    const timer = focusCurrent();

    timer.running = false;
    clearInterval(timer.interval);
    timer.interval = null;

    // Save any meaningful work before resetting.
    saveFocusSession(focusMode, timer, 'interrupted');

    if (focusMode === 'stopwatch') {
        timer.seconds = 0;
    } else {
        timer.seconds = focusMode === 'pomodoro'
            ? (state.preferences.focusMinutes || 25) * 60
            : (state.preferences.timerMinutes || 15) * 60;
    }

    timer.elapsedSeconds = 0;
    timer.startedAt = null;
    timer.taskId = null;
    timer.taskTitle = '';

    render();
    break;
  }
  case 'save-focus-settings': {
    const m = Math.max(
        1,
        Math.min(180, Number($('#focus-minutes')?.value) || 25)
    );
    const b = Math.max(
        1,
        Math.min(60, Number($('#break-minutes')?.value) || 5)
    );

    const timer = focusTimers.pomodoro;

    if (timer.running) {
        toast('Pause Pomodoro before changing its duration.', 'error');
        break;
    }

    state.preferences.focusMinutes = m;
    state.preferences.breakMinutes = b;
    timer.seconds = m * 60;
    timer.elapsedSeconds = 0;
    timer.startedAt = null;
    save();

    render();
    toast('Pomodoro duration updated.', 'success');
    break;
  }
  case 'add-habit':
    addHabit();
    break;
  case 'save-habit': {
    const name = $('#habit-name')?.value.trim();
    if (!name) { toast('Enter a habit name', 'error'); break; }
    state.habits.push({ id: uid(), name, days: [1, 2, 3, 4, 5, 6, 0], done: [] });
    log('created', null, `Habit "${name}" created`);
    save();
    closeModal();
    render();
    toast('Habit created', 'success');
    break;
  }
  case 'toggle-habit': {
    const h = state.habits.find(x => x.id === id);
    if (!h) break;
    const d = todayISO();
    const idx = h.done.indexOf(d);
    if (idx >= 0) h.done.splice(idx, 1);
    else h.done.push(d);
    save();
    render();
    break;
  }
  case 'send-chat':
    sendChat();
    break;
  case 'show-incomplete':
    go('incomplete');
    break;
  case 'daily-report':
    go('report');
    break;
  case 'save-settings': {
    state.preferences.wake = $('#pref-wake')?.value || state.preferences.wake;
    state.preferences.sleep = $('#pref-sleep')?.value || state.preferences.sleep;
    state.preferences.defaultDuration = Math.max(5, Number($('#pref-duration')?.value) || 60);
    state.preferences.quiet = Boolean($('#pref-quiet')?.checked);
    state.preferences.notifications = Boolean($('#pref-notifications')?.checked);
    log('updated', null, 'Planning preferences saved');
    save();
    render();
    toast('Preferences saved', 'success');
    break;
  }
  case 'save-profile': {
    const name = $('#profile-name')?.value.trim();
    const email = $('#profile-email')?.value.trim();
    if (!name) { toast('Name cannot be empty', 'error'); break; }
    state.user.name = name;
    if (email) state.user.email = email;
    log('updated', null, 'Profile updated');
    save();
    render();
    toast('Profile saved', 'success');
    break;
  }
  case 'save-alarm': {
    const wake = $('#alarm-time')?.value;
    if (!wake) { toast('Choose a wake-up time', 'error'); break; }
    const r = getRoutine();
    if (r) r.wake = wake;
    state.preferences.wake = wake;
    log('updated', null, `Wake-up time set to ${fmtTime(wake)}`);
    save();
    render();
    toast('Wake-up time saved', 'success');
    break;
  }
  case 'mark-all-read':
    state.notifications.forEach(n => { n.read = true; });
    save();
    render();
    toast('All notifications marked as read');
    break;
  case 'read-notification': {
    const n = state.notifications.find(x => x.id === id);
    if (n) { n.read = !n.read; save(); render(); }
    break;
  }
  case 'notification-settings':
    requestNotificationPermission();
    break;
  case 'export-data':
    exportFile(`wisedayz-backup-${todayISO()}.json`, JSON.stringify(state, null, 2));
    toast('Backup exported', 'success');
    break;
  case 'reset-data':
    if (confirm('Reset workspace to sample data? Current local changes will be replaced.')) {
      localStorage.removeItem(STORE);
      state = defaultState();
      save();
      render();
      toast('Sample workspace restored');
    }
    break;
  case 'export-history':
    exportCSV(
      [['Time', 'Type', 'Title', 'Detail'], ...state.history.map(h => [new Date(h.at).toISOString(), h.type, h.title, h.detail || ''])],
      `wisedayz-history-${todayISO()}.csv`
    );
    toast('History CSV exported', 'success');
    break;
  case 'export-report': {
    const d = todayISO();
    const dayTasks = state.tasks.filter(t => t.date === d);
    exportCSV(
      [['Title', 'Start', 'Duration (min)', 'Remaining (min)', 'Priority', 'Status'], ...dayTasks.map(t => [t.title, t.start, t.duration, t.remaining ?? t.duration, t.priority, t.status])],
      `wisedayz-report-${d}.csv`
    );
    toast('Daily report CSV exported', 'success');
    break;
  }
 }
}
document.addEventListener('click',e=>{
 const mode=e.target.closest('[data-account-mode]');if(mode){const register=mode.dataset.accountMode==='register';$('#account-name-wrap').hidden=!register;$('#account-submit').textContent=register?'Create account':'Sign in';$('#account-form').dataset.mode=register?'register':'login';$('#account-form').querySelector('[name=password]').setAttribute('autocomplete',register?'new-password':'current-password');return}
 const el=e.target.closest('[data-action]');if(el){e.preventDefault();if(['open-account'].includes(el.dataset.action)){showAccount();return}if(el.dataset.action==='close-account'&&e.target.closest('.account-panel')&&!e.target.matches('button'))return;if(el.dataset.action==='backdrop-close'&&e.target!==el)return;handleAction(el,e)}
});
document.addEventListener('submit',async e=>{if(e.target.id!=='account-form')return;e.preventDefault();const form=e.target,fd=new FormData(form),mode=form.dataset.mode||'login',error=$('#account-error');error.textContent='';const submit=$('#account-submit');submit.disabled=true;submit.textContent='Please wait…';try{const body={email:fd.get('email'),password:fd.get('password')};if(mode==='register')body.name=fd.get('name');await finishAuth(mode==='register'?'/api/auth/register':'/api/auth/login',body)}catch(err){error.textContent=err.message}finally{if(submit.isConnected){submit.disabled=false;submit.textContent=mode==='register'?'Create account':'Sign in'}}});
document.addEventListener('change',e=>{if(e.target.id==='selected-date'){selectedDate=e.target.value;render()}if(e.target.id==='insight-date'){insightDate=e.target.value;render()}if(e.target.id==='focus-task')focusTaskId=e.target.value;if(e.target.id==='import-data'&&e.target.files[0]){const reader=new FileReader();reader.onload=()=>{try{const imported=JSON.parse(reader.result);validateBackup(imported);if(confirm(`Restore ${imported.tasks.length} tasks and ${imported.routines.length} routines? Current browser data will be replaced.`)){state=migrateImportedState(imported);save();render();toast('Backup validated and restored','success')}}catch(err){toast('Could not import this backup: '+err.message,'error')}};reader.readAsText(e.target.files[0])}});
document.addEventListener('input',e=>{if(e.target.id==='task-search'||e.target.id==='task-filter'||e.target.id==='task-sort'){const q=($('#task-search')?.value||'').toLowerCase(),filter=$('#task-filter')?.value||'all',sort=$('#task-sort')?.value||'date';let list=state.tasks.filter(t=>(t.title+' '+t.category).toLowerCase().includes(q)&&(filter==='all'||t.status===filter));list.sort((a,b)=>sort==='title'?a.title.localeCompare(b.title):sort==='priority'?({high:0,medium:1,low:2}[a.priority]-{high:0,medium:1,low:2}[b.priority]):a.date.localeCompare(b.date));$('#task-table-container').innerHTML=taskTable(list)}});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='chat-input'){e.preventDefault();sendChat()}});
$('#notification-button').addEventListener('click',()=>go('notifications'));$('#profile-shortcut').addEventListener('click',()=>go('profile'));
$('#menu-toggle')?.addEventListener('click',()=>$('#sidebar')?.classList.toggle('open'));
$('#quick-search')?.addEventListener('click',()=>{go('tasks');setTimeout(()=>$('#task-search')?.focus(),0)});
applyTheme();updateBadges();render();validateSavedSession();scanTaskReminders();setInterval(scanTaskReminders,30000);setTimeout(()=>checkForAppUpdate(false),4500);
