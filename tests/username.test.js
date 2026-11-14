import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeUsername,usernameIdentity} from '../username.js';
import {makeHandler} from '../supabase/functions/time-bank-signup/handler.mjs';
test('usernames are normalized and restricted to unambiguous identifiers',()=>{
 assert.equal(normalizeUsername(' Nick_3 '),'nick_3');assert.equal(usernameIdentity('Nick_3'),'nick_3@users.time-bank.invalid');
 for(const value of ['ab','a@b.com','../nick','has spaces','x'.repeat(31),'_nick'])assert.throws(()=>normalizeUsername(value));
});
const req=(body,key='public-key')=>new Request('https://edge.invalid',{method:'POST',headers:{apikey:key,Origin:'https://time.nickg.si'},body:JSON.stringify(body)});
const params={url:'https://auth.invalid',adminKey:'secret-only-on-server',publicKeys:['public-key']};
test('signup creates an app-specific confirmed identity and returns no credentials',async()=>{
 const calls=[];const handler=makeHandler({...params,fetcher:async(url,opts)=>{calls.push({url,opts});return Response.json(url.includes('/rpc/')?true:{id:'new-id',email:'nick@users.time-bank.invalid'});}});
 const response=await handler(req({username:' Nick ',password:'test-pass-123'}));assert.equal(response.status,201);assert.deepEqual(await response.json(),{username:'nick'});
 const body=JSON.parse(calls[1].opts.body);assert.equal(body.email_confirm,true);assert.equal(body.email,'nick@users.time-bank.invalid');assert.equal(body.password,'test-pass-123');
 const limit=JSON.parse(calls[0].opts.body);assert.match(limit.p_ip_hash,/^[a-f0-9]{64}$/);
});
test('bad keys, malformed usernames and short passwords cannot create accounts',async()=>{
 const handler=makeHandler({...params,fetcher:()=>{throw Error('must not be reached');}});
 assert.equal((await handler(req({username:'nick',password:'long-password'},'wrong'))).status,401);
 assert.equal((await handler(req({username:'nick@email.si',password:'long-password'}))).status,400);
 assert.equal((await handler(req({username:'nick',password:'short'}))).status,400);
});
test('rate limits stop account creation and duplicates get a clear error',async()=>{
 let calls=0;const limited=makeHandler({...params,fetcher:async()=>{calls++;return Response.json(false);}});
 assert.equal((await limited(req({username:'nick',password:'long-password'}))).status,429);assert.equal(calls,1);
 const duplicate=makeHandler({...params,fetcher:async url=>url.includes('/rpc/')?Response.json(true):Response.json({code:'email_exists'},{status:422})});
 const response=await duplicate(req({username:'nick',password:'long-password'}));assert.equal(response.status,409);assert.match((await response.json()).message,/already taken/);
});
