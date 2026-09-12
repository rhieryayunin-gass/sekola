// Live integration verification uses only newly-created, isolated test tenants.
// Secrets and session cookies remain in memory; fixtures are removed in finally.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

const config = JSON.parse(await readFile(new URL('../../../deploy/osekola/public-web-config.json', import.meta.url)));
const url = config.NEXT_PUBLIC_SUPABASE_URL;
assert.equal(process.env.SUPABASE_URL?.replace(/\/$/, ''), url, 'Unexpected Supabase project');
assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY, 'Service credential required');
const key = config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const tag = `connect-e2e-${randomBytes(6).toString('hex')}`;
const tenants = [], users = [], clients = [], files = [];
let channel;
function ok(result, action = 'Supabase request') { if (result.error) throw new Error(`${action}: ${result.error.message}`); return result.data; }
async function rpc(client, name, args) {
  const operation = () => client.rpc(`oconnect_${name}`, args);
  const repeatable = ['context', 'thread', 'send', 'preferences', 'mark_read'].includes(name) || (name === 'create' && args.kind === 'DIRECT');
  return ok(await (repeatable ? retry(operation) : operation()), `RPC ${name}`);
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
// Only use for reads or writes identified by fixture IDs / idempotency keys.
async function retry(operation) {
  let result;
  for (let attempt = 0; attempt < 3; attempt++) {
    result = await operation();
    if (!result.error || !/timeout|fetch failed|temporar|gateway/i.test(result.error.message)) return result;
    if (attempt < 2) await pause(1000 * (attempt + 1));
  }
  return result;
}
async function waitForWeb() {
  for (let attempt = 0; attempt < 72; attempt++) {
    try {
      const response = await fetch('https://osekola.com/healthz', { signal: AbortSignal.timeout(10000), cache: 'no-store' });
      const health = await response.json();
      if (response.ok && health.service === 'sekola-web' && (!process.env.EXPECTED_WEB_RELEASE || health.release === process.env.EXPECTED_WEB_RELEASE)) return health.release;
    } catch { /* deployment may still be being promoted */ }
    await pause(5000);
  }
  throw new Error('Production web release did not become ready in time');
}
async function identity(tenant, role, suffix) {
  console.log(`Preparing isolated identity: ${suffix}`);
  const password = `Oc!${randomBytes(30).toString('base64url')}`;
  const email = `${tag}-${suffix}@osekola.test`;
  const id = randomUUID();
  users.push(id);
  const user = ok(await retry(async () => {
    const created = await admin.auth.admin.createUser({ id, email, password, email_confirm: true,
      app_metadata: { tenant_id: tenant }, user_metadata: { full_name: `O-Connect verification ${suffix}` } });
    // A timed-out response may follow a committed creation. Recover only the
    // exact preallocated identity, never search/list existing school accounts.
    if (created.error) {
      const existing = await admin.auth.admin.getUserById(id);
      if (!existing.error) return existing;
    }
    return created;
  }), `Create ${suffix}`).user;
  assert.equal(user.id, id);
  assert.equal(user.email, email);
  assert.equal(user.app_metadata.tenant_id, tenant);
  const assignedRole = ok(await retry(() => admin.from('roles').select('id').eq('code', role).single()), `Read ${role} role`);
  ok(await retry(() => admin.from('user_roles').upsert({ user_id: user.id, role_id: assignedRole.id }, { onConflict: 'user_id,role_id', ignoreDuplicates: true })), `Assign ${role} role`);
  const cookies = new Map();
  const client = createServerClient(url, key, { cookies: {
    getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
    setAll: values => { for (const cookie of values) cookies.set(cookie.name, cookie.value); },
  } });
  clients.push(client);
  const signedIn = ok(await retry(() => client.auth.signInWithPassword({ email, password })), `Sign in ${suffix}`);
  assert.equal(signedIn.user.id, user.id);
  console.log(`Ready isolated identity: ${suffix}`);
  return { client, id: user.id, cookie: () => [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') };
}
try {
  const release = await waitForWeb();
  console.log(`Production web release verified: ${release}`);
  for (const suffix of ['A', 'B']) {
    const id = randomUUID();
    tenants.push(id); // Track before the request in case its response is lost.
    ok(await retry(() => admin.from('tenants').upsert({ id, name: `${tag}-${suffix}`, code: `${tag}-${suffix}` }, { onConflict: 'id', ignoreDuplicates: true })), `Create isolated tenant ${suffix}`);
  }
  const a = await identity(tenants[0], 'TEACHER', 'teacher');
  const b = await identity(tenants[0], 'PARENT', 'parent');
  const outside = await identity(tenants[1], 'TEACHER', 'other-school');
  assert.equal((await rpc(a.client, 'context')).can_manage, true);
  assert.equal((await rpc(b.client, 'context')).can_manage, false);
  const conversation = await rpc(a.client, 'create', { kind: 'DIRECT', members: [b.id] });
  assert.equal(await rpc(a.client, 'create', { kind: 'DIRECT', members: [b.id] }), conversation);
  const messageId = randomUUID();
  let received;
  const realtimeMessage = new Promise(resolve => { received = resolve; });
  await b.client.realtime.setAuth();
  channel = b.client.channel(`${tag}:messages`)
    .on('system', {}, event => console.log(`Realtime system: ${event.status} ${event.message}`))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'oconnect_messages', filter: `conversation_id=eq.${conversation}` }, payload => {
      if (payload.errors?.length) received({ error: payload.errors.join('; ') });
      if (payload.new.id === messageId) received(payload.new);
    });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Realtime subscription timed out')), 15000);
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); }
      if (status === 'CHANNEL_ERROR') { clearTimeout(timer); reject(new Error('Realtime channel failed')); }
    });
  });
  const first = await rpc(a.client, 'send', { conversation, message_id: messageId, body: 'O-Connect isolated live verification' });
  assert.equal(ok(await retry(() => b.client.from('oconnect_messages').select('id').eq('id', messageId).single())).id, messageId, 'Recipient can read the actual message through table RLS');
  assert.equal((await rpc(a.client, 'send', { conversation, message_id: messageId, body: first.body })).seq, first.seq);
  await rpc(b.client, 'send', { conversation, message_id: randomUUID(), body: 'Verified reply', reply_to: messageId });
  assert.equal((await rpc(a.client, 'thread', { conversation })).messages.length, 2);
  assert.equal((await rpc(b.client, 'thread', { conversation, search: 'isolated' })).messages.length, 1);
  assert.equal((await retry(() => outside.client.rpc('oconnect_thread', { conversation }))).error?.code, '42501', 'Explicit cross-tenant authorization denial');
  assert.equal((await b.client.rpc('oconnect_create', { kind: 'GROUP', title: 'Forbidden', members: [a.id] })).error?.code, '42501', 'Explicit parent group-creation denial');
  console.log('PASS: two-user send/reply, table RLS, idempotency, search and cross-tenant denial');
  await rpc(b.client, 'preferences', { font_size: 20 });
  assert.equal((await rpc(b.client, 'context')).font_size, 20);
  assert.equal((await rpc(a.client, 'context')).font_size, 16);
  const path = `${tenants[0]}/${conversation}/${a.id}/${randomUUID()}-verification.txt`;
  const contents = 'O-Connect test attachment. No personal data.';
  files.push(path);
  ok(await a.client.storage.from('oconnect-attachments').upload(path, Buffer.from(contents), { contentType: 'text/plain' }), 'Upload isolated attachment');
  const attachment = await rpc(a.client, 'send', { conversation, message_id: randomUUID(), attachment: { path, name: 'verification.txt' } });
  const fileUrl = `https://osekola.com/api/connect/attachment?message=${attachment.id}`;
  const read = await fetch(fileUrl, { headers: { Cookie: b.cookie() }, signal: AbortSignal.timeout(15000), redirect: 'manual' });
  assert.equal(read.status, 200, 'Authenticated web attachment route');
  assert.equal(await read.text(), contents);
  assert.equal(read.headers.get('cache-control'), 'private, no-store');
  const denied = await fetch(fileUrl, { headers: { Cookie: outside.cookie() }, signal: AbortSignal.timeout(15000), redirect: 'manual' });
  assert.equal(denied.status, 404, 'Cross-tenant web attachment route');
  const anonymous = await fetch(fileUrl, { signal: AbortSignal.timeout(15000), redirect: 'manual' });
  assert.equal(anonymous.status, 401, 'Anonymous attachment route');
  await rpc(b.client, 'mark_read', { conversation, through_seq: attachment.seq });
  const thread = await rpc(a.client, 'thread', { conversation });
  assert.equal(thread.members.find(m => m.id === b.id).last_read_seq, attachment.seq);
  console.log('PASS: account font persistence, authenticated frontend download, receipts and private attachment isolation');
  const group = await rpc(a.client, 'create', { kind: 'GROUP', title: 'Isolated live verification', members: [b.id] });
  await rpc(a.client, 'send', { conversation: group, message_id: randomUUID(), body: 'Notification integration' });
  const notifications = ok(await b.client.from('notifications').select('resource_id').eq('resource_type', 'oconnect').eq('resource_id', group));
  assert.equal(notifications.length, 1);
  await rpc(a.client, 'manage_member', { conversation: group, member: b.id, remove: true });
  assert.equal((await retry(() => b.client.rpc('oconnect_thread', { conversation: group }))).error?.code, '42501', 'Explicit removed-member authorization denial');
  await rpc(a.client, 'delete_message', { message: messageId });
  assert.ok((await rpc(a.client, 'thread', { conversation })).messages.find(m => m.id === messageId).deleted_at);
  console.log('PASS: group management, notification integration, removal revocation and message deletion');
  let realtimeTimer;
  const delivered = await Promise.race([realtimeMessage, new Promise(resolve => { realtimeTimer = setTimeout(() => resolve({ error: 'Realtime delivery timed out' }), 30000); })]);
  clearTimeout(realtimeTimer);
  assert.ok(!delivered.error, delivered.error);
  assert.equal(delivered.sender_id, a.id);
  console.log('PASS: authenticated Realtime message delivery');
  console.log('OCONNECT_LIVE_E2E_PASSED');
} catch (error) {
  console.error(`OCONNECT_LIVE_E2E_FAILED: ${error.message}`);
  process.exitCode = 1;
} finally {
  const cleanupErrors = [];
  if (channel) await clients[1]?.removeChannel(channel);
  let ownedFixtures = true;
  if (tenants.length) {
    const inspection = await retry(() => admin.from('tenants').select('id,code').in('id', tenants));
    ownedFixtures = !inspection.error && inspection.data.every(t => [tag + '-A', tag + '-B'].includes(t.code));
    if (!ownedFixtures) cleanupErrors.push('Fixture ownership guard failed; no records will be deleted');
  }
  // Remove child messages first (reply FKs are contained in the deleted set).
  if (tenants.length && ownedFixtures) {
    for (const table of ['oconnect_messages', 'oconnect_conversations', 'notifications']) {
      const result = await retry(() => admin.from(table).delete().in('tenant_id', tenants));
      if (result.error) cleanupErrors.push(`${table}: ${result.error.message}`);
    }
  }
  if (files.length && ownedFixtures) { const result = await retry(() => admin.storage.from('oconnect-attachments').remove(files)); if (result.error) cleanupErrors.push('Attachment cleanup failed'); }
  for (const client of clients) { await client.removeAllChannels(); await client.auth.signOut(); }
  if (ownedFixtures) for (const user of users) { const result = await retry(() => admin.auth.admin.deleteUser(user)); if (result.error && result.error.status !== 404) cleanupErrors.push('Test identity cleanup failed'); }
  if (tenants.length && ownedFixtures) { const result = await retry(() => admin.from('tenants').delete().in('id', tenants)); if (result.error) cleanupErrors.push('Test tenant cleanup failed'); }
  if (cleanupErrors.length) { console.error(`Cleanup requires attention for ${tag}: ${cleanupErrors.join('; ')}`); process.exitCode = 1; }
  else console.log('OCONNECT_TEST_FIXTURES_REMOVED');
}
