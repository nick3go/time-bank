const allowedOrigins=new Set(['https://time.nickg.si','https://nick3go.github.io','http://127.0.0.1:4173','http://localhost:8080','http://127.0.0.1:8080']);
// Intentionally public by username: knowing a name grants access to that bank.
// Restrict identities to this application's namespace, never arbitrary email/users.
export function makeHandler({url,adminKey,publicKeys,fetcher=fetch}){
 return async request=>{
  const origin=request.headers.get('Origin');
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'apikey, content-type, authorization','Access-Control-Allow-Methods':'POST, OPTIONS'};
  if(origin&&allowedOrigins.has(origin))headers['Access-Control-Allow-Origin']=origin;
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
  if(origin&&!allowedOrigins.has(origin))return reply(403,{message:'Origin not allowed.'});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return reply(405,{message:'Method not allowed.'});
  if(!adminKey||!url)return reply(503,{message:'Your time bank is temporarily unavailable.'});
  if(!publicKeys.includes(request.headers.get('apikey')))return reply(401,{message:'Invalid application key.'});
  try{
   const raw=await request.text();if(raw.length>1024)return reply(413,{message:'Request is too large.'});
   let body;try{body=JSON.parse(raw);}catch{return reply(400,{message:'Invalid request.'});}
   const username=typeof body?.username==='string'?body.username.trim().toLowerCase():'';
   if(!/^[a-z0-9][a-z0-9_-]{2,29}$/.test(username))return reply(400,{message:'Use 3–30 characters: letters, numbers, underscores or hyphens. Start with a letter or number.'});
   const adminHeaders={apikey:adminKey,Authorization:'Bearer '+adminKey,'Content-Type':'application/json'};
   // Admin generation doesn't send email. It creates the identity if new, or
   // reuses the same identity and records if this username already exists.
   const generated=await fetcher(url+'/auth/v1/admin/generate_link',{method:'POST',headers:adminHeaders,body:JSON.stringify({type:'magiclink',email:username+'@users.time-bank.invalid',data:{time_bank_username:username}})});
   if(!generated.ok)return reply(generated.status===429?429:503,{message:generated.status===429?'Please wait a moment and try again.':'Could not open your time bank. Please try again.'});
   const link=await generated.json();
   if(!link.hashed_token)return reply(503,{message:'Could not open your time bank. Please try again.'});
   const verified=await fetcher(url+'/auth/v1/verify',{method:'POST',headers:adminHeaders,body:JSON.stringify({token_hash:link.hashed_token,type:link.verification_type||'magiclink'})});
   if(!verified.ok)return reply(503,{message:'Could not open your time bank. Please try again.'});
   const session=await verified.json();
   if(!session.access_token||!session.refresh_token||!session.user?.id)return reply(503,{message:'Could not open your time bank. Please try again.'});
   return reply(200,session);
  }catch{return reply(503,{message:'Your time bank is temporarily unavailable. Please try again.'});}
 };
}
