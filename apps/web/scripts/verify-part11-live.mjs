import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
export async function verifyPart11({users,staff,teacher,student,parent,peer,peerParent,foreign,ids,tenants,admin,rpc,denied,record,picture,open,output}){
 const ok=(r,label)=>{if(r.error)throw new Error(`${label}: ${r.error.message}`);return r.data;},principal=users.find(u=>u.role==='PRINCIPAL');
 const p=await rpc(staff,'school_project_template',{payload:{code:'P11-LIVE',name:'Part11 collaborative festival',description:'Disposable production verification',template:'CUSTOM',starts_on:'2026-10-01',due_on:'2026-10-30',committee:{CHAIR:staff.id,SECRETARY:teacher.id,TREASURER:parent.id}}});
 await denied(peer.client.rpc('school_project11',{action:'read',project_uuid:p.id}));await denied(foreign.client.rpc('school_project11',{action:'read',project_uuid:p.id}));
 assert.equal((await rpc(principal,'school_project11',{action:'read',project_uuid:p.id})).can_manage,false);
 const task=await rpc(staff,'school_project11',{action:'task',project_uuid:p.id,payload:{title:'Prepare festival booth',status:'TODO',assignees:[teacher.id,student.id],due_date:'2026-10-07'}});
 const sub=await rpc(staff,'school_project11',{action:'task',project_uuid:p.id,payload:{title:'Prepare booth materials',status:'TODO',assignees:[student.id],parent_task_id:task.id,due_date:'2026-10-06'}});
 const page=await open(staff,'/dashboard/team?project='+p.id);await page.getByRole('button',{name:'Prepare festival booth',exact:true}).waitFor();
 assert.equal(await page.locator('.p11-kanban-column').count(),4);const card=page.locator('.p11-task-card').filter({has:page.getByRole('button',{name:'Prepare festival booth',exact:true})});await card.dragTo(page.locator('.p11-kanban-column[data-status="IN_PROGRESS"]'));await page.locator('.p11-kanban-column[data-status="IN_PROGRESS"]').getByRole('button',{name:'Prepare festival booth',exact:true}).waitFor();
 assert.equal(ok(await admin.from('team_tasks').select('status').eq('id',task.id).single(),'drag state').status,'IN_PROGRESS');
 await picture(page,'part11-project-board');await picture(page,'part11-project-board-mobile',true);
 const studentPage=await open(student,'/dashboard/team?project='+p.id);await studentPage.getByRole('button',{name:'Prepare booth materials',exact:true}).waitFor();await studentPage.getByLabel('Status for Prepare booth materials',{exact:true}).selectOption('BLOCKED');await studentPage.locator('.p11-kanban-column[data-status="BLOCKED"]').getByRole('button',{name:'Prepare booth materials',exact:true}).waitFor();
 await denied(student.client.rpc('school_project11',{action:'member',project_uuid:p.id,payload:{user_id:peer.id,position:'MEMBER'}}));
 const notices=ok(await admin.from('notifications').select('id').eq('user_id',student.id).eq('resource_type','team_project').eq('resource_id',p.id),'assignment notice');assert.ok(notices.length);
 const targetCalendar=await rpc(student,'school_calendar_context',{starts:'2026-10-01',ends:'2026-11-01'});assert.ok(targetCalendar.events.some(e=>e.source_id===sub.id));
 record('Part11 Kanban drag-and-drop persists; multiple PICs/subtasks, assigned-only family access, Principal oversight, calendar and notification links');
 await rpc(student,'school_project11',{action:'move',project_uuid:p.id,record_id:sub.id,payload:{status:'DONE'}});const before=await rpc(staff,'school_project11',{action:'read',project_uuid:p.id});for(const t of before.tasks.filter(t=>t.status!=='DONE'))await rpc(staff,'school_project11',{action:'move',project_uuid:p.id,record_id:t.id,payload:{status:'DONE'}});
 const path=`${tenants[0]}/${p.id}/${randomUUID()}-event.pdf`;
 try{
  const {PDFDocument}=await import('pdf-lib');const doc=await PDFDocument.create();doc.addPage().drawText('OSEKOLA Part11 verification evidence');const bytes=await doc.save();
  ok(await staff.client.storage.from('project-evidence').upload(path,bytes,{contentType:'application/pdf'}),'evidence upload');
  const deniedFile=await peer.client.storage.from('project-evidence').createSignedUrl(path,60);assert.ok(deniedFile.error);
  await page.reload();await page.getByRole('button',{name:'View Project Report',exact:true}).click();await page.locator('.p11-pdf-viewer').waitFor();await picture(page,'part11-project-report');
  const download=page.waitForEvent('download');await page.getByRole('link',{name:'Download PDF',exact:true}).click();const file=await download;await file.saveAs(output+'/part11-project-report.pdf');await page.getByRole('dialog').getByRole('button',{name:'Close modal'}).click();
 }finally{ok(await admin.storage.from('project-evidence').remove([path]),'evidence cleanup');}
 const category=randomUUID();ok(await admin.from('finance_categories').insert({id:category,tenant_id:tenants[0],name:'Part11 Tuition',category_type:'INCOME'}),'category');
 const payload={name:'Part11 monthly tuition',category_id:category,amount:100000,discount:10000,occurrences:3,first_due:'2026-09-01',students:[ids.student],request_key:randomUUID()};const plan=await rpc(staff,'school_billing11',{payload});assert.equal(plan.invoices,3);assert.equal((await rpc(staff,'school_billing11',{payload})).already_published,true);
 assert.ok((await rpc(parent,'school_finance11')).outstanding>=270000);assert.equal((await rpc(peerParent,'school_finance11',{resource:'bills',filters:{query:'BP-'+plan.id.slice(0,8)}})).count,0);await denied(parent.client.rpc('school_finance11',{resource:'reconciliation'}));
 const finance=await open(staff,'/dashboard/finance');await finance.locator('.p11-money-card').first().waitFor();await picture(finance,'part11-finance-overview');await picture(finance,'part11-finance-mobile',true);await finance.getByRole('button',{name:'Billing',exact:true}).click();await finance.getByRole('button',{name:'Billing Plan',exact:true}).click();await finance.getByRole('dialog',{name:'Create Billing Plan'}).waitFor();await picture(finance,'part11-billing-composer');await finance.getByRole('dialog').getByRole('button',{name:'Close modal'}).click();
 const parentFinance=await open(parent,'/dashboard/finance');await parentFinance.getByRole('button',{name:'Family Bills',exact:true}).click();await parentFinance.locator('.p11-finance-table').waitFor();await picture(parentFinance,'part11-family-bills',true);
 record('Part11 completion evidence private storage and PDF preview/download; idempotent monthly discounted billing, child-only finance and responsive finance screens');
 const gallery=await open(staff,'/dashboard/gallery');await gallery.locator('.p10-workspace-hero').waitFor();const gy=await gallery.locator('.p10-workspace-hero').evaluate(e=>e.getBoundingClientRect().top);const team=await open(staff,'/dashboard/team');await team.locator('.p10-workspace-hero').waitFor();const ty=await team.locator('.p10-workspace-hero').evaluate(e=>e.getBoundingClientRect().top);assert.ok(Math.abs(gy-ty)<3,`Gallery spacing ${gy} vs Project ${ty}`);await picture(gallery,'part11-gallery');
 record('Part11 gallery hero top spacing matches Project');
}
