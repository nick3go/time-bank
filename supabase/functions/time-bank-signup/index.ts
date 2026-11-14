import {makeHandler} from './handler.mjs';
const keys=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}');
Deno.serve(makeHandler({
 url:Deno.env.get('SUPABASE_URL')||'',
 adminKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',
 publicKeys:[...Object.values(keys),'sb_publishable_eRvwUkoqMNtX7xHTa_w-sQ_5IeedVRV',Deno.env.get('SUPABASE_ANON_KEY')].filter(Boolean)
}));
