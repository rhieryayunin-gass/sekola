// Part 8 extension of the established disposable production verification.
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
export async function verifyPart8({browser,staffPage,owner,staff,parent,peer,ids,tenants,run,curriculumSave,rpc,denied,record,picture,open,applicationIds,admin}) {
 const publicContext=await browser.newContext({viewport:{width:1440,height:1000}});
 await publicContext.addCookies([{name:'osekola_locale',value:'en-US',domain:'osekola.com',path:'/'}]);
 const publicPage=await publicContext.newPage();
 for (const path of ['/','/login','/partners']) {
  await publicPage.goto('https://osekola.com'+path);
  assert.equal(await publicPage.locator('.ose-floating-connect').count(),0);
 }
 await publicPage.getByRole('link',{name:'Become a partner',exact:true}).click();
 await publicPage.getByRole('dialog',{name:'Become a partner'}).waitFor();
 await publicPage.getByLabel('Full name',{exact:true}).fill('Part8 synthetic applicant '+run);
 await picture(publicPage,'part8-partner-registration');await picture(publicPage,'part8-partner-registration-mobile',true);
 const pdf=await PDFDocument.create();pdf.addPage().drawText('OSEKOLA disposable verification CV. Synthetic applicant.');
 const receipt=await publicPage.request.post('https://osekola.com/api/partners/register',{headers:{origin:'https://osekola.com'},multipart:{name:'Part8 fixture '+run,nik:'0000'+String(Date.now()).slice(-12),phone:'628000000008',domicile:'Synthetic city',occupation:'Synthetic teacher',school_count:'2',contacts:'Synthetic contact / Synthetic school / Teacher',photo_confirmed:'on',consent:'on',cv:{name:'fixture.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())}}});
 assert.equal(receipt.status(),201,await receipt.text());const application=await receipt.json();applicationIds.push(application.id);
 const ownerApplications=await rpc(owner,'school_owner_list',{kind:'applications',filters:{query:'Part8 fixture '+run}});
 assert.equal(ownerApplications.items.length,1);assert.ok(!('nik' in ownerApplications.items[0])&&!('cv' in ownerApplications.items[0]));
 await denied(staff.client.rpc('school_partner_document',{application_id:application.id}));
 const ownerPage=await open(owner,'/dashboard/partners');await ownerPage.getByRole('heading',{name:'Partner applications',exact:true}).waitFor();
 const cv=await ownerPage.request.get('https://osekola.com/api/partners/cv?id='+application.id);assert.equal(cv.status(),200);assert.equal(cv.headers()['cache-control'],'private, no-store');
 await rpc(owner,'school_owner_save',{kind:'application',record_id:application.id,payload:{status:'INTERVIEW',referral_schools:'Fixture school',bank_name:'Fixture bank',bank_account_number:'000000008',bank_account_name:'Synthetic applicant'}});
 await picture(ownerPage,'part8-owner-partners');
 const accounts=[];
 for(const number of ['000000008','000000009'])accounts.push(await rpc(owner,'school_owner_save',{kind:'settlement_account',payload:{tenant_id:tenants[0],bank_name:'Fixture bank',account_name:'Fixture school',account_number:number,is_active:true}}));
 const banks=await rpc(owner,'school_owner_list',{kind:'settlement_accounts',filters:{tenant_id:tenants[0]}});assert.equal(banks.items.filter(a=>a.is_active).length,1);assert.equal(banks.items.find(a=>a.is_active).id,accounts[1].id);
 await denied(staff.client.rpc('school_owner_save',{kind:'settlement_account',record_id:accounts[0].id,payload:{is_active:true}}));
 record('Part 8 public registration, valid PDF, private Owner review and school settlement account isolation');
 for(const [name,selector] of [['Calendar','.school-calendar'],['Notifications','.school-notice-list'],['O-Connect','.oc-workspace']]) {
  await staffPage.getByRole('button',{name,exact:true}).click();
  const dialog=staffPage.locator('dialog.p8-dialog');await dialog.waitFor();
  if(name==='O-Connect'){await dialog.locator(selector).waitFor();await dialog.locator('.oc-welcome').getByRole('button',{name:'Start a conversation',exact:true}).click();await staffPage.getByRole('dialog',{name:'Start a conversation',exact:true}).waitFor();await staffPage.keyboard.press('Escape');assert.equal(await dialog.isVisible(),true,'Closing a nested conversation dialog must preserve the workspace');}
  if(name==='Calendar')await dialog.getByLabel(/Search events/).waitFor();
  if(name==='Notifications')await dialog.locator('input').first().waitFor();
  assert.equal(await staffPage.locator('nav a[href="/dashboard/connect"]').count(),0);
  await picture(staffPage,'part8-'+name.toLowerCase());await picture(staffPage,'part8-'+name.toLowerCase()+'-mobile',true);
  await dialog.getByRole('button',{name:'Close',exact:true}).click();
 }
 record('Part 8 centered Calendar/Notifications and floating O-Connect, desktop/mobile, without duplicated Chat navigation');
 const qualification=await rpc(staff,'school_curriculum_create_program',{payload:{academic_year_id:ids.year,name:'Fixture Pearson',framework:'EDEXCEL',program_type:'QUALIFICATION',version:'2026',language:'en'},stages:[{code:'IAL',name:'International Advanced Level'}]});
 const qstage=(await rpc(staff,'school_curriculum_list',{resource:'stages',page_offset:0,program_uuid:qualification.id}))[0];
 await curriculumSave('enrollments',{program_id:qualification.id,stage_id:qstage.id,classroom_id:ids.classroom,student_id:ids.student,valid_from:'2026-07-01'});
 const official={program_id:qualification.id,student_id:ids.student,specification:'Synthetic qualification',pathway:'MODULAR',unit_code:'Fixture unit',session_name:'June 2026',raw_score:63,ums:80,qualification_grade:'A',official_reference:'Synthetic source, not an awarded qualification'};
 const draft=await rpc(staff,'school_qualifications',{action:'save',payload:official});
 assert.equal((await rpc(parent,'school_qualifications',{action:'list',payload:{student_id:ids.student}})).length,0);
 await rpc(staff,'school_qualifications',{action:'save',payload:{...official,status:'PUBLISHED',supersedes_id:draft.id}});
 const results=await rpc(parent,'school_qualifications',{action:'list',payload:{student_id:ids.student}});assert.equal(results.length,1);assert.equal(results[0].ums,80);assert.equal(results[0].raw_score,63);
 await denied(peer.client.rpc('school_qualifications',{action:'list',payload:{student_id:ids.student}}));
 const leadId=crypto.randomUUID();const inserted=await admin.from('school_leads').insert({id:leadId,contact_name:'Part8 lead '+run,answers:[],assessment_version:1,score:0,recommended_plan:'ESSENTIAL',email:'fixture@demo.osekola.test',phone:'628000000008',school_name:'Synthetic fixture school',student_count:25});assert.equal(inserted.error,null,inserted.error?.message);
 try{await rpc(owner,'school_owner_save',{kind:'lead_follow_up',record_id:leadId,payload:{follow_up:'IN_PROGRESS'}});const row=await admin.from('school_leads').select('follow_up').eq('id',leadId).single();assert.equal(row.data?.follow_up,'IN_PROGRESS');}finally{const deleted=await admin.from('school_leads').delete().eq('id',leadId);assert.equal(deleted.error,null);}
 record('Part 8 Pearson parallel programme, separate official results, source scores, draft/own-child privacy and lead follow-up');
 await publicContext.close();
}
