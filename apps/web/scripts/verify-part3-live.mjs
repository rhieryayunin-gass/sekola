// Read-only production UI. API mutations target one generated disposable account only.
// No emails are sent; no real account passwords, contract, invoice, or payment is changed.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
const config=JSON.parse(await readFile(new URL('../../../deploy/osekola/public-web-config.json',import.meta.url)));
const url=config.NEXT_PUBLIC_SUPABASE_URL,key=config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.equal(process.env.SUPABASE_URL?.replace(/\/$/,''),url);
assert.equal(new URL(url).hostname,'xrqjutbwnlkogpfhtuwr.supabase.co');
assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY);assert.ok(process.env.BROWSER_MODULE);assert.ok(process.env.VERIFY_OUTPUT_DIR);
const output=process.env.VERIFY_OUTPUT_DIR;await mkdir(output,{recursive:true});
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ok=(r,label='Request')=>{if(r.error)throw new Error(`${label} failed (${r.error.code??r.error.status??'unknown'})`);return r.data;};
const role=ok(await admin.from('roles').select('id').eq('code','OWNER').single());
const direct=ok(await admin.from('user_roles').select('user_id').eq('role_id',role.id));
const levels=ok(await admin.from('user_level_roles').select('user_level_id').eq('role_id',role.id));
let candidates=[];
if(direct.length)candidates.push(...ok(await admin.from('users').select('id,email,tenant_id').eq('is_active',true).in('id',direct.map(r=>r.user_id))));
if(levels.length)candidates.push(...ok(await admin.from('users').select('id,email,tenant_id').eq('is_active',true).in('user_level_id',levels.map(r=>r.user_level_id))));
const owner=[...new Map(candidates.map(u=>[u.id,u])).values()][0];assert.ok(owner,'Active owner required');
const link=ok(await admin.auth.admin.generateLink({type:'magiclink',email:owner.email}));
const jar=new Map();
const client=createServerClient(url,key,{cookies:{getAll:()=>[...jar.values()],setAll:values=>values.forEach(c=>jar.set(c.name,c))}});
const signed=ok(await client.auth.verifyOtp({type:'magiclink',token_hash:link.properties.hashed_token}));assert.equal(signed.user.id,owner.id);
const token=signed.session.access_token;
assert.equal(ok(await client.rpc('school_context')).platform_owner,true);
ok(await client.rpc('school_owner_summary'));
const tenant=ok(await admin.from('tenants').select('id').eq('code','OSEKOLA-PART2-DEMO-A').eq('is_active',true).single());
const email=`part3-verification-${randomUUID()}@demo.osekola.test`,password=randomBytes(24).toString('base64url'),replacement=randomBytes(24).toString('base64url');
let fixtureId,browser,api;const checks=[];
const record=text=>{checks.push(text);console.log(text);};
const localBase='http://127.0.0.1:4140/api/v1';
async function request(path,method='GET',data,actorToken=token){
 const response=await fetch(localBase+path,{method,headers:{Authorization:`Bearer ${actorToken}`,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(30000)});
 return {status:response.status,body:await response.json()};
}
try{
 api=spawn(process.execPath,['apps/api/dist/main.js'],{env:{...process.env,NODE_ENV:'development',HOST:'127.0.0.1',PORT:'4140',RELEASE_SHA:process.env.EXPECTED_WEB_RELEASE,CORS_ORIGINS:'https://osekola.com'},stdio:'ignore'});
 let ready=false;for(let i=0;i<40;i++){try{ready=(await fetch(localBase+'/health')).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,500));}assert.ok(ready,'Isolated API did not start');
 const created=await request('/owner/users','POST',{tenant_id:tenant.id,full_name:'Disposable Part 3 verification',email,password,role:'TEACHER'});assert.equal(created.status,201);fixtureId=created.body.data.id;
 assert.ok(fixtureId);assert.notEqual(fixtureId,owner.id);
 assert.equal((await request('/owner/users/'+fixtureId,'PATCH',{full_name:'Edited disposable fixture',phone:'0800000000',role:'TEACHER'})).status,200);
 const learner=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const fixtureToken=ok(await learner.auth.signInWithPassword({email,password})).session.access_token;
 assert.equal((await request('/owner/users/'+owner.id+'/status','PATCH',{is_active:false},fixtureToken)).status,403);
 assert.equal((await request('/owner/users/'+fixtureId+'/status','PATCH',{is_active:false})).status,200);
 assert.equal((await request('/auth/me','GET',undefined,fixtureToken)).status,401);
 assert.equal((await request('/owner/users/'+fixtureId+'/restore','POST')).status,201);
 assert.equal((await request('/owner/users/'+fixtureId+'/password','POST',{password:replacement})).status,201);
 ok(await learner.auth.signInWithPassword({email,password:replacement}));
 assert.equal((await request('/owner/users/'+fixtureId,'DELETE')).status,200);
 assert.ok(ok(await admin.from('users').select('deleted_at,is_active').eq('id',fixtureId).single()).deleted_at);
 assert.equal((await request('/owner/users/'+fixtureId+'/restore','POST')).status,201);
 await learner.auth.signOut({scope:'local'});
 record('PASS: real Supabase Auth create, edit, deactivate, override, reset password, archive, restore; non-owner denied. New NestJS API executed on isolated runner.');
 let releaseReady=false;for(let i=0;i<100;i++){try{const r=await fetch('https://osekola.com/healthz',{signal:AbortSignal.timeout(10000)});releaseReady=r.ok&&(await r.json()).release===process.env.EXPECTED_WEB_RELEASE;}catch{}if(releaseReady)break;await new Promise(r=>setTimeout(r,5000));}assert.ok(releaseReady,'Expected frontend release unavailable');
 const {chromium}=await import(process.env.BROWSER_MODULE);browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addCookies([...jar.values()].map(c=>({name:c.name,value:c.value,domain:'osekola.com',path:'/',secure:true,sameSite:'Lax'})).concat([{name:'osekola_locale',value:'en-US',domain:'osekola.com',path:'/',secure:true,sameSite:'Lax'}]));
 const page=await context.newPage();page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const route of ['','/tenant','/finance','/partners','/users']){
  const r=await page.goto('https://osekola.com/dashboard'+route,{waitUntil:'domcontentloaded'});assert.equal(r.status(),200);
  await page.locator('.owner-banner').waitFor();
  assert.deepEqual(await page.locator('.school-module-nav>a').allTextContents(),['Dashboard','Tenant','Finance','Partner','User']);
  await page.getByRole('button',{name:'Account',exact:true}).click();await page.locator('#account-popover').waitFor();
  await page.locator('.owner-banner').click();assert.equal(await page.locator('#account-popover').count(),0);
  if(!route)assert.equal(await page.locator('.owner-metric').count(),4);
  else if(route!='/partners')await page.locator('.owner-table tbody tr').first().waitFor();
  await page.screenshot({path:`${output}/owner${route.replace('/','-')||'-dashboard'}.png`,fullPage:true,mask:[page.locator('.owner-banner h1'),page.locator('tbody')]});
  record('PASS: owner page '+(route||'/dashboard')+'; five navigation items, banner and outside-click menu.');
 }
 await page.setViewportSize({width:390,height:844});await page.goto('https://osekola.com/dashboard');await page.locator('.owner-banner').waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Mobile page overflow');
 await page.screenshot({path:`${output}/owner-mobile.png`,fullPage:true,mask:[page.locator('.owner-banner h1')]});
 const publicContext=await browser.newContext({viewport:{width:1440,height:1000}});await publicContext.addCookies([{name:'osekola_locale',value:'en-US',domain:'osekola.com',path:'/',secure:true,sameSite:'Lax'}]);const publicPage=await publicContext.newPage();
 await publicPage.goto('https://osekola.com/login');await publicPage.getByRole('link',{name:'Back to home'}).waitFor();
 await publicPage.getByRole('link',{name:'Back to home'}).click();await publicPage.locator('.school-hero-actions').waitFor();
 assert.equal(await publicPage.locator('.school-hero-actions .ose-contact-link').count(),2);
 assert.equal(await publicPage.locator('.ose-person-symbol').count(),3);
 assert.equal(errors.length,0,'Unexpected browser runtime error');
 const production=await fetch('https://api.osekola.com/api/v1/owner/users/capabilities',{headers:{Authorization:`Bearer ${token}`}});
 record(production.ok?'PASS: deployed API supports owner account management.':'PENDING: VPS API release is not deployed; account mutations are disabled in the UI.');
}finally{
 if(fixtureId){const candidate=ok(await admin.auth.admin.getUserById(fixtureId)).user;assert.equal(candidate.email,email);assert.equal(candidate.app_metadata.tenant_id,tenant.id);ok(await admin.auth.admin.deleteUser(fixtureId),'Fixture cleanup');}
 else {const candidate=ok(await admin.from('users').select('id').eq('email',email).maybeSingle());if(candidate){const auth=ok(await admin.auth.admin.getUserById(candidate.id)).user;assert.equal(auth.email,email);assert.equal(auth.app_metadata.tenant_id,tenant.id);ok(await admin.auth.admin.deleteUser(candidate.id),'Partial fixture cleanup');}}
 await client.auth.signOut({scope:'local'});if(browser)await browser.close();if(api)api.kill('SIGTERM');
 await writeFile(`${output}/verification.txt`,checks.join('\n')+'\n');
}
