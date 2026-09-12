// Exercise only the two explicitly requested synthetic demo schools.
// Auth links are generated locally: no email is sent and no password is reset.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
const config=JSON.parse(await readFile(new URL('../../../deploy/osekola/public-web-config.json',import.meta.url)));
const url=config.NEXT_PUBLIC_SUPABASE_URL,key=config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.equal(process.env.SUPABASE_URL?.replace(/\/$/,''),url);
assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY);
assert.ok(process.env.BROWSER_MODULE);
const {chromium}=await import(process.env.BROWSER_MODULE);
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const ok=(r,label='Request')=>{if(r.error)throw new Error(`${label}: ${r.error.message}`);return r.data;};
const output=process.env.VERIFY_OUTPUT_DIR;
assert.ok(output);await mkdir(output,{recursive:true});
let tenants=[];
for(let attempt=0;attempt<120;attempt++){
 tenants=ok(await admin.from('tenants').select('id,code').in('code',['OSEKOLA-PART2-DEMO-A','OSEKOLA-PART2-DEMO-B']).order('code'));
 if(tenants.length===2&&ok(await admin.from('school_library').select('id').in('tenant_id',tenants.map(t=>t.id))).length===10)break;
 if(attempt%12===0)console.log('Waiting for both demo schools to finish provisioning');
 await new Promise(resolve=>setTimeout(resolve,5000));
}
assert.equal(tenants.length,2);
const clients=[];let browser;let outsideSet;let outsideCourse;
const featureFailures=[];
try{
 browser=await chromium.launch({headless:true});
 for(const [schoolIndex,tenant] of tenants.entries()){
  const prefix=schoolIndex===0?'demo-a':'demo-b';
  const users=ok(await admin.from('users').select('id,email').eq('tenant_id',tenant.id));
  assert.equal(users.length,109);
  assert.equal(ok(await admin.from('school_guardians').select('id').eq('tenant_id',tenant.id)).length,50);
  for(const role of ['PRINCIPAL','STAFF','TEACHER','STUDENT','PARENT']){
   const email=`${prefix}.${role.toLowerCase()}01@demo.osekola.test`;
   const profile=users.find(u=>u.email===email);assert.ok(profile);
   const auth=ok(await admin.auth.admin.getUserById(profile.id)).user;
   assert.equal(auth.app_metadata.osekola_demo,'part2-20260912');assert.equal(auth.app_metadata.tenant_id,tenant.id);
   const link=ok(await admin.auth.admin.generateLink({type:'magiclink',email}));
   const cookies=new Map();
   const client=createServerClient(url,key,{cookies:{getAll:()=>[...cookies.values()],setAll:values=>values.forEach(c=>cookies.set(c.name,c))}});
   clients.push(client);
   assert.equal(ok(await client.auth.verifyOtp({type:'magiclink',token_hash:link.properties.hashed_token})).user.id,profile.id);
   const school=ok(await client.rpc('school_context'));
   assert.equal(school.tenant.id,tenant.id);assert.equal(school.platform_owner,false);
   const dashboard=ok(await client.rpc('school_dashboard'));
   assert.equal(dashboard.students,role==='TEACHER'?10:['PARENT','STUDENT'].includes(role)?1:50);
   assert.equal(dashboard.tenants.length,0);
   const courses=ok(await client.rpc('school_catalog',{resource:'courses'}));
   assert.ok(courses.length>0);assert.ok(courses.every(c=>c.tenant_id===tenant.id));
   if(['PARENT','STUDENT'].includes(role)){
    assert.equal(school.children.length,1);assert.equal(courses.length,1);
    const bills=ok(await client.rpc('school_finance_report',{resource:'bills',date_from:'2026-09-01',date_to:'2026-09-30'}));
    assert.equal(bills.count,1);assert.equal(bills.rows[0].invoice_number,'DEMO-202609-1');
    assert.equal((await client.rpc('school_question_bank')).error?.code,'42501');
   }
   const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
   await context.addCookies([...cookies.values()].map(c=>({name:c.name,value:c.value,domain:'osekola.com',path:'/',secure:true,sameSite:'Lax'})));
   const page=await context.newPage();page.setDefaultTimeout(30000);
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const response=await page.goto('https://osekola.com/dashboard',{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);
   await page.locator('.school-dashboard-overview').waitFor();
   assert.ok(!new URL(page.url()).pathname.startsWith('/login'));
   await page.screenshot({path:`${output}/${prefix}-${role.toLowerCase()}.png`,fullPage:true});
   if(role==='TEACHER'){
    const teacher=ok(await admin.from('teachers').select('id').eq('user_id',profile.id).single());
    const course=courses.find(c=>c.teacher_id===teacher.id);assert.ok(course);
    await page.goto('https://osekola.com/dashboard/learning',{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Bank baru',exact:true}).click();
    const title=`Demo live verification ${prefix} ${Date.now()}`;
    await page.locator('input[name="title"]').fill(title);
    await page.getByRole('combobox',{name:'Course',exact:true}).selectOption(course.id);
    await page.locator('input[name="grade_level"]').fill('6');
    await page.getByRole('button',{name:'Simpan bank',exact:true}).click();
    await page.getByRole('button',{name:'Soal manual',exact:true}).click();
    await page.locator('textarea[name="prompt"]').fill('Berapakah hasil dari 2 + 2?');
    await page.locator('textarea[name="options"]').fill('3\n4\n5\n6');
    await page.locator('textarea[name="answer"]').fill('4');
    await page.locator('textarea[name="explanation"]').fill('Dua benda ditambah dua benda menjadi empat benda.');
    await page.locator('select[name="review_status"]').selectOption('APPROVED');
    await page.getByRole('button',{name:'Simpan soal',exact:true}).click();
    await page.locator('.school-question-card').filter({hasText:'Berapakah hasil dari 2 + 2?'}).waitFor();
    const set=ok(await client.rpc('school_question_bank')).sets.find(s=>s.title===title);assert.ok(set);
    const items=ok(await client.rpc('school_question_bank',{set_uuid:set.id})).items;
    assert.equal(items.length,1);assert.equal(items[0].review_status,'APPROVED');
    const download=page.waitForEvent('download');await page.getByRole('button',{name:'PDF',exact:true}).click();
    const pdf=await download;await pdf.saveAs(`${output}/${prefix}-questions.pdf`);
    assert.equal((await readFile(`${output}/${prefix}-questions.pdf`)).subarray(0,5).toString(),'%PDF-');
    if(schoolIndex===0){outsideSet=set.id;outsideCourse=course.id;}
    else{
     assert.equal(ok(await client.rpc('school_question_bank',{set_uuid:outsideSet})).items.length,0);
     assert.equal((await client.rpc('school_question_save',{kind:'set',payload:{course_id:outsideCourse,title:'Forbidden cross-tenant',grade_level:6}})).error?.code,'42501');
    }
    await page.screenshot({path:`${output}/${prefix}-teacher-questions.png`,fullPage:true});
    if(schoolIndex===0){
     const generated=await page.evaluate(async setId=>{const r=await fetch('/api/school/questions/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request_id:crypto.randomUUID(),set_id:setId,count:1,question_type:'MULTIPLE_CHOICE',difficulty:'EASY',include_image:true,instructions:'Satu soal latihan penjumlahan bilangan dengan diagram batang, untuk kelas enam.'})});return {status:r.status,data:await r.json()};},set.id);
     if(generated.status!==200)featureFailures.push(`Live AI generation returned HTTP ${generated.status}`);
     else{const bank=ok(await client.rpc('school_question_bank',{set_uuid:set.id}));assert.ok(bank.items.some(q=>q.source==='AI'&&q.review_status==='DRAFT'&&q.diagram?.type==='bar'));console.log('PASS live AI generation: persisted draft question and bar diagram');}
    }
   }
   assert.deepEqual(errors,[],`${prefix} ${role} browser exceptions`);
   await context.close();await client.auth.signOut({scope:'local'});
   console.log(`PASS ${prefix} ${role}: authenticated dashboard, role scope and browser render`);
  }
 }
 assert.deepEqual(featureFailures,[]);
 console.log('PART2_LIVE_VERIFICATION_PASSED: 2 schools, 218 accounts, 10 role sessions, parent/tenant isolation, teacher create/review/PDF');
}finally{for(const client of clients)await client.auth.signOut({scope:'local'});await browser?.close();}
