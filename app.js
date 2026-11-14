import {today,monday,addDays,formatMinutes,duration,validateEntry,validateProfile,ledger} from './core.js';
import * as db from './store.js';
const $=id=>document.getElementById(id);
let state={profile:null,entries:[]}, editing=null, undone=null, busy=false, lastDay=today();
const displayDate=day=>new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'));
function announce(text){$('message').textContent=text;$('message').hidden=!text;}
function switchTab(history){$('spend-panel').hidden=history;$('history-panel').hidden=!history;for(const [id,active] of [['history-tab',history],['spend-tab',!history]]){$(id).classList.toggle('active',active);$(id).setAttribute('aria-pressed',String(active));}}
function resetForm(){editing=null;$('spend-form').reset();$('spent-on').value=today();$('form-title').textContent='What did you get up to?';$('save').textContent='Save time spent ↗';$('cancel-edit').hidden=true;$('form-error').textContent='';updatePreview();}
function getMinutes(){const mode=document.querySelector('input[name=mode]:checked').value;if(mode==='times')return duration($('start-time').value,$('end-time').value,$('next-day').checked);const h=Number($('hours').value),m=Number($('minutes').value);if(!Number.isInteger(h)||!Number.isInteger(m)||h<0||h>24||m<0||m>59)throw Error('Use whole hours and minutes.');return h*60+m;}
function updatePreview(){const timed=document.querySelector('input[name=mode]:checked').value==='times';$('duration-fields').hidden=timed;$('time-fields').hidden=!timed;for(const id of ['hours','minutes'])$(id).disabled=timed;for(const id of ['start-time','end-time','next-day'])$(id).disabled=!timed;$('start-time').required=timed;$('end-time').required=timed;try{const minutes=getMinutes();$('duration-preview').textContent=minutes>0?`${formatMinutes(minutes)} will be deducted`:'Enter time spent';}catch{$('duration-preview').textContent='Enter a start and end time';}}
function draw(){
 const asOf=today();lastDay=asOf;const rows=ledger(state.profile,state.entries,asOf);const balance=rows.at(-1)?.balance||0;const week=monday(asOf);const spends=rows.filter(r=>r.kind==='spend');
 $('balance').textContent=formatMinutes(balance);$('balance').classList.toggle('negative',balance<0);$('balance-note').textContent=balance<0?'You have used some time in advance. Future credits will cover it.':'Your next adventure is on the clock.';
 $('week-spent').textContent=formatMinutes(-spends.filter(r=>r.day>=week).reduce((n,r)=>n+r.minutes,0));
 $('total-gained').textContent=formatMinutes(rows.filter(r=>r.kind==='credit').reduce((n,r)=>n+r.minutes,0));$('total-spent').textContent=formatMinutes(-spends.reduce((n,r)=>n+r.minutes,0));
 $('next-credit').textContent=`Next credit: ${displayDate(addDays(week,7))}`;
 const prior=rows.filter(r=>r.day<week).at(-1)?.balance||0;$('carryover').textContent=`Carried into this week: ${formatMinutes(prior)}`;
 $('spent-on').min=state.profile.start_week;$('spent-on').max=asOf;$('start-week').max=asOf;
 $('storage-label').textContent=db.cloudEnabled?'Synced with your account':'Saved on this browser only';
 const list=$('history-list');list.replaceChildren();
 for(const row of [...rows].reverse()){
  const element=document.createElement('article');element.className='history-row '+row.kind;
  const icon=document.createElement('span');icon.className='transaction-icon';icon.setAttribute('aria-hidden','true');icon.textContent=row.kind==='spend'?'↗':'+';
  const detail=document.createElement('div');const title=document.createElement('h3');title.textContent=row.note||(row.kind==='spend'?'Time spent':'Weekly allowance');const date=document.createElement('p');date.textContent=displayDate(row.day)+(row.start_time?` · ${row.start_time.slice(0,5)}–${row.end_time.slice(0,5)}${row.next_day?' (+1 day)':''}`:'');detail.append(title,date);
  if(row.kind==='spend'){const actions=document.createElement('div');actions.className='row-actions';for(const [name,action] of [['Edit',()=>edit(row.id)],['Remove',()=>remove(row.id)]]){const button=document.createElement('button');button.textContent=name;button.setAttribute('aria-label',`${name} ${row.note||'time spent'} on ${displayDate(row.day)}`);button.onclick=()=>!busy&&action();actions.append(button);}detail.append(actions);}
  const amounts=document.createElement('div');amounts.className='transaction-amount';const amount=document.createElement('strong');amount.textContent=formatMinutes(row.minutes,true);const after=document.createElement('small');after.textContent=`${formatMinutes(row.balance)} balance`;amounts.append(amount,after);element.append(icon,detail,amounts);list.append(element);
 }
}
async function lock(action,errorTarget){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);if(errorTarget)$(errorTarget).textContent='';try{await action();}catch(error){if(db.cloudEnabled&&!db.signedIn()){$('auth').hidden=false;$('dashboard').hidden=true;$('signout').hidden=true;}if(errorTarget)$(errorTarget).textContent=error.message;else announce(error.message);}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}}
function openSettings(){const p=state.profile||db.newProfile();$('start-week').value=p.start_week;$('opening-hours').value=String(p.opening_minutes/60);$('settings-error').textContent='';$('close-settings').hidden=!state.profile;$('settings-dialog').showModal();}
async function boot(){
 $('auth').hidden=true;$('dashboard').hidden=true;for(const id of ['settings','refresh','signout'])$(id).hidden=true;
 if(db.cloudEnabled&&!db.signedIn()){$('auth').hidden=false;return;}
 $('refresh').hidden=false;$('signout').hidden=!db.cloudEnabled;
 state=await db.load();
 if(!state.profile){openSettings();return;}
 validateProfile(state.profile);$('dashboard').hidden=false;$('settings').hidden=false;$('refresh').hidden=false;$('signout').hidden=!db.cloudEnabled;
 if(!db.cloudEnabled)announce('Cloud storage is not connected yet. This version saves only in this browser. Export your history to keep a backup.');else announce('');
 draw();resetForm();
}
function edit(id){const entry=state.entries.find(e=>e.id===id);editing=id;$('spent-on').value=entry.spent_on;$('hours').value=Math.floor(entry.minutes/60);$('minutes').value=entry.minutes%60;$('note').value=entry.note;$('start-time').value=entry.start_time?.slice(0,5)||'';$('end-time').value=entry.end_time?.slice(0,5)||'';$('next-day').checked=entry.next_day;document.querySelector(`input[name=mode][value=${entry.start_time?'times':'duration'}]`).checked=true;$('form-title').textContent='Edit your time spent.';$('save').textContent='Save changes ↗';$('cancel-edit').hidden=false;switchTab(false);updatePreview();$('spent-on').focus();}
async function remove(id){await lock(async()=>{const entry=state.entries.find(e=>e.id===id);const saved=await db.saveEntry({...entry,deleted_at:new Date().toISOString()},state);state.entries=state.entries.map(e=>e.id===id?saved:e);undone=id;$('undo-bar').hidden=false;draw();});}
$('undo').onclick=()=>lock(async()=>{const entry=state.entries.find(e=>e.id===undone);if(!entry)return;const saved=await db.saveEntry({...entry,deleted_at:null},state);state.entries=state.entries.map(e=>e.id===saved.id?saved:e);undone=null;$('undo-bar').hidden=true;draw();});
$('spend-tab').onclick=()=>switchTab(false);$('history-tab').onclick=()=>switchTab(true);$('settings').onclick=openSettings;$('close-settings').onclick=()=>$('settings-dialog').close();$('settings-dialog').addEventListener('cancel',e=>{if(!state.profile)e.preventDefault();});$('cancel-edit').onclick=resetForm;
$('spend-form').addEventListener('input',updatePreview);
$('spend-form').onsubmit=e=>{e.preventDefault();lock(async()=>{const timed=document.querySelector('input[name=mode]:checked').value==='times';const old=state.entries.find(e=>e.id===editing);const entry={id:editing||crypto.randomUUID(),spent_on:$('spent-on').value,minutes:getMinutes(),note:$('note').value.trim(),start_time:timed?$('start-time').value:null,end_time:timed?$('end-time').value:null,next_day:timed&&$('next-day').checked,created_at:old?.created_at||new Date().toISOString(),deleted_at:null};validateEntry(entry,state.profile);const saved=await db.saveEntry(entry,state);state.entries=editing?state.entries.map(item=>item.id===editing?saved:item):[...state.entries,saved];draw();resetForm();$('duration-preview').textContent='Saved. Your balance is up to date.';},'form-error');};
$('settings-form').onsubmit=e=>{e.preventDefault();lock(async()=>{const profile={start_week:$('start-week').value,opening_minutes:Math.round(Number($('opening-hours').value)*60)};validateProfile(profile);if(state.entries.some(entry=>entry.spent_on<profile.start_week))throw Error('The starting week must be on or before your earliest spending entry, including removed entries.');const saved=await db.saveProfile(profile,state);state.profile=saved;$('settings-dialog').close();await boot();},'settings-error');};
$('auth-form').onsubmit=e=>{e.preventDefault();lock(async()=>{await db.login($('email').value.trim(),$('password').value);$('password').value='';await boot();},'auth-feedback');};
$('signup').onclick=()=>{if(!$('auth-form').reportValidity())return;lock(async()=>{await db.signup($('email').value.trim(),$('password').value);$('password').value='';if(db.signedIn())await boot();else $('auth-feedback').textContent='Check your email to confirm your account, then return here and sign in.';},'auth-feedback');};
$('signout').onclick=()=>lock(async()=>{await db.logout();state={profile:null,entries:[]};editing=null;undone=null;$('undo-bar').hidden=true;await boot();});
$('refresh').onclick=()=>lock(async()=>{if(editing)throw Error('Save or cancel your edit before refreshing.');await boot();});
$('export').onclick=()=>{const exportData={exported_at:new Date().toISOString(),timezone:'Europe/Ljubljana',weekly_minutes:600,...state,ledger:ledger(state.profile,state.entries)};const url=URL.createObjectURL(new Blob([JSON.stringify(exportData,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`time-bank-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
function rollover(){if(state.profile&&today()!==lastDay)try{draw();}catch(error){announce(error.message);}}
setInterval(rollover,30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)rollover();});
lock(boot);
