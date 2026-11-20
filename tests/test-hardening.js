const fs=require('fs'),vm=require('vm'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
function extract(name,next){const a=src.indexOf(`function ${name}`),b=src.indexOf(`function ${next}`,a);if(a<0||b<0)throw Error(`Missing ${name}`);return src.slice(a,b)}
const tasks=[{id:'a',dependsOn:null},{id:'b',dependsOn:'a'},{id:'c',dependsOn:'b'}];
const ctx={state:{tasks,routines:[]}};vm.createContext(ctx);
vm.runInContext(extract('dependencyCycle','workloadWarnings'),ctx);
if(!vm.runInContext("dependencyCycle('a','c')",ctx))throw Error('Long dependency cycle was not detected');
if(vm.runInContext("dependencyCycle('c','a')",ctx))throw Error('Valid dependency chain was rejected');
vm.runInContext(extract('workloadWarnings','validateBackup'),ctx);
const overloaded=vm.runInContext("workloadWarnings([{date:'2026-11-18',duration:400,remaining:400,status:'pending'},{date:'2026-11-18',duration:250,remaining:250,status:'partial'},{date:'2026-11-19',duration:900,remaining:900,status:'completed'}])",ctx);
if(overloaded.length!==1||overloaded[0].total!==650)throw Error('Workload warning threshold/filter failed');
vm.runInContext(extract('validateBackup','migrateImportedState'),ctx);
const valid={tasks:[{id:'t1',title:'Task',date:'2026-11-18',start:'09:00',duration:30,routineId:'r1'}],routines:[{id:'r1'}]};
if(!vm.runInContext('validateBackup('+JSON.stringify(valid)+')',ctx))throw Error('Valid backup rejected');
for(const bad of [{tasks:[{...valid.tasks[0],routineId:'missing'}],routines:[{id:'r1'}]},{tasks:[{...valid.tasks[0],id:'t1'},{...valid.tasks[0],id:'t1'}],routines:[{id:'r1'}]}]){let rejected=false;try{vm.runInContext('validateBackup('+JSON.stringify(bad)+')',ctx)}catch{rejected=true}if(!rejected)throw Error('Invalid backup accepted')}
vm.runInContext(extract('migrateImportedState','createProposal'),ctx);
const migrated=vm.runInContext('migrateImportedState('+JSON.stringify({tasks:[{id:'old',title:'Old',duration:50,actual:10}],routines:[{id:'r'}]})+')',ctx);
if(migrated.schemaVersion!==6||migrated.tasks[0].remaining!==40||migrated.tasks[0].dependsOn!==null)throw Error('Legacy backup migration failed');
console.log(JSON.stringify({checks:['multi-level dependency cycles detected','valid dependency chains accepted','daily workload overload threshold and completed-task exclusion','valid backup accepted','invalid backup rejected','legacy backup migrated with progress preserved']},null,2));
