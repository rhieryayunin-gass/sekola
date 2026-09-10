import { createClient } from '@supabase/supabase-js';
import { createCipheriv, publicEncrypt, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// One requested demo set. No permission-catalog mutation or existing-user reset.
const projectUrl = 'https://xrqjutbwnlkogpfhtuwr.supabase.co';
assert.equal(process.env.SUPABASE_URL?.replace(/\/$/, ''), projectUrl, 'Unexpected project');
assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY, 'Missing server credential');
assert.ok(Date.now() < Date.parse('2026-09-12T23:59:59Z'), 'One-time provisioning window expired');
const db = createClient(projectUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession:false, autoRefreshToken:false } });
const check = (result) => { if (result.error) throw new Error(result.error.message); return result.data; };
const roles = ['OWNER','PRINCIPAL','STAFF','TEACHER','STUDENT','PARENT'];
const users = roles.map(role => ({role,email:role.toLowerCase()+'.demo@osekola.test',password:'Os!'+randomBytes(24).toString('base64url')}));
const existing = check(await db.from('users').select('id,email').in('email',users.map(u=>u.email)));
assert.equal(existing.length,0,'Demo accounts already exist; refusing to reset credentials');
const roleRows = check(await db.from('roles').select('id,code').in('code',roles).eq('is_active',true));
assert.equal(roleRows.length,6,'Canonical role catalog incomplete');
const knownTenant = check(await db.from('tenants').select('id,code,is_active').eq('code','OSEKOLA-DEMO-20260910').maybeSingle());
if(knownTenant) assert.equal(knownTenant.is_active,true,'Demo tenant inactive');
const key=randomBytes(32),iv=randomBytes(12);
const cipher=createCipheriv('aes-256-gcm',key,iv);
const csv='role,email,password,login_url\n'+users.map(u=>[u.role,u.email,u.password,'https://osekola.com/login'].join(',')).join('\n')+'\n';
const encrypted=Buffer.concat([cipher.update(csv,'utf8'),cipher.final()]);
writeFileSync(process.env.DEMO_OUTPUT_FILE,JSON.stringify({version:1,key:publicEncrypt(readFileSync('ops/demo-recipient-public.pem'),key).toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')}),{mode:0o600});
const tenant=knownTenant??check(await db.from('tenants').insert({code:'OSEKOLA-DEMO-20260910',name:'osekola · Sekolah Demo',notifications_email_enabled:false}).select('id').single());
for(const user of users) {
  const created=check(await db.auth.admin.createUser({email:user.email,password:user.password,email_confirm:true,app_metadata:{tenant_id:tenant.id},user_metadata:{full_name:'Demo '+user.role}}));
  const profile=check(await db.from('users').select('tenant_id').eq('id',created.user.id).single());
  assert.equal(profile.tenant_id,tenant.id,'Unexpected profile tenant');
  check(await db.from('user_roles').insert({user_id:created.user.id,role_id:roleRows.find(r=>r.code===user.role).id}));
  if(user.role==='TEACHER') check(await db.from('teachers').insert({tenant_id:tenant.id,user_id:created.user.id,employee_number:'DEMO-GURU-001'}));
  if(user.role==='STUDENT') check(await db.from('students').insert({tenant_id:tenant.id,user_id:created.user.id,student_number:'DEMO-SISWA-001'}));
  console.log('Created demo role: '+user.role);
}
console.log('Six demo accounts created. Credentials are available only in the encrypted artifact.');
