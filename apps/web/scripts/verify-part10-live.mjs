import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
export async function verifyPart10({users,owner,staff,teacher,student,parent,foreign,ids,tenants,run,admin,rpc,denied,record,picture,open,applicationIds}){
 const ok=(r,label)=>{if(r.error)throw new Error(`${label}: ${r.error.message}`);return r.data;};
 const principal=users.find(u=>u.role==='PRINCIPAL');
 // Owner form and confirmation do not persist until the final confirm action.
 const ownerPage=await open(owner,'/dashboard/tenants');
 const tenantName=`Part 7 verification ${run} 0`;
 await ownerPage.getByRole('button',{name:tenantName,exact:true}).click();
 const tenantDialog=ownerPage.getByRole('dialog');
 await tenantDialog.getByLabel('NPSN',{exact:true}).fill('10000010');
 await tenantDialog.getByLabel('Province',{exact:true}).selectOption('31');
 const city=tenantDialog.getByLabel('Regency / City',{exact:true});await city.locator('option[value="31.71"]').waitFor({state:'attached'});await city.selectOption('31.71');
 const district=tenantDialog.getByLabel('District',{exact:true});await district.locator('option[value="31.71.01"]').waitFor({state:'attached'});await district.selectOption('31.71.01');
 const village=tenantDialog.getByLabel('Village',{exact:true});await village.locator('option').nth(1).waitFor({state:'attached'});await village.selectOption({index:1});
 await tenantDialog.getByLabel('Street & Address Details',{exact:true}).fill('Synthetic Part10 verification address');
 await picture(ownerPage,'part10-tenant-form');await picture(ownerPage,'part10-tenant-form-mobile',true);
 await tenantDialog.getByRole('button',{name:'Save',exact:true}).click();await ownerPage.getByRole('dialog',{name:'Confirm School Details'}).waitFor();
 assert.equal(ok(await admin.from('tenants').select('npsn').eq('id',tenants[0]).single(),'before confirm').npsn,null);
 await ownerPage.getByRole('button',{name:'Confirm & Save',exact:true}).click();await ownerPage.getByRole('dialog',{name:'Confirm School Details'}).waitFor({state:'hidden'});
 assert.equal(ok(await admin.from('tenants').select('npsn').eq('id',tenants[0]).single(),'saved tenant').npsn,'10000010');
 if(applicationIds[0]){await rpc(owner,'school_owner_save',{kind:'application',record_id:applicationIds[0],payload:{estimated_students:850}});await ownerPage.goto('https://osekola.com/dashboard/partners');await ownerPage.getByRole('row').filter({hasText:'Part8 fixture '+run}).getByRole('button',{name:'View CV',exact:true}).click();await ownerPage.locator('.p10-pdf-viewer').waitFor();const cv=await ownerPage.request.get('https://osekola.com/api/partners/cv?id='+applicationIds[0]+'&view=inline');assert.equal(cv.status(),200);assert.match(cv.headers()['content-disposition'],/^inline;/);await picture(ownerPage,'part10-cv-viewer');}
 record('Part10 tenant cascading address and Save confirmation persist correct values; CV opens as an authenticated inline PDF');
 const staffPage=await open(staff,'/dashboard/academic');await staffPage.getByRole('meter',{name:'Readiness'}).waitFor();assert.equal(await staffPage.locator('.p7-insights').count(),0);assert.equal(await staffPage.locator('.ose-module-page>.ose-page-heading').count(),0);await picture(staffPage,'part10-academic');await picture(staffPage,'part10-academic-mobile',true);
 const teacherPage=await open(teacher,'/dashboard/academic');await teacherPage.locator('.ose-module-page .ose-status').waitFor();assert.equal(await teacherPage.locator('[data-testid="school-setup"]').count(),0);assert.equal(await teacherPage.locator('.school-module-nav a[href="/dashboard/academic"]').count(),0);
 await denied(student.client.rpc('school_family_report',{kind:'academic',student:ids.student}));
 const p10Pages=[staffPage,teacherPage]; for(const actor of [principal,student,parent])p10Pages.push(await open(actor,'/dashboard'));
 for(const page of p10Pages){await page.goto('https://osekola.com/dashboard');await page.locator('.p5-role-banner img').waitFor();await page.locator('.ose-theme').click();await picture(page,'part10-role-dark-'+p10Pages.indexOf(page));await page.locator('.ose-theme').click();}
 await staffPage.goto('https://osekola.com/dashboard');await staffPage.locator('.p5-role-banner .p9-leave-launch').waitFor();
 record('Part10 Academic is Staff-only, readiness meter renders, retired sidebar is absent and Request leave sits inside the hero');
 const room=randomUUID(),asset=randomUUID(),calendar=randomUUID();
 ok(await admin.from('rooms').insert({id:room,tenant_id:tenants[0],code:'P10-LAB',name:'Part10 science laboratory'}),'room');
 ok(await admin.from('school_assets').insert({id:asset,tenant_id:tenants[0],name:'Part10 science laboratory',category:'LAB',room_id:room}),'asset');
 ok(await admin.from('calendars').insert({id:calendar,tenant_id:tenants[0],owner_user_id:staff.id,name:'Part10 school events'}),'calendar');
 const weekday=3,start='2026-10-07T01:00:00Z',end='2026-10-07T02:00:00Z';
 const event=await rpc(staff,'school_calendar_save',{calendar_uuid:calendar,payload:{title:'Part10 science club',starts_at:start,ends_at:end,asset_id:asset,recurrence_rule:'FREQ=WEEKLY;COUNT=3'}});
 const conflict=await staff.client.rpc('school_calendar_save',{calendar_uuid:calendar,payload:{title:'Must conflict',starts_at:'2026-10-14T01:30:00Z',ends_at:'2026-10-14T02:30:00Z',asset_id:asset}});assert.equal(conflict.error?.code,'23P01');
 ok(await admin.from('school_timetable').insert({tenant_id:tenants[0],classroom_id:ids.classroom,subject_id:ids.subject,teacher_id:ids.teacher,semester_id:ids.semester,weekday,starts_at:'10:00',ends_at:'11:00',room_id:room}),'teaching timetable');
 const events=await rpc(teacher,'school_calendar_context',{starts:'2026-10-01',ends:'2026-11-01'});assert.ok(events.events.some(e=>e.source_table==='school_timetable'&&e.asset_name==='Part10 science laboratory'));
 await staffPage.getByRole('button',{name:'Calendar',exact:true}).click();await staffPage.locator('.p10-calendar').waitFor();await staffPage.getByLabel('Date',{exact:true}).fill('2026-10-07');await staffPage.getByText('Part10 science club',{exact:false}).first().waitFor();await picture(staffPage,'part10-calendar');await picture(staffPage,'part10-calendar-mobile',true);
 await staffPage.getByRole('button',{name:'Event',exact:true}).click();await staffPage.getByLabel('Book Asset / Room (Optional)',{exact:true}).selectOption(asset);await picture(staffPage,'part10-event-booking');await staffPage.getByRole('dialog',{name:'New event'}).getByRole('button',{name:'Close modal'}).click();
 record('Part10 calendar renders desktop/mobile, repeated asset conflicts are rejected and teaching events include rooms');
 await staffPage.goto('https://osekola.com/dashboard/team');await staffPage.getByRole('button',{name:'+ Project',exact:true}).click();const projectDialog=staffPage.getByRole('dialog',{name:'New Project'});
 await projectDialog.getByLabel('Project key',{exact:true}).fill('P10-LIVE');await projectDialog.getByLabel('Project name',{exact:true}).fill('Part10 science festival');
 for(const [label,u] of [['Chair / PIC',staff],['Secretary',teacher],['Treasurer',principal]]){await projectDialog.getByLabel(label,{exact:true}).fill(ok(await admin.from('users').select('full_name').eq('id',u.id).single(),'person').full_name);}
 await projectDialog.getByLabel('Starts',{exact:true}).fill('2026-10-01');await projectDialog.getByLabel('Ends',{exact:true}).fill('2026-10-31');await picture(staffPage,'part10-project-create');
 await projectDialog.getByRole('button',{name:'Create project',exact:true}).click();await projectDialog.waitFor({state:'hidden'});
 const project=ok(await admin.from('team_projects').select('id').eq('tenant_id',tenants[0]).eq('code','P10-LIVE').single(),'project');
 const activity=await rpc(staff,'school_project_work',{project_uuid:project.id,action:'activity',payload:{title:'Part10 main activity',starts_on:'2026-10-05',due_date:'2026-10-07',assignee_user_id:teacher.id}});
 const sub=await rpc(staff,'school_project_work',{project_uuid:project.id,action:'activity',payload:{title:'Part10 subactivity',parent_task_id:activity.id,starts_on:'2026-10-06',due_date:'2026-10-06',assignee_user_id:staff.id}});
 await rpc(staff,'school_project_work',{project_uuid:project.id,action:'member',payload:{user_id:parent.id,position:'MEMBER'}});
 const calendarParent=await rpc(parent,'school_calendar_context',{starts:'2026-10-01',ends:'2026-11-01'});for(const id of [project.id,activity.id,sub.id])assert.ok(calendarParent.events.some(e=>e.source_id===id));
 await denied(foreign.client.rpc('school_project_work',{project_uuid:project.id}));await staffPage.reload();await staffPage.getByRole('button',{name:'Part10 main activity',exact:true}).waitFor();assert.equal(await staffPage.getByRole('button',{name:'+ Project',exact:true}).count(),1);await picture(staffPage,'part10-project-table');await picture(staffPage,'part10-project-table-mobile',true);
 record('Part10 searchable committee creation, one project entrypoint, nested activities, member actions and recipient calendar timelines');
 let group;
 try{
 group=await rpc(owner,'school_group_save',{payload:{name:'Part10 foundation '+run,principals:[principal.id]}});
 for(const tenant of tenants)await rpc(owner,'school_owner_save',{kind:'tenant',record_id:tenant,payload:{group_id:group.id}});
 const scope=await rpc(principal,'school_context');assert.equal(scope.foundation_schools.length,2);assert.equal(scope.foundation_principal,true);
 assert.equal((await rpc(principal,'school_principal_overview',{target_tenant:tenants[1]})).students_total,0);await denied(principal.client.rpc('school_approval_queue'));assert.equal(await rpc(principal,'school_approval_count'),0);
 const principalPage=await open(principal,'/dashboard');await principalPage.locator('.p10-school-switcher button').first().waitFor();assert.equal(await principalPage.locator('.school-module-nav a[href="/dashboard/approval"]').count(),0);await principalPage.locator('.p10-school-switcher button').nth(1).click();await picture(principalPage,'part10-foundation-dashboard');await picture(principalPage,'part10-foundation-dashboard-mobile',true);
 await rpc(owner,'school_group_save',{record_id:group.id,payload:{name:'Part10 foundation '+run,principals:[]}});await denied(principal.client.rpc('school_principal_overview',{target_tenant:tenants[1]}));
 record('Part10 foundation school switching, denied approval access and immediate server-side revocation');
 }finally{if(group)ok(await admin.from('school_groups').delete().eq('id',group.id),'fixture foundation cleanup');}
 ok(await admin.from('calendar_events').delete().eq('id',event.id),'fixture event cleanup');
}
