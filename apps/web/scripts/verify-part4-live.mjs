// Production checks use owned disposable tenants/users only. No email is sent.
// Never send a message or change curriculum in an existing school's tenant.
import assert from 'node:assert/strict';
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
const run=randomUUID(),tenants=[randomUUID(),randomUUID()],users=[],uploads=[],checks=[];let browser;
const record=label=>{checks.push(label);console.log(label);};
const roleCodes=['OWNER','PRINCIPAL','STAFF','TEACHER','STUDENT','PARENT'];
const roleIds=new Map(ok(await admin.from('roles').select('id,code').in('code',roleCodes)).map(r=>[r.code,r.id]));
const ids={year:randomUUID(),semester:randomUUID(),classroom:randomUUID(),subject:randomUUID(),teacher:randomUUID(),student:randomUUID(),peer:randomUUID(),course:randomUUID(),lesson:randomUUID(),exam:randomUUID()};
const denied=async promise=>assert.equal((await promise).error?.code,'42501');
const insert=async(table,data)=>ok(await admin.from(table).insert(data),'Insert '+table);
const save=async(actor,resource,payload)=>ok(await actor.client.rpc('school_curriculum_save',{resource,payload}),'Curriculum '+resource);
async function api(actor,path){return fetch('https://api.osekola.com/api/v1'+path,{headers:{Authorization:`Bearer ${actor.token}`},signal:AbortSignal.timeout(30000)});}
try {
 let ready=false;for(let i=0;i<100;i++){try{const h=await fetch('https://osekola.com/healthz',{signal:AbortSignal.timeout(10000)});ready=h.ok&&(await h.json()).release===process.env.EXPECTED_WEB_RELEASE;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,5000));}assert.ok(ready,'Expected frontend release unavailable');
 const health=await fetch('https://api.osekola.com/api/v1/health');assert.equal(health.status,200);assert.equal((await fetch('https://api.osekola.com/api/v1/ready')).status,200);
 record('PASS: expected production frontend release and public API health/readiness.');
 await insert('tenants',tenants.map((id,i)=>({id,name:`Part4 verification ${run} ${i}`,code:`P4-VERIFY-${run}-${i}`})));
 for(const [index,role] of [...roleCodes,'STUDENT','TEACHER','STUDENT'].entries()){
  const tenant=tenants[index>=7?1:0],email=`part4-${run}-${index}@demo.osekola.test`,password=randomBytes(24).toString('base64url');
  const auth=ok(await admin.auth.admin.createUser({email,password,email_confirm:true,app_metadata:{tenant_id:tenant},user_metadata:{full_name:`Part4 fixture ${run} ${role} ${index}`}}));
  const actor={id:auth.user.id,email,password,role,tenant,jar:new Map()};users.push(actor);
  await insert('user_roles',{user_id:actor.id,role_id:roleIds.get(role)});
  actor.client=createServerClient(url,key,{cookies:{getAll:()=>[...actor.jar.values()],setAll:values=>values.forEach(c=>actor.jar.set(c.name,c))}});
  actor.token=ok(await actor.client.auth.signInWithPassword({email,password})).session.access_token;
 }
 await writeFile(output+'/fixtures.json',JSON.stringify({run,tenants,users:users.map(u=>u.id)},null,2));
 const [owner,principal,staff,teacher,student,parent,peer,foreignTeacher,foreignStudent]=users;
 await insert('academic_years',{id:ids.year,tenant_id:tenants[0],name:'Verification year',starts_on:'2026-07-01',ends_on:'2027-06-30',is_active:true});
 await insert('semesters',{id:ids.semester,tenant_id:tenants[0],academic_year_id:ids.year,name:'Verification semester',starts_on:'2026-07-01',ends_on:'2026-12-31',is_active:true});
 await insert('classrooms',{id:ids.classroom,tenant_id:tenants[0],academic_year_id:ids.year,name:'Verification class',homeroom_teacher_user_id:teacher.id});
 await insert('subjects',{id:ids.subject,tenant_id:tenants[0],code:'P4-MATH',name:'Mathematics'});
 await insert('teachers',{id:ids.teacher,tenant_id:tenants[0],user_id:teacher.id});
 await insert('students',[{id:ids.student,tenant_id:tenants[0],user_id:student.id,student_number:'P4-STUDENT'},{id:ids.peer,tenant_id:tenants[0],user_id:peer.id,student_number:'P4-PEER'}]);
 await insert('student_assignments',[ids.student,ids.peer].map(id=>({tenant_id:tenants[0],academic_year_id:ids.year,semester_id:ids.semester,classroom_id:ids.classroom,student_id:id})));
 await insert('courses',{id:ids.course,tenant_id:tenants[0],academic_year_id:ids.year,semester_id:ids.semester,classroom_id:ids.classroom,subject_id:ids.subject,teacher_id:ids.teacher,name:'Verification mathematics'});
 await insert('lessons',{id:ids.lesson,tenant_id:tenants[0],course_id:ids.course,title:'Verification lesson',material:'School-entered learning material',is_published:true});
 await insert('exams',{id:ids.exam,tenant_id:tenants[0],course_id:ids.course,title:'Verification exam',status:'DRAFT'});
 for(const actor of users.slice(0,6)){
  assert.equal((await api(actor,'/academic-years')).status,['STAFF','TEACHER'].includes(actor.role)?200:403,actor.role+' Academic API gate');
  assert.equal((await api(actor,'/courses')).status,['TEACHER','STUDENT'].includes(actor.role)?200:403,actor.role+' Learning API gate');
  assert.equal((await api(actor,'/exams')).status,actor.role==='TEACHER'?200:403,actor.role+' administrative Exam API gate');
  const exams=await actor.client.rpc('school_exam_list');
  if(['TEACHER','STUDENT'].includes(actor.role))ok(exams);else assert.equal(exams.error?.code,'42501');
 }
 record('PASS: production API role boundaries; students use assigned-class Exam participation.');
 const programme=async(framework,name,code)=>{
  const p=ok(await staff.client.rpc('school_curriculum_create_program',{payload:{academic_year_id:ids.year,framework,name,version:'Verification edition',language:framework==='MERDEKA'?'id':'en'},stages:[{code,name:code}]}));
  const st=ok(await staff.client.rpc('school_curriculum_list',{resource:'stages',program_uuid:p.id}))[0];
  const subject=await save(staff,'subjects',{program_id:p.id,stage_id:st.id,subject_id:ids.subject,name:name+' mathematics'});
  await save(staff,'enrollments',{program_id:p.id,stage_id:st.id,classroom_id:ids.classroom,...(framework==='CAMBRIDGE'?{student_id:ids.student}:{})});
  await save(staff,'course_links',{program_id:p.id,course_id:ids.course,curriculum_subject_id:subject.id});
  const outcome=await save(teacher,'outcomes',{program_id:p.id,curriculum_subject_id:subject.id,code:'GOAL-1',name:name+' reasoning',kind:framework==='MERDEKA'?'TP':'LEARNING_OBJECTIVE',description:'Explain mathematical reasoning using a school-developed task',sequence:1});
  const scale=await save(staff,'scales',{program_id:p.id,name:'School rubric v1',kind:'RUBRIC',minimum:0,maximum:8,criteria:'Explain the strategy and demonstrate understanding'});
  await save(teacher,'alignments',{course_id:ids.course,outcome_id:outcome.id,lesson_id:ids.lesson,purpose:'TEACH'});
  return {p,outcome,scale};
 };
 const merdeka=await programme('MERDEKA','Merdeka verification','C'),cambridge=await programme('CAMBRIDGE','Cambridge verification','PRIMARY');
 const evidence=await save(teacher,'evidence',{course_id:ids.course,student_id:ids.student,outcome_id:cambridge.outcome.id,scale_id:cambridge.scale.id,score:6,feedback:'Published verification evidence',status:'PUBLISHED'});
 await save(teacher,'evidence',{course_id:ids.course,student_id:ids.student,outcome_id:merdeka.outcome.id,scale_id:merdeka.scale.id,score:5,feedback:'Private draft verification evidence',status:'DRAFT'});
 const result=ok(await student.client.rpc('school_curriculum_learning',{course_uuid:ids.course}));assert.equal(result.programs.length,2);assert.equal(result.evidence.length,1);assert.equal(result.evidence[0].id,evidence.id);
 const peerResult=ok(await peer.client.rpc('school_curriculum_learning',{course_uuid:ids.course}));assert.equal(peerResult.programs.length,1);assert.equal(peerResult.evidence.length,0);
 await denied(parent.client.rpc('school_curriculum_learning',{course_uuid:ids.course}));await denied(foreignTeacher.client.rpc('school_curriculum_learning',{course_uuid:ids.course}));
 record('PASS: real multi-curriculum creation, individual enrolment, alignment, programme-scale evidence and draft/student isolation.');
 // Every message recipient below is asserted to be one of these disposable users.
 const conversation=async(sender,recipient)=>{assert.ok(users.some(u=>u.id===recipient.id));return ok(await sender.client.rpc('oconnect_create',{kind:'DIRECT',members:[recipient.id]}));};
 const cross=await conversation(owner,foreignStudent),direct=await conversation(student,peer);
 ok(await student.client.rpc('oconnect_send',{conversation:direct,message_id:randomUUID(),body:'Disposable peer message'}));
 await denied(student.client.rpc('oconnect_create',{kind:'DIRECT',members:[parent.id]}));await denied(principal.client.rpc('oconnect_create',{kind:'DIRECT',members:[student.id]}));await denied(foreignTeacher.client.rpc('oconnect_create',{kind:'DIRECT',members:[teacher.id]}));
 const path=`${foreignStudent.tenant}/${cross}/${owner.id}/verification.txt`;uploads.push(path);
 ok(await owner.client.storage.from('oconnect-attachments').upload(path,new Blob(['Disposable Part 4 attachment'],{type:'text/plain'}),{contentType:'text/plain'}));
 const message=ok(await owner.client.rpc('oconnect_send',{conversation:cross,message_id:randomUUID(),body:'Owner verification message',attachment:{path,name:'verification.txt'}}));
 const foreignThread=ok(await foreignStudent.client.rpc('oconnect_thread',{conversation:cross}));assert.equal(foreignThread.messages.length,1);assert.equal(foreignThread.can_send,false);
 assert.equal(await ok(await foreignStudent.client.storage.from('oconnect-attachments').download(path)).text(),'Disposable Part 4 attachment');
 await denied(foreignStudent.client.rpc('oconnect_send',{conversation:cross,message_id:randomUUID(),body:'Forbidden cross-tenant reply'}));
 record('PASS: Owner cross-tenant contact, message and attachment; non-Owner cross-tenant and prohibited recipient sends denied.');
 const {chromium}=await import(process.env.BROWSER_MODULE);browser=await chromium.launch({headless:true});
 const open=async(actor)=>{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addCookies([...actor.jar.values()].map(c=>({name:c.name,value:c.value,domain:'osekola.com',path:'/',secure:true,sameSite:'Lax'})).concat([{name:'osekola_locale',value:'en-US',domain:'osekola.com',path:'/',secure:true,sameSite:'Lax'}]));
  const page=await context.newPage();page.setDefaultTimeout(30000);return {context,page};
 };
 for(const actor of users.slice(0,6)){
  const {context,page}=await open(actor);
  for(const moduleKey of ['academic','learning','exams']){
   const allowed=(moduleKey==='academic'?['STAFF','TEACHER']:['TEACHER','STUDENT']).includes(actor.role);
   assert.equal((await page.goto('https://osekola.com/dashboard/'+moduleKey,{waitUntil:'domcontentloaded'})).status(),200);
   await page.locator('.ose-moduleKey-page').waitFor();
   if(allowed){await page.locator('.curriculum-workspace').first().waitFor();assert.equal(await page.locator('.ose-moduleKey-page > .ose-status').count(),0);}
   else await page.locator('.ose-moduleKey-page > .ose-status').waitFor();
  }
  if(actor===owner)assert.equal(await page.getByRole('link',{name:'O-Connect',exact:true}).count(),1);
  record('PASS: production route access for '+actor.role);
  await context.close();
 }
 const {context:teachingContext,page:teachingPage}=await open(teacher);
 await teachingPage.goto('https://osekola.com/dashboard/academic');await teachingPage.getByRole('heading',{name:'One school, multiple learning pathways'}).waitFor();
 await teachingPage.getByRole('button',{name:'Create programme from framework'}).click();await teachingPage.getByRole('button',{name:'Save programme',exact:true}).waitFor();
 await teachingPage.screenshot({path:output+'/academic-curriculum-desktop.png',fullPage:true});
 await teachingPage.goto('https://osekola.com/dashboard/learning');await teachingPage.getByRole('heading',{name:'Cambridge verification reasoning'}).waitFor();
 await teachingPage.getByRole('button',{name:'Progress & report',exact:true}).click();await teachingPage.getByText('Published verification evidence',{exact:true}).waitFor();
 await teachingPage.screenshot({path:output+'/curriculum-progress-desktop.png',fullPage:true});
 await teachingPage.setViewportSize({width:390,height:844});
 for(const route of ['academic','learning','exams']){
  await teachingPage.goto('https://osekola.com/dashboard/'+route);await teachingPage.locator('.curriculum-workspace').first().waitFor();
  assert.ok(await teachingPage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Mobile overflow in '+route);
  await teachingPage.screenshot({path:output+'/curriculum-'+route+'-mobile.png',fullPage:true});
 }
 await teachingContext.close();
 const {context:learnerContext,page:learnerPage}=await open(student);
 await learnerPage.goto('https://osekola.com/dashboard/learning');await learnerPage.getByRole('button',{name:'Progress & report',exact:true}).click();await learnerPage.getByText('Published verification evidence',{exact:true}).waitFor();
 assert.equal(await learnerPage.getByText('Private draft verification evidence',{exact:true}).count(),0);assert.equal(await learnerPage.getByRole('button',{name:'Save assessment'}).count(),0);
 await learnerPage.screenshot({path:output+'/student-curriculum-progress.png',fullPage:true});await learnerContext.close();
 const {context:receiverContext,page:receiverPage}=await open(foreignStudent);
 await receiverPage.goto('https://osekola.com/dashboard/connect?conversation='+cross);await receiverPage.getByText('Owner verification message',{exact:true}).waitFor();
 assert.equal(await receiverPage.getByRole('textbox',{name:'Write a message'}).count(),0);
 assert.equal((await receiverPage.request.get('https://osekola.com/api/connect/attachment?message='+message.id)).status(),200);
 await receiverPage.screenshot({path:output+'/owner-cross-tenant-received.png',fullPage:true});await receiverContext.close();
 record('PASS: desktop/mobile curriculum UI, student published report, read-only cross-tenant receipt and authenticated attachment route.');
} finally {
 await browser?.close();
 const failures=[];
 if(uploads.length){try{ok(await admin.storage.from('oconnect-attachments').remove(uploads),'Storage cleanup');}catch(e){failures.push(e.message);}}
 // References span the two owned tenants; clear each table for BOTH before users.
 const tables=['school_curriculum_evidence','school_curriculum_alignments','school_curriculum_course_links','school_curriculum_outcomes','school_curriculum_scales','school_curriculum_enrollments','school_curriculum_subjects','school_curriculum_stages','school_curriculum_programs','oconnect_messages','oconnect_members','oconnect_conversations','school_question_items','school_question_sets','exams','lessons','courses','student_assignments','teacher_assignments','teachers','students','classrooms','subjects','semesters','academic_years','notifications','audit_logs','calendars','school_settings'];
 for(const table of tables){try{ok(await admin.from(table).delete().in('tenant_id',tenants),'Cleanup '+table);}catch(e){failures.push(e.message);}}
 const profiles=ok(await admin.from('users').select('id,email,tenant_id').in('tenant_id',tenants));
 for(const u of profiles){try{assert.ok(u.email.startsWith('part4-'+run+'-'));const auth=ok(await admin.auth.admin.getUserById(u.id)).user;assert.equal(auth.app_metadata.tenant_id,u.tenant_id);ok(await admin.auth.admin.deleteUser(u.id),'Auth cleanup');}catch(e){failures.push(e.message);}}
 for(const tenant of tenants){try{ok(await admin.from('tenants').delete().eq('id',tenant).eq('code',`P4-VERIFY-${run}-${tenants.indexOf(tenant)}`),'Tenant cleanup');}catch(e){failures.push(e.message);}}
 const remaining=ok(await admin.from('users').select('id').in('tenant_id',tenants));const remainingTenants=ok(await admin.from('tenants').select('id').in('id',tenants));
 await writeFile(output+'/verification.json',JSON.stringify({release:process.env.EXPECTED_WEB_RELEASE,checks,cleanup:{remainingUsers:remaining.length,remainingTenants:remainingTenants.length,failures}},null,2));
 assert.deepEqual(failures,[],'Fixture cleanup failed');assert.equal(remaining.length,0);assert.equal(remainingTenants.length,0);
 record('PASS: all temporary Auth accounts, profiles, tenant records and attachments removed.');
}
