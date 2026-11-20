const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf8');
const extract = (name, next) => src.slice(src.indexOf(`function ${name}`), src.indexOf(`function ${next}`));
const pushSrc = extract('pushNotification', 'toast');
const reminderSrc = extract('scanTaskReminders', 'requestNotificationPermission');
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
const plus = new Date(now.getTime()+5*60000);
const start = `${String(plus.getHours()).padStart(2,'0')}:${String(plus.getMinutes()).padStart(2,'0')}`;
const state = {notifications:[],preferences:{notifications:true},tasks:[
  {id:'due-soon',title:'Test reminder',date:today,start,status:'pending'},
  {id:'done',title:'Already done',date:today,start,status:'completed'}
]};
const ctx = {state,uid:(()=>{let n=0;return()=>`n${++n}`})(),save(){},window:{},Notification:undefined,
  todayISO:()=>today,mins:t=>{const [h,m]=t.split(':').map(Number);return h*60+m},
  fmtTime:t=>t,Date,console};
vm.createContext(ctx);
vm.runInContext(pushSrc+reminderSrc,ctx);
vm.runInContext('scanTaskReminders()',ctx);
if(state.notifications.length!==1)throw new Error(`Expected one due reminder, got ${state.notifications.length}`);
if(!state.notifications[0].message.includes('starts in'))throw new Error('Reminder message missing timing');
vm.runInContext('scanTaskReminders()',ctx);
if(state.notifications.length!==1)throw new Error('Reminder deduplication failed');
vm.runInContext("pushNotification('Test','Message','info','manual-key'); pushNotification('Test','Message','info','manual-key')",ctx);
if(state.notifications.length!==2)throw new Error('Notification key deduplication failed');
state.preferences.notifications=false;
vm.runInContext('scanTaskReminders()',ctx);
if(state.notifications.length!==2)throw new Error('Disabled notifications should not create reminders');
console.log(JSON.stringify({checks:['upcoming task reminder created','completed task ignored','repeat scan deduplicated','manual notification key deduplicated','notification preference respected']},null,2));
