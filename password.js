// Supabase still hashes the resulting credential. This adapter lets the UI accept
// any non-empty password without changing the shared project's Auth settings.
export async function preparePassword(username,password) {
 if(typeof password!=='string'||password.length===0)throw Error('Enter a password.');
 const name=String(username).trim().toLowerCase();
 const input=new TextEncoder().encode(`time-bank-password-v1\0${name}\0${password}`);
 const digest=await crypto.subtle.digest('SHA-256',input);
 return 'Tb1!'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
