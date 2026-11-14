import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeUsername} from '../username.js';
import {makeHandler} from '../supabase/functions/time-bank-open/handler.mjs';
test('usernames normalize case and reject email addresses and paths',()=>{assert.equal(normalizeUsername(' Nick_3 '),'nick_3');for(const value of ['ab','a@b.com','../nick','has spaces','x'.repeat(31),'_nick'])assert.throws(()=>normalizeUsername(value));});
const params={url:'https://auth.invalid',adminKey:'server-only-key',publicKeys:['public-key']};
const req=(username,key='public-key')=>new Request('https://edge.invalid',{method:'POST',headers:{apikey:key,Origin:'https://time.nickg.si'},body:JSON.stringify({username})});
const session={access_token:'token',refresh_token:'refresh',expires_in:3600,user:{id:'bank-id'}};
test('opens a username without a password, registration or email delivery',async()=>{
 const calls=[];const handler=makeHandler({...params,fetcher:async(url,opts)=>{calls.push({url,opts});return Response.json(url.endsWith('generate_link')?{hashed_token:'one-time-hash',verification_type:'magiclink'}:session);}});
 const response=await handler(req(' Nick '));assert.equal(response.status,200);assert.deepEqual(await response.json(),session);
 assert.deepEqual(JSON.parse(calls[0].opts.body),{type:'magiclink',email:'nick@users.time-bank.invalid',data:{time_bank_username:'nick'}});
 assert.deepEqual(JSON.parse(calls[1].opts.body),{token_hash:'one-time-hash',type:'magiclink'});assert.equal(response.headers.get('Cache-Control'),'no-store');
});
test('preserves the verification type returned for a new username',async()=>{let count=0;const handler=makeHandler({...params,fetcher:async(url,opts)=>{if(!count++)return Response.json({hashed_token:'hash',verification_type:'signup'});assert.equal(JSON.parse(opts.body).type,'signup');return Response.json(session);}});assert.equal((await handler(req('new_user'))).status,200);});
test('invalid keys and usernames do not reach privileged operations',async()=>{const handler=makeHandler({...params,fetcher:()=>{throw Error('must not be reached');}});assert.equal((await handler(req('nick','wrong'))).status,401);assert.equal((await handler(req('person@email.si'))).status,400);assert.equal((await handler(req(null))).status,400);});
test('backend failures do not expose links or admin details',async()=>{const handler=makeHandler({...params,fetcher:async()=>Response.json({secret:'not-public'},{status:500})});const r=await handler(req('nick'));assert.equal(r.status,503);assert.equal((await r.text()).includes('not-public'),false);});
test('malformed sessions are rejected rather than stored',async()=>{const handler=makeHandler({...params,fetcher:async url=>Response.json(url.endsWith('generate_link')?{hashed_token:'hash'}:{user:{id:'bank-id'}})});assert.equal((await handler(req('nick'))).status,503);});
