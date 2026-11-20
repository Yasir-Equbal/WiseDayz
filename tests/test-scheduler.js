const fs=require('fs'), vm=require('vm');
const appPath=process.argv[2] || require('path').join(__dirname,'..','app.js');
const src=fs.readFileSync(appPath,'utf8');
const a=src.indexOf('function intervalsOverlap'), b=src.indexOf('function proposalModal');
const scheduler=src.slice(a,b);
const today='2026-11-18';
const state={preferences:{wake:'06:00',sleep:'22:30'},routines:[{id:'r1',wake:'06:00',sleep:'22:00'}],activeRoutine:'r1',wakeRecords:{[today]:{time:'08:00'}},proposals:[],tasks:[
{id:'fixed',title:'College',date:today,start:'10:00',duration:300,remaining:300,priority:'high',fixed:true,status:'pending',routineId:'r1'},
{id:'flex1',title:'Study',date:today,start:'07:00',duration:90,remaining:90,priority:'high',fixed:false,status:'pending',routineId:'r1'},
{id:'partial',title:'Reading',date:'2026-11-17',start:'20:00',duration:60,remaining:35,priority:'medium',fixed:false,status:'partial',actual:25,routineId:'r1'},
{id:'future',title:'Tomorrow task',date:'2026-11-19',start:'15:00',duration:60,remaining:60,priority:'low',fixed:false,status:'pending',routineId:'r1'}]};
const ctx={state,uid:()=>`p${state.proposals.length+1}`,todayISO:()=>today,addDays:(iso,n)=>{let d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)},mins:t=>{let [h,m]=t.split(':').map(Number);return h*60+m},timeOf:n=>`${String(Math.floor(n/60)%24).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`,getRoutine:()=>state.routines[0],save:()=>{}};
vm.createContext(ctx);vm.runInContext(scheduler,ctx);
const p=vm.runInContext("createProposal('test')",ctx);
const byId=Object.fromEntries(p.changes.map(c=>[c.taskId,c]));
if(!byId.flex1) throw Error('Expected today flexible task to move after wake-up');
if(byId.flex1.newDate!==today || byId.flex1.newStart<'08:30') throw Error('Wake-up constraint failed');
if(!byId.partial || byId.partial.duration!==35) throw Error('Partial remaining duration was not preserved');
if(byId.future && byId.future.newDate<='2026-11-18') throw Error('Future task was pulled earlier');
const fixed={start:600,end:900};
for(const c of p.changes){if(c.newDate===today){const start=ctx.mins(c.newStart),end=start+c.duration;if(start<fixed.end&&end>fixed.start)throw Error('Proposal overlaps fixed commitment');}}
console.log(JSON.stringify({proposalChanges:p.changes,warnings:p.warnings,checks:['wake-up start respected','fixed commitment protected','partial remaining duration preserved','future tasks not pulled earlier']},null,2));
