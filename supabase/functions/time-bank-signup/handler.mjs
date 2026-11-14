const allowedOrigins=new Set(['https://time.nickg.si','https://nick3go.github.io','http://127.0.0.1:4173','http://localhost:8080','http://127.0.0.1:8080']);
export function makeHandler({url,adminKey,publicKeys,fetcher=fetch}){
 return async request=>{
  const origin=request.headers.get('Origin');
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'apikey, content-type, authorization','Access-Control-Allow-Methods':'POST, OPTIONS'};
  if(origin&&allowedOrigins.has(origin))headers['Access-Control-Allow-Origin']=origin;
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
  if(origin&&!allowedOrigins.has(origin))return reply(403,{message:'Origin not allowed.'});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return reply(405,{message:'Method not allowed.'});
  if(!adminKey||!url)return reply(503,{message:'Account creation is temporarily unavailable.'});
  if(!publicKeys.includes(request.headers.get('apikey')))return reply(401,{message:'Invalid application key.'});
  try{
   const raw=await request.text();if(raw.length>4096)return reply(413,{message:'Request is too large.'});
   let body;try{body=JSON.parse(raw);}catch{return reply(400,{message:'Invalid request.'});}
   const username=typeof body.username==='string'?body.username.trim().toLowerCase():'';
   if(!/^[a-z0-9][a-z0-9_-]{2,29}$/.test(username))return reply(400,{message:'Use 3–30 characters: letters, numbers, underscores or hyphens. Start with a letter or number.'});
   if(typeof body.password!=='string'||body.password.length<8||body.password.length>128)return reply(400,{message:'Use a password between 8 and 128 characters.'});
   const ip=request.headers.get('x-forwarded-for')?.split(',')[0].trim()||'unknown';
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(adminKey+'|'+ip));
   const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
   const adminHeaders={apikey:adminKey,Authorization:'Bearer '+adminKey,'Content-Type':'application/json'};
   const rate=await fetcher(url+'/rest/v1/rpc/time_bank_signup_allowed',{method:'POST',headers:adminHeaders,body:JSON.stringify({p_ip_hash:hash})});
   if(!rate.ok)return reply(503,{message:'Account creation is temporarily unavailable.'});
   if(await rate.json()!==true)return reply(429,{message:'Too many account creation attempts. Please try again later.'});
   const created=await fetcher(url+'/auth/v1/admin/users',{method:'POST',headers:adminHeaders,body:JSON.stringify({email:username+'@users.time-bank.invalid',password:body.password,email_confirm:true,user_metadata:{time_bank_username:username}})});
   if(!created.ok){const error=await created.json();if(created.status===422||error.code==='email_exists'||error.error_code==='email_exists')return reply(409,{message:'That username is already taken. Choose another.'});return reply(400,{message:'Could not create your account. Try a different username or password.'});}
   // The internal identity and privileged credentials never leave this endpoint.
   return reply(201,{username});
  }catch{return reply(503,{message:'Account creation is temporarily unavailable. Please try again.'});}
 };
}
