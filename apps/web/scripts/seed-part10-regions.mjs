// Idempotent reference import; never deletes or changes school/user records.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createClient } from '@supabase/supabase-js';
const config=JSON.parse(await readFile(new URL('../../../deploy/osekola/public-web-config.json',import.meta.url)));
assert.equal(process.env.SUPABASE_URL?.replace(/\/$/,''),config.NEXT_PUBLIC_SUPABASE_URL);
assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY);
const client=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const text=gunzipSync(await readFile(new URL('../../api/database/references/indonesia-regions.csv.gz',import.meta.url))).toString('utf8');
function parse(line){const fields=[];let value='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){fields.push(value);value='';}else value+=c;}fields.push(value);assert.equal(fields.length,5);return fields;}
const rows=text.trim().split(/\r?\n/).slice(1).map(line=>{const [code,name,parent,level,postal]=parse(line);return {code,name,parent_code:parent||null,level:Number(level),postal_code:postal||null};});
assert.equal(rows.length,91599);assert.equal(new Set(rows.map(r=>r.code)).size,rows.length);
for(let start=0;start<rows.length;start+=1000){const {error}=await client.from('school_regions').upsert(rows.slice(start,start+1000),{onConflict:'code'});if(error)throw new Error(`Reference batch ${start}: ${error.message}`);}
for(const [level,total] of [[1,38],[2,514],[3,7285],[4,83762]]){const {count,error}=await client.from('school_regions').select('*',{count:'exact',head:true}).eq('level',level);assert.equal(error,null);assert.equal(count,total);}
console.log('Verified reference: 38 provinces, 514 cities/regencies, 7,285 districts, 83,762 villages.');
