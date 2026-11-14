import { config } from './config.js';
import { preparePassword } from './password.js';
import { normalizeUsername, usernameIdentity } from './username.js';
import { monday, today } from './core.js';
const LOCAL_KEY = 'time-bank-local-v1';
const SESSION_KEY = 'time-bank-session-v1';
export const cloudEnabled = Boolean(config.url && config.publishableKey);
let session = null;
try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch {}
const persistSession = value => { session = value; value ? localStorage.setItem(SESSION_KEY,JSON.stringify(value)) : localStorage.removeItem(SESSION_KEY); };
export const signedIn = () => Boolean(session?.user?.id);
export const accountUsername = () => session?.user?.user_metadata?.time_bank_username || '';
let refreshing;
async function refresh() {
  if (!refreshing) refreshing = (async()=> {
    const response = await fetch(config.url + '/auth/v1/token?grant_type=refresh_token', {method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});
    const data = await response.json();
    if (!response.ok) { if (response.status === 400 || response.status === 401) persistSession(null); throw Error(data.msg || 'Session expired. Sign in again.'); }
    persistSession({...data,expires_at:Math.floor(Date.now()/1000)+data.expires_in});
  })().finally(()=>{refreshing=null;});
  return refreshing;
}
async function auth(path, body) {
  const response = await fetch(config.url+'/auth/v1/'+path,{method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data = await response.json();
  if (!response.ok) { const error=Error(data.msg || data.error_description || data.message || 'Unable to sign in.');error.status=response.status;error.code=data.error_code||data.code;throw error; }
  if (data.access_token) persistSession({...data,expires_at:Math.floor(Date.now()/1000)+data.expires_in});
  return data;
}
export async function login(username,password) {
 const email=usernameIdentity(username);
 const prepared=await preparePassword(username,password);
 try { return await auth('token?grant_type=password',{email,password:prepared}); }
 catch(error) {
  // Accounts created before this change retain their original passwords.
  const invalid=error.code==='invalid_credentials'||error.message==='Invalid login credentials';
  if(error.status===400&&invalid&&password.length>=8)return auth('token?grant_type=password',{email,password});
  throw error;
 }
}
export async function signup(username,password) {
 username=normalizeUsername(username);
 const response=await fetch(config.url+'/functions/v1/time-bank-signup',{method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({username,password})});
 const data=await response.json();
 if(!response.ok)throw Error(data.message||'Unable to create your account.');
 return login(username,password);
}
export async function logout() {
  try { if (session) await fetch(config.url+'/auth/v1/logout',{method:'POST',headers:{apikey:config.publishableKey,Authorization:'Bearer '+session.access_token}}); }
  finally { persistSession(null); }
}
async function request(table, query='', method='GET', body, retry=true) {
  if (!session) throw Error('Sign in to access your hours.');
  if (!session.expires_at || session.expires_at <= Date.now()/1000 + 60) await refresh();
  const response = await fetch(`${config.url}/rest/v1/rpc/${table}`, {method,headers:{apikey:config.publishableKey,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)});
  if (response.status === 401 && retry) {await refresh(); return request(table,query,method,body,false);}
  const data = await response.json();
  if (!response.ok) throw Error(data.message || 'Could not save. Please try again.');
  return data;
}
const newProfile = () => ({start_week:monday(today()),opening_minutes:0});
export async function load() {
  if (!cloudEnabled) {
    const saved = localStorage.getItem(LOCAL_KEY);
    return saved ? JSON.parse(saved) : {profile:null,entries:[]};
  }
  const profiles = await request('time_bank_get_profile','','POST',{});
  const entries=[];
  for (let offset=0;;offset+=1000) {
    const page=await request('time_bank_get_entries','','POST',{p_offset:offset});
    entries.push(...page); if(page.length<1000) break;
  }
  return {profile:profiles[0] || null,entries};
}
export async function saveProfile(profile,state) {
  if (!cloudEnabled) { localStorage.setItem(LOCAL_KEY,JSON.stringify({...state,profile})); return profile; }
  const result = await request('time_bank_save_profile','','POST',{p_start_week:profile.start_week,p_opening_minutes:profile.opening_minutes});
  if(result.length !== 1) throw Error('No profile was saved. Reload and try again.');
  return result[0];
}
export async function saveEntry(entry,state) {
  const exists=state.entries.some(e=>e.id===entry.id);
  if(!cloudEnabled) {
    const entries=exists?state.entries.map(e=>e.id===entry.id?entry:e):[...state.entries,entry];
    localStorage.setItem(LOCAL_KEY,JSON.stringify({...state,entries})); return entry;
  }
  const result=await request('time_bank_save_entry','','POST',{p_entry:entry});
  if(result.length!==1) throw Error('This entry was not saved. Reload and try again.');
  return result[0];
}
export {newProfile};
