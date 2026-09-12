import { createClient } from '@supabase/supabase-js';
import { createCipheriv,publicEncrypt,randomBytes } from 'node:crypto';
import { readFileSync,writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const project='https://xrqjutbwnlkogpfhtuwr.supabase.co';
assert.equal(process.env.SUPABASE_URL?.replace(/\/$/,''),project,'Unexpected Supabase project');
assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY,'Missing server credential');
assert.ok(process.env.DEMO_OUTPUT_FILE,'Encrypted output path required');
const db=createClient(project,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const check=r=>{if(r.error)throw new Error(r.error.message);return r.data;};
const roles=check(await db.from('roles').select('id,code').in('code',['PRINCIPAL','STAFF','TEACHER','STUDENT','PARENT']).eq('is_active',true));
assert.equal(roles.length,5,'Canonical role catalog incomplete');
check(await db.from('school_guardians').select('id').limit(0));
const plans=[{code:'OSEKOLA-PART2-DEMO-A',label:'Sekolah Nusantara · Demo OSEKOLA',prefix:'demo-a'},{code:'OSEKOLA-PART2-DEMO-B',label:'Sekolah Cendekia · Demo OSEKOLA',prefix:'demo-b'}];
const accounts=plans.flatMap(s=>[['PRINCIPAL',1],['STAFF',3],['TEACHER',5],['STUDENT',50],['PARENT',50]].flatMap(([role,count])=>Array.from({length:count},(_,i)=>({school:s.code,role,index:i+1,email:`${s.prefix}.${role.toLowerCase()}${String(i+1).padStart(2,'0')}@demo.osekola.test`,password:'Os!'+randomBytes(24).toString('base64url'),status:'PLANNED'}))));
assert.equal(accounts.length,218);
const publicKey=readFileSync('ops/part2-demo-recipient-public.pem');
function checkpoint(){const key=randomBytes(32),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);const bytes=Buffer.concat([cipher.update(JSON.stringify({version:1,generated_at:new Date().toISOString(),login_url:'https://osekola.com/login',accounts}),'utf8'),cipher.final()]);writeFileSync(process.env.DEMO_OUTPUT_FILE,JSON.stringify({version:1,key:publicEncrypt(publicKey,key).toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:bytes.toString('base64')}),{mode:0o600});}
// Encrypt planned credentials before the first Auth operation, and after each creation.
const existing=check(await db.from('users').select('id,email,tenant_id').in('email',accounts.map(a=>a.email)));
for(const account of accounts){const known=existing.find(u=>u.email===account.email);if(known){account.id=known.id;account.password='';account.status='EXISTING_UNCHANGED';}}
checkpoint();
async function ensure(table,match,payload){let query=db.from(table).select('*');for(const [k,v]of Object.entries(match))query=query.eq(k,v);const known=check(await query.maybeSingle());return known??check(await db.from(table).insert({...match,...payload}).select('*').single());}
try{
 for(const school of plans){
 const tenant=await ensure('tenants',{code:school.code},{name:school.label,notifications_email_enabled:false});assert.equal(tenant.is_active,true,'Demo school is inactive');
 for(const a of accounts.filter(a=>a.school===school.code)){
 if(a.id){assert.equal(existing.find(u=>u.id===a.id).tenant_id,tenant.id,'Existing identity belongs to another school');const identity=check(await db.auth.admin.getUserById(a.id));assert.equal(identity.user.app_metadata.osekola_demo,'part2-20260912','Reserved email belongs to a non-demo identity');}
 else{const created=check(await db.auth.admin.createUser({email:a.email,password:a.password,email_confirm:true,app_metadata:{tenant_id:tenant.id,osekola_demo:'part2-20260912'},user_metadata:{full_name:`Demo ${a.role} ${String(a.index).padStart(2,'0')}`}}));a.id=created.user.id;a.status='CREATED';checkpoint();}
 const profile=check(await db.from('users').select('tenant_id,is_active').eq('id',a.id).single());assert.equal(profile.tenant_id,tenant.id,'Unexpected profile tenant');assert.equal(profile.is_active,true,'Existing demo identity inactive');
 const role=roles.find(r=>r.code===a.role);await ensure('user_roles',{user_id:a.id,role_id:role.id},{});
 if(a.role==='TEACHER')a.teacher_id=(await ensure('teachers',{tenant_id:tenant.id,user_id:a.id},{employee_number:`DEMO-T${a.index}`,employment_status:'ACTIVE'})).id;
 if(a.role==='STUDENT')a.student_id=(await ensure('students',{tenant_id:tenant.id,user_id:a.id},{student_number:`DEMO-S${String(a.index).padStart(3,'0')}`,enrollment_status:'ACTIVE'})).id;
 }
 const members=accounts.filter(a=>a.school===school.code),teachers=members.filter(a=>a.role==='TEACHER'),students=members.filter(a=>a.role==='STUDENT'),parents=members.filter(a=>a.role==='PARENT');
 const year=await ensure('academic_years',{tenant_id:tenant.id,name:'Demo 2026/2027'},{starts_on:'2026-07-01',ends_on:'2027-06-30',is_active:true});
 const semester=await ensure('semesters',{tenant_id:tenant.id,academic_year_id:year.id,name:'Semester Ganjil Demo'},{starts_on:'2026-07-01',ends_on:'2026-12-31',is_active:true});
 const subject=await ensure('subjects',{tenant_id:tenant.id,code:'DEMO-MAT'},{name:'Matematika Demo',is_active:true});
 const account=await ensure('finance_accounts',{tenant_id:tenant.id,name:'Kas Demo'},{account_type:'CASH',is_active:true});
 const category=await ensure('finance_categories',{tenant_id:tenant.id,name:'SPP Demo'},{category_type:'INCOME',is_active:true});
 await ensure('school_settings',{tenant_id:tenant.id},{plan_code:school.prefix==='demo-a'?'ESSENTIAL':'ELEVATE'});
 await ensure('school_canteens',{tenant_id:tenant.id,name:'Kantin Demo'},{operator_name:'Pengelola Demo',location:'Area sekolah demo',opening_hours:'Senin–Jumat 07.00–15.00'});
 for(let c=0;c<5;c++){
 const teacher=teachers[c];const room=await ensure('rooms',{tenant_id:tenant.id,name:`Ruang Demo ${c+1}`},{code:`DEMO-R${c+1}`,capacity:20,is_active:true});
 const classroom=await ensure('classrooms',{tenant_id:tenant.id,academic_year_id:year.id,name:`Kelas Demo ${c+1}`},{capacity:20,is_active:true,homeroom_teacher_user_id:teacher.id});
 await ensure('school_assets',{tenant_id:tenant.id,name:room.name},{category:'CLASSROOM',capacity:20,room_id:room.id});
 await ensure('teacher_assignments',{tenant_id:tenant.id,teacher_id:teacher.teacher_id,classroom_id:classroom.id,subject_id:subject.id,semester_id:semester.id},{academic_year_id:year.id,is_active:true});
 const course=await ensure('courses',{tenant_id:tenant.id,name:`Matematika · Demo ${c+1}`},{teacher_id:teacher.teacher_id,classroom_id:classroom.id,subject_id:subject.id,academic_year_id:year.id,semester_id:semester.id,is_active:true});
 for(const student of students.slice(c*10,c*10+10)){
 await ensure('student_assignments',{tenant_id:tenant.id,student_id:student.student_id,classroom_id:classroom.id,semester_id:semester.id},{academic_year_id:year.id,is_active:true});
 await ensure('school_guardians',{tenant_id:tenant.id,parent_user_id:parents[student.index-1].id,student_id:student.student_id},{relationship:'PARENT'});
 const bill=await ensure('student_bills',{tenant_id:tenant.id,invoice_number:`DEMO-202609-${student.index}`},{student_id:student.student_id,category_id:category.id,amount:100000,due_date:'2026-09-30',status:'OPEN'});
 if(student.index%2===0)await ensure('payments',{tenant_id:tenant.id,receipt_number:`DEMO-R-${student.index}`},{student_bill_id:bill.id,account_id:account.id,amount:50000,paid_at:'2026-09-12T00:00:00Z',status:'CONFIRMED',reference:'Fictional demo, no actual payment'});
 }
 // Publication follows enrollment so the existing cross-module triggers reach the roster.
 const lesson=await ensure('lessons',{tenant_id:tenant.id,course_id:course.id,title:'Mengenal bilangan dan pola'},{material:'Materi latihan fiktif untuk mencoba alur pembelajaran OSEKOLA.',scheduled_at:'2026-09-21T01:00:00Z',is_published:true});
 await ensure('assignments',{tenant_id:tenant.id,course_id:course.id,title:'Latihan pola bilangan demo'},{instructions:'Tuliskan lima contoh pola bilangan. Data demo, bukan penugasan sekolah sebenarnya.',due_at:'2026-09-28T08:00:00Z',max_score:100,is_published:true});
 const mediaPath=`${tenant.id}/learning/${teacher.id}/demo-bilangan.pdf`;
 const listed=check(await db.storage.from('tenant-learning').list(`${tenant.id}/learning/${teacher.id}`,{search:'demo-bilangan.pdf'}));
 if(!listed.some(f=>f.name==='demo-bilangan.pdf'))check(await db.storage.from('tenant-learning').upload(mediaPath,demoPdf(),{contentType:'application/pdf',upsert:false}));
 await ensure('school_library',{tenant_id:tenant.id,title:`Panduan bilangan Demo ${c+1}`},{kind:'PDF',url:`/api/media/file?bucket=tenant-learning&path=${encodeURIComponent(mediaPath)}`,subject_id:subject.id,course_id:course.id,lesson_id:lesson.id,created_by:teacher.id});
 await ensure('school_timetable',{tenant_id:tenant.id,classroom_id:classroom.id,semester_id:semester.id,weekday:1,starts_at:'08:00:00'},{ends_at:'09:00:00',subject_id:subject.id,teacher_id:teacher.teacher_id,room_id:room.id});
 }
 console.log(`Demo school ready: ${school.code}; 109 identities, 50 guardian links, 5 classes.`);
 }
 checkpoint();console.log('PART2_DEMO_READY: 2 schools, 218 identities. Existing passwords unchanged.');
}catch(error){checkpoint();throw error;}

function demoPdf(){
 const stream='BT /F1 18 Tf 50 760 Td (OSEKOLA - Bilangan Demo) Tj 0 -36 Td /F1 12 Tf (1 + 1 = 2. Lanjutkan pola: 2, 4, 6, ...) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
 let out='%PDF-1.4\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(out));out+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}const xref=Buffer.byteLength(out);out+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(out);
}
