import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const expectedUrl = 'https://xrqjutbwnlkogpfhtuwr.supabase.co';
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (url !== expectedUrl || !key) throw new Error('Expected OSEKOLA project configuration is required');
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const bucket = client.storage.from('platform-media');
const { data: existing, error: listError } = await bucket.list('brand');
if (listError) throw new Error('Unable to inspect platform brand storage');
if (existing.some(file => file.name === 'osekola-logo')) {
  console.log('Platform logo already exists; preserving the current logo.');
} else {
  const logo = await readFile(new URL('../../web/public/brand/osekola.png', import.meta.url));
  const { error } = await bucket.upload('brand/osekola-logo', logo, { contentType: 'image/png', upsert: false, cacheControl: '0' });
  if (error) throw new Error('Unable to initialize platform logo');
  console.log('Requested OSEKOLA logo initialized in platform storage.');
}
