// Production verification uses owned disposable fixtures only; no real payments or mail.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
const config=JSON.parse(await readFile(new URL('../../../deploy/osekola/public-web-config.json',import.meta.url)));
const url=config.NEXT_PUBLIC_SUPABASE_URL,key=config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.equal(process.env.SUPABASE_URL?.replace(/\/$/,''),url);assert.equal(new URL(url).hostname,'xrqjutbwnlkogpfhtuwr.supabase.co');
assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY);assert.ok(process.env.BROWSER_MODULE);assert.ok(process.env.VERIFY_OUTPUT_DIR);
const output=process.env.VERIFY_OUTPUT_DIR;await mkdir(output,{recursive:true});
const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const guest=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const ok=(r,label='Request')=>{if(r.error)throw new Error(`${label} failed (${r.error.code??r.error.status??'unknown'}): ${r.error.message??''}`);return r.data;};
const run=randomUUID(),tenants=[randomUUID(),randomUUID()],users=[],uploads=[],checks=[];let browser;
const record=label=>{checks.push(label);console.log(label);};
const roleCodes=['OWNER','PRINCIPAL','STAFF','TEACHER','STUDENT','PARENT'];
const roleIds=new Map(ok(await admin.from('roles').select('id,code').in('code',roleCodes)).map(r=>[r.code,r.id]));
const ids=Object.fromEntries(['year','semester','classroom','subject','teacher','student','peer','course','assignment','account','category','bill'].map(k=>[k,randomUUID()]));
const denied=async promise=>assert.equal((await promise).error?.code,'42501');
const insert=async(table,data)=>ok(await admin.from(table).insert(data),'Insert '+table);
async function api(actor,path){return fetch('https://api.osekola.com/api/v1'+path,{headers:{Authorization:`Bearer ${actor.token}`},signal:AbortSignal.timeout(30000)});}
const menus={OWNER:['','tenant','finance','partners','users','products','leads','connect'],PRINCIPAL:['','gallery','approval','connect'],STAFF:['','academic','gallery','team','finance','connect'],TEACHER:['','academic','attendance','learning','exams','gallery','team','connect'],STUDENT:['','academic','learning','exams','team','connect'],PARENT:['','learning','exams','team','finance','gallery','connect']};
try{
 let ready=false;for(let i=0;i<110;i++){try{const h=await fetch('https://osekola.com/healthz',{signal:AbortSignal.timeout(10000)});ready=h.ok&&(await h.json()).release===process.env.EXPECTED_WEB_RELEASE;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,5000));}assert.ok(ready,'Expected frontend release unavailable');
 assert.equal((await fetch('https://api.osekola.com/api/v1/health')).status,200);assert.equal((await fetch('https://api.osekola.com/api/v1/ready')).status,200);
 record('PASS: deployed web release and existing API health/readiness.');
 await insert('tenants',tenants.map((id,i)=>({id,name:`Part 5 verification ${run} ${i}`,code:`P5-VERIFY-${run}-${i}`})));
 for(const [index,role]of [...roleCodes,'STUDENT','TEACHER'].entries()){
  const tenant=tenants[index===7?1:0],email=`part5-${run}-${index}@demo.osekola.test`,password=randomBytes(24).toString('base64url');
  const auth=ok(await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{tenant_id:tenant},user_metadata:{full_name:`Part5 fixture ${role} ${index}`}}));
  const actor={id:auth.user.id,email,password,role,tenant,jar:new Map()};users.push(actor);await insert('user_roles',{user_id:actor.id,role_id:roleIds.get(role)});
  actor.client=createServerClient(url,key,{cookies:{getAll:()=>[...actor.jar.values()],setAll:values=>values.forEach(c=>actor.jar.set(c.name,c))}});
  actor.token=ok(await actor.client.auth.signInWithPassword({email,password})).session.access_token;
 }
 await writeFile(output+'/fixtures.json',JSON.stringify({run,tenants,users:users.map(u=>u.id)},null,2));
 const [owner,principal,staff,teacher,student,parent,peer,foreignTeacher]=users;
 await insert('academic_years',{id:ids.year,tenant_id:tenants[0],name:'Verification year',starts_on:'2026-07-01',ends_on:'2027-06-30',is_active:true});
 await insert('semesters',{id:ids.semester,tenant_id:tenants[0],academic_year_id:ids.year,name:'Verification semester',starts_on:'2026-07-01',ends_on:'2026-12-31',is_active:true});
 await insert('classrooms',{id:ids.classroom,tenant_id:tenants[0],academic_year_id:ids.year,name:'Verification class',homeroom_teacher_user_id:teacher.id});
 await insert('subjects',{id:ids.subject,tenant_id:tenants[0],code:'P5-MATH',name:'Mathematics'});await insert('teachers',{id:ids.teacher,tenant_id:tenants[0],user_id:teacher.id});
 await insert('students',[{id:ids.student,tenant_id:tenants[0],user_id:student.id,student_number:'P5-STUDENT'},{id:ids.peer,tenant_id:tenants[0],user_id:peer.id,student_number:'P5-PEER'}]);
 await insert('student_assignments',[ids.student,ids.peer].map(student_id=>({tenant_id:tenants[0],academic_year_id:ids.year,semester_id:ids.semester,classroom_id:ids.classroom,student_id})));
 await insert('school_guardians',{tenant_id:tenants[0],student_id:ids.student,parent_user_id:parent.id});
 await insert('courses',{id:ids.course,tenant_id:tenants[0],academic_year_id:ids.year,semester_id:ids.semester,classroom_id:ids.classroom,subject_id:ids.subject,teacher_id:ids.teacher,name:'Verification mathematics'});
 await insert('assignments',{id:ids.assignment,tenant_id:tenants[0],course_id:ids.course,title:'Published Part 5 family task',is_published:true});
 await insert('finance_accounts',{id:ids.account,tenant_id:tenants[0],name:'Verification account',account_type:'BANK'});await insert('finance_categories',{id:ids.category,tenant_id:tenants[0],name:'Verification category',category_type:'INCOME'});
 await insert('student_bills',{id:ids.bill,tenant_id:tenants[0],student_id:ids.student,category_id:ids.category,invoice_number:'P5-VERIFY',amount:125000,due_date:new Date().toISOString().slice(0,10)});
 for(const actor of users.slice(0,6)){
  assert.equal((await api(actor,'/academic-years')).status,['STAFF','TEACHER'].includes(actor.role)?200:403,actor.role+' Academic administration');
  assert.equal((await api(actor,'/courses')).status,['TEACHER','STUDENT'].includes(actor.role)?200:403,actor.role+' Learning administration');
  assert.equal((await api(actor,'/finance/bills')).status,actor.role==='STAFF'?200:403,actor.role+' Finance administration');
  ok(await actor.client.rpc('school_role_dashboard'));
 }
 assert.equal(ok(await parent.client.rpc('school_family_report',{kind:'learning',student:ids.student})).rows.length,1);
 await denied(parent.client.rpc('school_family_report',{kind:'learning',student:ids.peer}));
 assert.equal(ok(await student.client.rpc('school_family_report',{kind:'academic',student:ids.student})).rows.length,1);
 const directory=ok(await staff.client.rpc('school_face_directory'));assert.ok(directory.some(u=>u.id===student.id));for(const u of [owner,parent,foreignTeacher])assert.ok(!directory.some(x=>x.id===u.id));
 await denied(parent.client.rpc('school_face_directory'));
 const v=Array.from({length:256},(_,i)=>i===0?1:0),samples=[v,v,v];
 for(const purpose of ['ENROLL','VERIFY','CHECKIN']){const challenge=ok(await staff.client.rpc('school_face_challenge',{target:student.id,purpose,classroom:purpose==='CHECKIN'?ids.classroom:null}));const result=ok(await staff.client.rpc('school_face_scan',{challenge:challenge.id,samples,consent:true}));assert.equal(result.enrolled??result.matched,true);await denied(staff.client.rpc('school_face_scan',{challenge:challenge.id,samples,consent:true}));}
 ok(await staff.client.rpc('school_face_delete',{target:student.id}));
 record('PASS: administrative role gates, own-child reports, face directory isolation, encrypted enrollment/rescan/check-in and replay denial with synthetic fixtures.');
 const gallery=`${tenants[0]}/gallery/${randomUUID()}-School_event.png`;uploads.push(gallery);
 const photo=await readFile(new URL('../public/illustrations/student.png',import.meta.url));ok(await staff.client.storage.from('tenant-media').upload(gallery,photo,{contentType:'image/png'}));
 ok(await principal.client.storage.from('tenant-media').download(gallery));assert.equal(String((await principal.client.storage.from('tenant-media').upload(`${tenants[0]}/gallery/forbidden.png`,photo,{contentType:'image/png'})).error?.statusCode),'403');
 const cycle=ok(await staff.client.rpc('school_admission_save',{kind:'cycle',payload:{name:'Part 5 verification intake',opens_at:new Date(Date.now()-3600000).toISOString(),closes_at:new Date(Date.now()+86400000).toISOString(),fee_amount:50000,exam_at:new Date(Date.now()+172800000).toISOString(),exam_location:'Verification room',is_published:true}}));
 const receipt=ok(await guest.rpc('school_admission_register',{cycle:cycle.id,payload:{full_name:'Synthetic Part 5 applicant',birth_date:'2015-01-01',guardian_name:'Synthetic guardian',email:`spmb-${run}@demo.osekola.test`,phone:'0800000000',consent:true}}));
 const portal=()=>guest.rpc('school_admission_portal',{application:receipt.id,access_token:receipt.access_token});assert.equal(ok(await portal()).payment_status,'UNPAID');await denied(guest.rpc('school_admission_portal',{application:receipt.id,access_token:'0'.repeat(64)}));
 const edge=url+'/functions/v1/payment-gateway';const post=(body,token=key,path='')=>fetch(edge+path,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await post({kind:'bill',target:ids.bill})).status,401);
 const unavailable=await post({kind:'admission',target:receipt.id,access_token:receipt.access_token});assert.equal(unavailable.status,503);assert.equal((await unavailable.json()).error,'PAYMENT_NOT_CONFIGURED');
 const spoof=await post({order_id:randomUUID()},key,'/webhook/midtrans');assert.equal(spoof.status,403);
 // A synthetic manual receipt is recorded only in this disposable test school.
 ok(await staff.client.rpc('school_admission_save',{kind:'receipt',record_id:receipt.id,payload:{reference:'TEST-ONLY-NO-MONEY-'+run,paid_at:new Date().toISOString()}}));
 ok(await staff.client.rpc('school_admission_save',{kind:'selection',record_id:receipt.id,payload:{status:'ELIGIBLE',note:'Private fixture note',publish:false}}));assert.equal(ok(await portal()).selection_status,'PENDING');
 ok(await staff.client.rpc('school_admission_save',{kind:'selection',record_id:receipt.id,payload:{status:'ELIGIBLE',note:'Published fixture note',publish:true}}));ok(await staff.client.rpc('school_admission_save',{kind:'card',record_id:receipt.id,payload:{}}));ok(await staff.client.rpc('school_admission_save',{kind:'final',record_id:receipt.id,payload:{status:'PASSED',note:'Synthetic result',publish:true}}));assert.equal(ok(await portal()).final_status,'PASSED');
 record('PASS: SPMB registration, private token, receipt, publication gates, exam card and final result; Edge rejects anonymous bills and forged callbacks.');
 const {chromium}=await import(process.env.BROWSER_MODULE);browser=await chromium.launch({headless:true});
 async function open(actor,locale='en-US'){
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  const cookies=actor?[...actor.jar.values()].map(c=>({name:c.name,value:c.value,domain:'osekola.com',path:'/',secure:true,sameSite:'Lax'})):[];
  await context.addCookies(cookies.concat([{name:'osekola_locale',value:locale,domain:'osekola.com',path:'/',secure:true,sameSite:'Lax'}]));
  const page=await context.newPage();page.setDefaultTimeout(30000);return {context,page};
 }
 for(const actor of users.slice(0,6)){
  const {context,page}=await open(actor);await page.goto('https://osekola.com/dashboard');await page.locator('.owner-banner h1').waitFor();
  await page.locator('.school-module-nav a').first().waitFor();
  const links=await page.locator('.school-module-nav a').evaluateAll(xs=>xs.map(x=>x.getAttribute('href')));
  assert.deepEqual(links,menus[actor.role].map(p=>'/dashboard'+(p?'/'+p:'')),actor.role+' menu');
  await page.locator('.owner-avatar-trigger').click();await page.locator('#account-popover').waitFor();await page.locator('.owner-banner h1').click();assert.equal(await page.locator('#account-popover').count(),0);
  if(actor!==owner){await page.locator('.p5-bars>div').first().waitFor();await page.locator('.owner-metric strong').first().filter({hasText:/\d/}).waitFor();}
  await page.screenshot({path:output+'/'+actor.role.toLowerCase()+'-dashboard.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:output+'/'+actor.role.toLowerCase()+'-mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),actor.role+' mobile overflow');
  if(actor!==owner){await page.locator('.p5-dashboard-chart').scrollIntoViewIfNeeded();await page.screenshot({path:output+'/'+actor.role.toLowerCase()+'-mobile-chart.png'});await page.locator('.p5-shortcuts a').first().scrollIntoViewIfNeeded();await page.screenshot({path:output+'/'+actor.role.toLowerCase()+'-mobile-shortcuts.png'});}
  if(actor===parent){await page.goto('https://osekola.com/dashboard/learning');await page.getByText('Published Part 5 family task',{exact:true}).waitFor();const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download PDF',exact:true}).click();await (await download).saveAs(output+'/parent-learning.pdf');await page.goto('https://osekola.com/dashboard/finance');await page.getByText('P5-VERIFY',{exact:true}).waitFor();assert.equal(await page.getByRole('tab',{name:'Manage transactions'}).count(),0);}
  if(actor===staff){await page.goto('https://osekola.com/dashboard/attendance/enrollment');await page.getByRole('heading',{name:'Face enrollment',exact:true}).waitFor();await page.getByRole('button',{name:/Part5 fixture STUDENT 4/}).waitFor();await page.screenshot({path:output+'/face-enrollment-mobile.png',fullPage:true});
   const models=await page.evaluate(async()=>{await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/vendor/human/human.js';s.onload=resolve;s.onerror=reject;document.head.append(s);});const engine=new window.Human.Human({backend:'webgl',warmup:'none',debug:false,modelBasePath:'/vendor/human/',face:{enabled:true,detector:{maxDetected:2},mesh:{enabled:true},iris:{enabled:false},description:{enabled:false},emotion:{enabled:false},gear:{enabled:false},mobilefacenet:{enabled:true,modelPath:'/vendor/human/mobileface.json'},antispoof:{enabled:true},liveness:{enabled:true}},body:{enabled:false},hand:{enabled:false},gesture:{enabled:false},object:{enabled:false},segmentation:{enabled:false}});await engine.load();const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;const ctx=canvas.getContext('2d');ctx.fillStyle='black';ctx.fillRect(0,0,320,240);const result=await engine.detect(canvas);return {faces:result.face.length,loaded:engine.models.list().length};});assert.equal(models.faces,0);assert.ok(models.loaded>=5);record('PASS: production self-hosted face models load; blank frame yields no face.');}
  if([principal,staff,teacher,parent].includes(actor)){await page.goto('https://osekola.com/dashboard/gallery');await page.locator('.school-module-nav a').first().waitFor();await page.locator('.p5-gallery-photo img').first().evaluate(async img=>{await img.decode();if(!img.naturalWidth)throw new Error('Gallery image did not render');});assert.equal(await page.getByRole('button',{name:'Upload / replace file',exact:true}).count(),actor===staff?1:0);await page.screenshot({path:output+'/'+actor.role.toLowerCase()+'-gallery.png',fullPage:true});await page.locator('.p5-gallery-photo').first().click();await page.locator('.p5-lightbox').evaluate(async img=>{await img.decode();if(!img.naturalWidth)throw new Error('Gallery lightbox did not render');});await page.screenshot({path:output+'/'+actor.role.toLowerCase()+'-gallery-lightbox.png'});}
  await context.close();record('PASS: '+actor.role+' navigation, avatar, desktop/mobile dashboard and applicable workspaces.');
 }
 ok(await owner.client.rpc('school_staff_teacher_roles',{target:staff.id,codes:['STAFF','TEACHER']}));
 const {context:dualContext,page:dualPage}=await open(staff);await dualPage.goto('https://osekola.com/dashboard');await dualPage.locator('.school-module-nav a[href="/dashboard/exams"]').waitFor();for(const href of ['attendance','learning','finance'])assert.equal(await dualPage.locator(`.school-module-nav a[href="/dashboard/${href}"]`).count(),1);await dualContext.close();
 const {context:publicContext,page:publicPage}=await open();await publicPage.goto('https://osekola.com/');await publicPage.locator('#curricula').waitFor();assert.equal(await publicPage.locator('.p5-curriculum-badges a').count(),11);await publicPage.screenshot({path:output+'/landing-desktop.png',fullPage:true});await publicPage.locator('.ose-product-card').filter({hasText:'O-Connect'}).click();await publicPage.locator('.ose-module-dialog[open] .p5-connect-art').waitFor();await publicPage.screenshot({path:output+'/connect-popup.png',fullPage:true});await publicPage.keyboard.press('Escape');await publicPage.setViewportSize({width:390,height:844});await publicPage.screenshot({path:output+'/landing-mobile.png',fullPage:true});assert.ok(await publicPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Public landing mobile overflow');await publicPage.setViewportSize({width:1440,height:1000});await publicPage.goto('https://osekola.com/login');await publicPage.locator('.ose-logo-full').waitFor();await publicPage.screenshot({path:output+'/login.png',fullPage:true});
 await publicPage.goto('https://osekola.com/assessment');await publicPage.getByRole('button',{name:'Start the journey'}).click();for(let i=0;i<20;i++){await publicPage.getByText(`Question ${i+1} of 20`,{exact:true}).waitFor();assert.equal(await publicPage.getByText('Pilih kondisi sekolah Anda',{exact:true}).count(),0);await publicPage.locator('.school-answer-list input').first().check();await publicPage.getByRole('button',{name:i===19?'See results':'Continue',exact:true}).click();}await publicPage.getByRole('heading',{name:'Find the best next step for your school.'}).waitFor();await publicPage.screenshot({path:output+'/assessment-english.png',fullPage:true});
 await publicPage.goto('https://osekola.com/admissions/'+`P5-VERIFY-${run}-0`);await publicPage.getByRole('button',{name:'Already registered? Check status'}).click();await publicPage.locator('input[name=id]').fill(receipt.id);await publicPage.locator('input[name=token]').fill(receipt.access_token);await publicPage.getByRole('button',{name:'Check status',exact:true}).click();await publicPage.getByRole('heading',{name:'Synthetic Part 5 applicant'}).waitFor();const cardDownload=publicPage.waitForEvent('download');await publicPage.getByRole('button',{name:'Download PDF',exact:true}).click();await(await cardDownload).saveAs(output+'/spmb-exam-card.pdf');await publicPage.reload();await publicPage.getByRole('heading',{name:'Synthetic Part 5 applicant'}).waitFor();await publicContext.close();
 ok(await owner.client.rpc('school_tenant_archive',{target:tenants[1],confirmation:`Part 5 verification ${run} 1`}));assert.equal((await api(foreignTeacher,'/courses')).status,401);ok(await owner.client.rpc('school_tenant_archive',{target:tenants[1],confirmation:`Part 5 verification ${run} 1`,restore:true}));
 record('PASS: dual-role navigation, curriculum landing, login branding, 20 English assessment questions, downloadable family report/exam card, private receipt refresh and tenant archive/restore.');
}finally{
 await browser?.close();const failures=[];
 if(users[2]&&users[4]){try{ok(await users[2].client.rpc('school_face_delete',{target:users[4].id}));}catch(e){failures.push('Face cleanup: '+e.message);}}
 if(uploads.length){try{ok(await admin.storage.from('tenant-media').remove(uploads));}catch(e){failures.push('Gallery cleanup: '+e.message);}}
 const tables=['school_face_challenges','school_user_attendance','school_face_enrollments','school_payment_intents','school_payment_config','school_admission_receipts','school_admission_applications','school_admission_cycles','school_guardians','payments','student_bills','finance_accounts','finance_categories','submissions','assignments','school_question_items','school_question_sets','exams','lessons','courses','attendance_records','student_assignments','teacher_assignments','teachers','students','classrooms','subjects','semesters','academic_years','notifications','audit_logs','calendars','school_settings'];
 for(const table of tables){try{ok(await admin.from(table).delete().in('tenant_id',tenants),'Cleanup '+table);}catch(e){failures.push(e.message);}}
 const profiles=ok(await admin.from('users').select('id,email,tenant_id').in('tenant_id',tenants));
 for(const u of profiles){try{assert.ok(u.email.startsWith('part5-'+run+'-'));const auth=ok(await admin.auth.admin.getUserById(u.id)).user;assert.equal(auth.app_metadata.tenant_id,u.tenant_id);ok(await admin.auth.admin.deleteUser(u.id));}catch(e){failures.push('User cleanup: '+e.message);}}
 for(const [i,tenant]of tenants.entries()){try{ok(await admin.from('tenants').delete().eq('id',tenant).eq('code',`P5-VERIFY-${run}-${i}`));}catch(e){failures.push('Tenant cleanup: '+e.message);}}
 const remaining=ok(await admin.from('users').select('id').in('tenant_id',tenants));const remainingTenants=ok(await admin.from('tenants').select('id').in('id',tenants));
 await writeFile(output+'/verification.json',JSON.stringify({release:process.env.EXPECTED_WEB_RELEASE,checks,cleanup:{remainingUsers:remaining.length,remainingTenants:remainingTenants.length,failures}},null,2));assert.deepEqual(failures,[]);assert.equal(remaining.length,0);assert.equal(remainingTenants.length,0);record('PASS: disposable users, tenants, gallery, receipts, face templates and related records removed.');
}
