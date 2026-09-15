// Authenticated production verification uses only disposable, explicitly owned schools.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
const config = JSON.parse(await readFile(new URL('../../../deploy/osekola/public-web-config.json', import.meta.url)));
const url = config.NEXT_PUBLIC_SUPABASE_URL, key = config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.equal(process.env.SUPABASE_URL?.replace(/\/$/, ''), url);
assert.equal(new URL(url).hostname, 'xrqjutbwnlkogpfhtuwr.supabase.co');
for (const name of ['SUPABASE_SERVICE_ROLE_KEY', 'EXPECTED_WEB_RELEASE', 'BROWSER_MODULE', 'VERIFY_OUTPUT_DIR']) assert.ok(process.env[name], name);
const output = process.env.VERIFY_OUTPUT_DIR; await mkdir(output, { recursive: true });
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const ok = (r, label = 'Request') => { if (r.error) throw new Error(`${label}: ${r.error.code ?? r.error.status ?? ''} ${r.error.message ?? ''}`); return r.data; };
const run = randomUUID(), tenants = [randomUUID(), randomUUID()], users = [], checks = [], pages = [], failedChecks = [];
const ids = Object.fromEntries(['year', 'semester', 'classroom', 'subject', 'teacher', 'student', 'peer', 'course'].map(k => [k, randomUUID()]));
let browser, success = false;
const record = label => { checks.push(label); console.log('PASS: ' + label); };
const insert = async (table, data) => ok(await admin.from(table).insert(data), 'Insert ' + table);
const rpc = async (actor, name, args = {}) => ok(await actor.client.rpc(name, args), name);
const studio = (actor, action, payload = {}) => rpc(actor, 'school_studio', { action, payload: { course_id: ids.course, ...payload } });
const assessment = (actor, action, payload = {}) => rpc(actor, 'school_assessment', { action, payload });
const denied = async promise => assert.equal((await promise).error?.code, '42501');
async function until(check, label) {
  for (let i = 0; i < 40; i++) { if (await check()) return; await new Promise(r => setTimeout(r, 500)); }
  throw new Error(label);
}
async function open(actor, path) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([...actor.jar.values()].map(c => ({ name: c.name, value: c.value, domain: 'osekola.com', path: '/', secure: true, sameSite: 'Lax' })).concat([{ name: 'osekola_locale', value: 'en-US', domain: 'osekola.com', path: '/', secure: true, sameSite: 'Lax' }]));
  const page = await context.newPage(); page.setDefaultTimeout(30000); pages.push(page);
  await page.goto('https://osekola.com' + path); return page;
}
async function picture(page, name, mobile = false) {
  if (mobile) await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name + ' horizontal overflow');
  if (mobile) await page.setViewportSize({ width: 1440, height: 1000 });
}
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try { const res = await fetch('https://osekola.com/healthz', { signal: AbortSignal.timeout(10000) }); ready = res.ok && (await res.json()).release === process.env.EXPECTED_WEB_RELEASE; } catch {}
    if (ready) break; await new Promise(r => setTimeout(r, 5000));
  }
  assert.ok(ready, 'Expected deployed release unavailable');
  for (const path of ['health', 'ready']) assert.equal((await fetch('https://api.osekola.com/api/v1/' + path)).status, 200);
  record('Exact frontend release and existing API health/readiness');
  await insert('tenants', tenants.map((id, i) => ({ id, name: `Part 7 verification ${run} ${i}`, code: `P7-VERIFY-${run}-${i}` })));
  const roles = ['OWNER', 'STAFF', 'TEACHER', 'STUDENT', 'PARENT', 'STUDENT', 'PARENT', 'OWNER', 'PRINCIPAL'];
  const roleIds = new Map(ok(await admin.from('roles').select('id,code').in('code', [...new Set(roles)])).map(r => [r.code, r.id]));
  for (const [i, role] of roles.entries()) {
    const tenant = tenants[i === 7 ? 1 : 0], email = `part7-${run}-${i}@demo.osekola.test`, password = randomBytes(24).toString('base64url');
    const auth = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { tenant_id: tenant }, user_metadata: { full_name: `Part7 fixture ${role} ${i}` } }));
    const actor = { id: auth.user.id, email, tenant, role, jar: new Map() }; users.push(actor);
    await writeFile(output + '/fixtures.json', JSON.stringify({ run, tenants, users: users.map(u => u.id) }, null, 2));
    await insert('user_roles', { user_id: actor.id, role_id: roleIds.get(role) });
    actor.client = createServerClient(url, key, { cookies: { getAll: () => [...actor.jar.values()], setAll: values => values.forEach(c => actor.jar.set(c.name, c)) } });
    ok(await actor.client.auth.signInWithPassword({ email, password }));
  }
  const [owner, staff, teacher, student, parent, peer, peerParent, foreign] = users;
  const tenant_id = tenants[0];
  await insert('academic_years', { id: ids.year, tenant_id, name: 'Part7 verification year', starts_on: '2026-07-01', ends_on: '2027-06-30', is_active: true });
  await insert('semesters', { id: ids.semester, tenant_id, academic_year_id: ids.year, name: 'Part7 verification term', starts_on: '2026-07-01', ends_on: '2026-12-31', is_active: true });
  await insert('classrooms', { id: ids.classroom, tenant_id, academic_year_id: ids.year, name: 'Part7 class', capacity: 30, homeroom_teacher_user_id: teacher.id });
  await insert('subjects', { id: ids.subject, tenant_id, code: 'P7-MATH', name: 'Mathematics' });
  await insert('teachers', { id: ids.teacher, tenant_id, user_id: teacher.id });
  await insert('students', [{ id: ids.student, tenant_id, user_id: student.id, student_number: 'P7-S1' }, { id: ids.peer, tenant_id, user_id: peer.id, student_number: 'P7-S2' }]);
  await insert('student_assignments', [ids.student, ids.peer].map(student_id => ({ tenant_id, student_id, academic_year_id: ids.year, semester_id: ids.semester, classroom_id: ids.classroom })));
  await insert('school_guardians', [{ tenant_id, student_id: ids.student, parent_user_id: parent.id }, { tenant_id, student_id: ids.peer, parent_user_id: peerParent.id }]);
  await insert('teacher_assignments', { tenant_id, teacher_id: ids.teacher, subject_id: ids.subject, academic_year_id: ids.year, semester_id: ids.semester, classroom_id: ids.classroom });
  const home = await studio(teacher, 'home'); assert.equal(home.courses.length, 1); assert.equal(home.courses[0].studio_status, 'DRAFT'); ids.course = home.courses[0].id;
  assert.equal((await studio(student, 'home')).courses.length, 0);
  const preview = await rpc(staff, 'school_setup_records', { resource: 'subjects', rows: [{ code: 'P7-PREVIEW', name: 'Preview only' }], dry_run: true });
  assert.equal(preview.valid, true); assert.equal(preview.committed, false);
  assert.equal(ok(await admin.from('subjects').select('id').eq('tenant_id', tenant_id).eq('code', 'P7-PREVIEW')).length, 0);
  await denied(staff.client.rpc('school_setup_action', { action: 'identity', payload: { name: 'Forbidden staff identity' } }));
  await rpc(owner, 'school_setup_action', { action: 'identity', payload: { name: `Part 7 verification ${run} 0`, address: 'Synthetic school address', contact_email: 'office@demo.osekola.test', timezone: 'Asia/Jakarta', locale: 'en-US' } });
  const setup = await rpc(staff, 'school_setup_state');
  await rpc(staff, 'school_setup_action', { action: 'preferences', payload: { revision: setup.setup.revision, mode: 'ASSISTED', operations: { hours: '07:00–15:00', units: ['Academic office'] } } });
  assert.equal((await rpc(staff, 'school_setup_records', { resource: 'school_assets', rows: [{ name: 'Verification learning room', category: 'CLASSROOM', capacity: 30 }], dry_run: false })).committed, true);
  const program = await rpc(staff, 'school_curriculum_create_program', { payload: { academic_year_id: ids.year, name: 'Verification Merdeka', framework: 'MERDEKA', version: '2026', language: 'id' }, stages: [{ code: 'C', name: 'Fase C', grade_from: 5, grade_to: 6 }] });
  const stages = await rpc(staff, 'school_curriculum_list', { resource: 'stages', page_offset: 0, program_uuid: program.id });
  const curriculumSave = (kind, payload) => rpc(staff, 'school_curriculum_save', { resource: kind, payload });
  const subject = await curriculumSave('subjects', { program_id: program.id, stage_id: stages[0].id, subject_id: ids.subject, name: 'Number reasoning' });
  await curriculumSave('enrollments', { program_id: program.id, stage_id: stages[0].id, classroom_id: ids.classroom });
  await curriculumSave('course_links', { program_id: program.id, course_id: ids.course, curriculum_subject_id: subject.id });
  const goal = await curriculumSave('outcomes', { program_id: program.id, curriculum_subject_id: subject.id, code: 'TP-1', name: 'Explain addition', kind: 'TP', description: 'School-approved learning goal', sequence: 1 });
  await curriculumSave('scales', { program_id: program.id, name: 'Verification descriptors', kind: 'DESCRIPTOR', labels: ['Developing', 'Secure'], criteria: 'Explain with evidence' });
  const launched = await rpc(staff, 'school_setup_action', { action: 'launch' }); assert.equal(launched.score, 100); assert.ok(launched.setup.launched_at);
  record('Academic allocation provisions a private draft class; import preview, canonical role gates, curriculum setup and real readiness launch');

  const { chromium } = await import(process.env.BROWSER_MODULE); browser = await chromium.launch({ headless: true });
  const staffPage = await open(staff, '/dashboard'); await staffPage.getByRole('link', { name: 'Build your digital school', exact: true }).click(); await staffPage.locator('[data-testid="school-setup"]').waitFor();
  await picture(staffPage, 'setup-desktop'); await picture(staffPage, 'setup-mobile', true);
  const suggestionId = randomUUID();
  const ai = await staffPage.request.post('https://osekola.com/api/school/setup/suggest', { headers: { Origin: 'https://osekola.com' }, data: { request_id: suggestionId, locale: 'en-US' }, timeout: 70000 });
  const suggestion = await ai.json();
  if (ai.ok()) {
    assert.equal(suggestion.id, suggestionId); assert.ok(suggestion.result.summary);
    const savedSuggestion = await rpc(staff, 'school_setup_suggestion', { action: 'read', request_id: suggestionId }); assert.equal(savedSuggestion.result.summary, suggestion.result.summary);
    await staffPage.goto('https://osekola.com' + suggestion.url); await staffPage.getByText(suggestion.result.summary, { exact: true }).waitFor();
    record('Core responsive page and one real Olla suggestion persisted at its addressable URL');
  } else {
    const failure = { status: ai.status(), code: suggestion.code, generation_id: suggestion.generation_id, message: suggestion.error };
    await writeFile(output + '/olla-failure.json', JSON.stringify(failure, null, 2));
    failedChecks.push('Olla suggestion: ' + JSON.stringify(failure)); console.error(failedChecks.at(-1));
  }

  const unit = await studio(teacher, 'unit', { title: 'Reasoning with numbers', description: 'A focused learning journey', published: true, outcome_ids: [goal.id], student_ids: [ids.student] });
  const lesson = await studio(teacher, 'lesson', { unit_id: unit.id, title: 'Read, reason and reflect', material: 'Explain why two pairs make four.', blocks: [{ type: 'REFLECTION', text: 'How can you show your thinking?' }], scheduled_at: new Date(Date.now() + 86400000).toISOString(), is_published: true });
  const assignment = await studio(teacher, 'assignment', { unit_id: unit.id, title: 'Part7 reasoning task', instructions: 'Explain your answer', rubric: 'A clear mathematical explanation', max_score: 100, is_published: true });
  await studio(teacher, 'space', { status: 'LIVE', is_template: true });
  assert.equal((await studio(peer, 'state')).assignments.length, 0);
  assert.equal((await rpc(peer, 'school_catalog', { resource: 'lessons' })).length, 0);
  const peerCalendar = await rpc(peer, 'school_calendar_context', { starts: new Date().toISOString(), ends: new Date(Date.now() + 172800000).toISOString() });
  assert.ok(!peerCalendar.events.some(e => e.source_id === lesson.id));
  const studentPage = await open(student, `/dashboard/learning?course=${ids.course}&activity=${assignment.id}`);
  await studentPage.getByLabel('Your work', { exact: true }).fill('Two pairs make four. I grouped two counters twice.');
  await studentPage.getByRole('button', { name: 'Save draft', exact: true }).click();
  await until(async () => (await studio(student, 'state')).submissions[0]?.workflow_status === 'DRAFT', 'Draft was not saved');
  await studentPage.getByRole('button', { name: 'Submit work', exact: true }).click();
  await until(async () => (await studio(student, 'state')).submissions[0]?.workflow_status === 'SUBMITTED', 'Work was not submitted');
  const submission = (await studio(teacher, 'state')).submissions[0];
  await picture(studentPage, 'student-task-mobile', true);
  const teacherPage = await open(teacher, `/dashboard/learning?course=${ids.course}&review=${submission.id}`);
  await teacherPage.getByLabel('Score / 100', { exact: true }).fill('88');
  await teacherPage.getByLabel('Feedback draft', { exact: true }).fill('Clear explanation; connect it to repeated addition.');
  await teacherPage.getByRole('button', { name: 'Save review draft', exact: true }).click();
  await until(async () => (await studio(teacher, 'state')).submissions[0]?.draft_score === 88, 'Review draft not saved');
  assert.equal((await studio(student, 'state')).submissions[0].score, null);
  assert.equal((await rpc(parent, 'school_family_report', { kind: 'learning', student: ids.student })).rows[0].score, null);
  await picture(teacherPage, 'teacher-review');
  await teacherPage.getByRole('button', { name: 'Release feedback to learner', exact: true }).click();
  await until(async () => (await studio(student, 'state')).submissions[0]?.score === 88, 'Feedback not released');
  await teacherPage.getByRole('button', { name: 'Close review', exact: true }).click();
  await picture(teacherPage, 'class-studio-desktop'); await picture(teacherPage, 'class-studio-mobile', true);
  assert.equal((await rpc(parent, 'school_family_report', { kind: 'learning', student: ids.student })).rows[0].score, 88);
  await denied(parent.client.rpc('school_family_report', { kind: 'learning', student: ids.peer }));
  assert.equal((await rpc(peerParent, 'school_family_report', { kind: 'learning', student: ids.peer })).rows.length, 0);
  record('Student browser draft/submission, teacher browser review/release, private draft scores and targeted learner/parent/calendar isolation');

  const exam = await assessment(teacher, 'save', { course_id: ids.course, unit_id: unit.id, title: 'Part7 focused assessment', kind: 'QUIZ', duration_minutes: 20, starts_at: new Date(Date.now() - 60000).toISOString(), ends_at: new Date(Date.now() + 3600000).toISOString(), instructions: 'Read carefully and explain your thinking.', result_mode: 'DISCUSSION', blueprint: [{ outcome_id: goal.id, count: 1, weight: 100 }] });
  const bank = await rpc(teacher, 'school_question_save', { kind: 'set', payload: { course_id: ids.course, title: 'Part7 practice bank', grade_level: 5, usage_scope: 'PRACTICE' } });
  const question = await rpc(teacher, 'school_question_save', { kind: 'item', payload: { set_id: bank.id, question_type: 'MULTIPLE_CHOICE', prompt: 'What is 2 + 2?', options: ['3', '4', '5', '6'], answer: '4', explanation: 'Two pairs make four.', difficulty: 'EASY', review_status: 'APPROVED' } });
  await rpc(teacher, 'school_exam_manage', { action: 'questions', exam_uuid: exam.id, payload: [question.id] });
  let check = await assessment(teacher, 'check', { exam_id: exam.id }); assert.ok(check.issues.length);
  await assessment(teacher, 'map_question', { exam_id: exam.id, item_id: check.items[0].id, outcome_id: goal.id });
  check = await assessment(teacher, 'check', { exam_id: exam.id }); assert.deepEqual(check.issues, []);
  await rpc(teacher, 'school_exam_manage', { action: 'publish', exam_uuid: exam.id });
  await assessment(teacher, 'accommodation', { exam_id: exam.id, student_id: ids.student, extra_minutes: 10, reason: 'Private individual support' });
  assert.equal((await assessment(teacher, 'live', { exam_id: exam.id })).length, 1);
  await denied(peer.client.rpc('school_exam_start', { exam_uuid: exam.id }));
  await teacherPage.goto(`https://osekola.com/dashboard/exams?exam=${exam.id}&course=${ids.course}`);
  await teacherPage.locator('[data-testid="assessment-builder"]').waitFor();
  await picture(teacherPage, 'assessment-studio-desktop'); await picture(teacherPage, 'assessment-studio-mobile', true);
  await studentPage.goto('https://osekola.com/dashboard/exams');
  await studentPage.getByRole('button', { name: 'Check readiness', exact: true }).click();
  await studentPage.getByText('Account and assigned access verified', { exact: true }).waitFor();
  assert.equal((await assessment(student, 'ready', { exam_id: exam.id })).attempt, null);
  assert.equal(await studentPage.getByRole('button', { name: 'Start exam now', exact: true }).isDisabled(), true);
  await picture(studentPage, 'exam-ready-mobile', true);
  await studentPage.getByLabel('I have read the instructions and am ready.', { exact: true }).check();
  await studentPage.getByRole('button', { name: 'Start exam now', exact: true }).click();
  await studentPage.locator('.school-answer-list input').nth(1).check();
  await studentPage.getByRole('status').filter({ hasText: 'Saved on server' }).waitFor();
  let attempt = (await assessment(student, 'ready', { exam_id: exam.id })).attempt;
  let state = await rpc(student, 'school_exam_state', { attempt_uuid: attempt.id });
  assert.equal(state.attempt.answers[state.questions[0].id], '4'); assert.ok(!('answer' in state.questions[0].content));
  const minutes = (Date.parse(state.ends_at) - Date.parse(state.server_time)) / 60000; assert.ok(minutes > 28 && minutes <= 30);
  assert.equal((await rpc(student, 'school_exam_start', { exam_uuid: exam.id })).attempt.id, attempt.id);
  assert.equal(await studentPage.locator('.ose-floating-connect').isVisible(), false);
  await picture(studentPage, 'exam-focus-mobile', true);
  await studentPage.reload(); await studentPage.getByRole('button', { name: 'Open attempt / result', exact: true }).click();
  await studentPage.getByLabel('I have read the instructions and am ready.', { exact: true }).check();
  await studentPage.getByRole('button', { name: 'Resume / view result', exact: true }).click();
  assert.equal(await studentPage.locator('.school-answer-list input').nth(1).isChecked(), true);
  studentPage.once('dialog', dialog => dialog.accept());
  await studentPage.getByRole('button', { name: 'Submit answers', exact: true }).click();
  await studentPage.getByText('Awaiting teacher review and release', { exact: true }).waitFor();
  state = await rpc(student, 'school_exam_state', { attempt_uuid: attempt.id }); assert.equal(state.attempt.score, null); assert.ok(state.attempt.submitted_at);
  await picture(studentPage, 'submission-receipt');
  assert.equal((await rpc(teacher, 'school_exam_state', { attempt_uuid: attempt.id })).attempt.score, 100);
  await rpc(teacher, 'school_exam_grade', { attempt_uuid: attempt.id, final_score: 95, note: 'Reviewed: well reasoned.' });
  assert.equal((await rpc(student, 'school_exam_state', { attempt_uuid: attempt.id })).attempt.score, null);
  await assert.rejects(assessment(teacher, 'release', { exam_id: exam.id, attempt_id: attempt.id }), /exam window/);
  state = await rpc(student, 'school_exam_state', { attempt_uuid: attempt.id }); assert.ok(!('answer' in state.questions[0].content), 'Discussion leaked before window closed');
  await rpc(teacher, 'school_exam_manage', { action: 'close', exam_uuid: exam.id });
  // Advance only this owned fixture's window so delayed discussion can be checked without waiting an hour.
  ok(await admin.from('exams').update({ ends_at: new Date(Date.now() - 1000).toISOString() }).eq('id', exam.id).eq('tenant_id', tenant_id));
  await assessment(teacher, 'release', { exam_id: exam.id, attempt_id: attempt.id });
  state = await rpc(student, 'school_exam_state', { attempt_uuid: attempt.id }); assert.equal(state.questions[0].content.answer, '4');
  assert.equal((await rpc(parent, 'school_family_report', { kind: 'exams', student: ids.student })).rows[0].score, 95);
  assert.equal((await rpc(peerParent, 'school_family_report', { kind: 'exams', student: ids.peer })).rows.length, 0);
  await denied(foreign.client.rpc('school_exam_state', { attempt_uuid: attempt.id }));
  const remedial = await assessment(teacher, 'remedial', { exam_id: exam.id, student_ids: [ids.student], title: 'Targeted follow-up', description: 'Review the learning gap.' }); assert.ok(remedial.id);
  const retake = await assessment(teacher, 'retake', { exam_id: exam.id }); assert.notEqual(retake.id, exam.id);
  const parentPage = await open(parent, '/dashboard/exams'); await parentPage.getByText('Part7 focused assessment', { exact: true }).waitFor(); await picture(parentPage, 'parent-released-report', true);
  record('Blueprint and bank gates, private accommodation, browser ready/start/autosave/resume/receipt, review then release, delayed discussion, remedial/retake and own-child report');
  assert.deepEqual(failedChecks, [], "All production checks must pass");
  success = true;
} catch (error) {
  for (const [i, page] of pages.entries()) { try { await page.screenshot({ path: `${output}/failure-${i}.png`, fullPage: true }); } catch {} }
  throw error;
} finally {
  await browser?.close(); const failures = [];
  // Every delete is scoped to UUIDs generated by this run; cleanup cannot target an existing school.
  const tables = ['school_setup_suggestions', 'school_setup', 'school_submission_versions', 'school_submission_workflow', 'school_learning_progress', 'school_lesson_versions', 'school_curriculum_evidence', 'school_curriculum_alignments', 'school_assessment_participants', 'school_assessment_designs', 'school_exam_attempts', 'exam_results', 'exam_sessions', 'school_exam_items', 'submissions', 'assignments', 'lessons', 'school_learning_units', 'school_learning_spaces', 'school_curriculum_course_links', 'school_curriculum_enrollments', 'school_curriculum_outcomes', 'school_curriculum_scales', 'school_curriculum_subjects', 'school_curriculum_stages', 'school_curriculum_programs', 'school_ai_generations', 'school_question_items', 'school_question_sets', 'exams', 'courses', 'school_guardians', 'student_assignments', 'teacher_assignments', 'teachers', 'students', 'classrooms', 'subjects', 'semesters', 'academic_years', 'school_assets', 'notifications', 'audit_logs', 'calendars', 'school_settings'];
  for (const table of tables) { try { ok(await admin.from(table).delete().in('tenant_id', tenants), 'Cleanup ' + table); } catch (e) { failures.push(e.message); } }
  const profiles = ok(await admin.from('users').select('id,email,tenant_id').in('tenant_id', tenants));
  for (const u of profiles) { try { assert.ok(u.email.startsWith('part7-' + run + '-')); assert.equal(ok(await admin.auth.admin.getUserById(u.id)).user.app_metadata.tenant_id, u.tenant_id); ok(await admin.auth.admin.deleteUser(u.id)); } catch (e) { failures.push(e.message); } }
  for (const [i, tenant] of tenants.entries()) { try { ok(await admin.from('tenants').delete().eq('id', tenant).eq('code', `P7-VERIFY-${run}-${i}`)); } catch (e) { failures.push(e.message); } }
  const remainingUsers = ok(await admin.from('users').select('id').in('tenant_id', tenants)).length;
  const remainingTenants = ok(await admin.from('tenants').select('id').in('id', tenants)).length;
  await writeFile(output + '/verification.json', JSON.stringify({ release: process.env.EXPECTED_WEB_RELEASE, success, checks, failedChecks, cleanup: { remainingUsers, remainingTenants, failures } }, null, 2));
  assert.deepEqual(failures, []); assert.equal(remainingUsers, 0); assert.equal(remainingTenants, 0);
  record('Disposable fixture users, schools and associated records removed');
}
