// Authentication administration is server-only. Every operation is authorized
// against an approved, immutable database request before contacting Auth.
const base=Deno.env.get('SUPABASE_URL')!;
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anon=Deno.env.get('SUPABASE_ANON_KEY')!;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Change={id:string;done?:boolean;tenant_id:string;target_id:string|null;provisioned_id?:string;operation:string;execution_status:string;execution_token:string;payload:{email?:string;full_name?:string}};
async function request<T>(path:string,body?:unknown,method='POST'):Promise<T>{const r=await fetch(`${base}${path}`,{method,headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const result=await r.json();if(!r.ok)throw new Error(result.message??result.msg??'Account service unavailable');return result as T;}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')??'https://osekola.com';const allowed=['https://osekola.com','https://www.osekola.com','http://localhost:3000'].includes(origin)||/^https:\/\/osekola-[a-z0-9-]+-albi-s-agentic\.vercel\.app$/.test(origin);
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':allowed?origin:'https://osekola.com','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS',Vary:'Origin'};
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(!allowed)return reply({error:'Origin denied'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'POST required'},405);
 let change:Change|undefined;let actor='';let applied=false;
 try{
  const bearer=req.headers.get('authorization')??'';if(!bearer.startsWith('Bearer '))return reply({error:'Sign in required'},401);
  const auth=await fetch(`${base}/auth/v1/user`,{headers:{apikey:anon,Authorization:bearer}});if(!auth.ok)return reply({error:'Sign in required'},401);actor=(await auth.json()).id;
  const raw=await req.text();if(raw.length>1200)return reply({error:'Payload too large'},413);const body=JSON.parse(raw);if(!uuid.test(body.change_id??''))return reply({error:'Invalid request'},400);
  const execute=(action:string,extra:Record<string,unknown>={})=>request<Change&{id:string}>('/rest/v1/rpc/school_people_execution',{actor_id:actor,change_id:body.change_id,action,lease:change?.execution_token??null,...extra});
  change=await execute('CLAIM');if(change.done)return reply({done:true,id:change.id});
  let person=change.target_id??change.provisioned_id;let temporaryPassword:string|undefined;
  if(change.operation==='CREATE'){
   temporaryPassword=`Ose9!${Array.from(crypto.getRandomValues(new Uint8Array(18)),n=>n.toString(16).padStart(2,'0')).join('')}`;
   if(!person){const created=await request<{id:string}>('/auth/v1/admin/users',{email:change.payload.email?.trim().toLowerCase(),password:temporaryPassword,email_confirm:true,ban_duration:'876000h',app_metadata:{tenant_id:change.tenant_id,school_change_id:change.id},user_metadata:{full_name:change.payload.full_name}});person=created.id;}
  }
  if(!person)throw new Error('Account identity unavailable');
  if(change.execution_status!=='DB_APPLIED')await execute('COMPLETE',{auth_user_id:person});applied=true;
  // DB_APPLIED is recoverable. A failed Auth update leaves a visible retry action.
  const update:Record<string,unknown>={};
  if(['CREATE','UPDATE'].includes(change.operation)){update.email=change.payload.email?.trim().toLowerCase();update.email_confirm=true;update.user_metadata={full_name:change.payload.full_name};}
  if(temporaryPassword)update.password=temporaryPassword;
  if(['CREATE','RESTORE'].includes(change.operation))update.ban_duration='none';
  if(change.operation==='ARCHIVE')update.ban_duration='876000h';
  await request(`/auth/v1/admin/users/${person}`,update,'PUT');
  await execute('AUTH_COMPLETE');
  return reply({done:true,id:person,...(temporaryPassword?{email:change.payload.email,temporary_password:temporaryPassword}:{})});
 }catch(e){
  if(change&&!applied&&change.execution_status!=='DB_APPLIED'){
   try{await request('/rest/v1/rpc/school_people_execution',{actor_id:actor,change_id:change.id,action:'RELEASE',lease:change.execution_token});}catch{/* The expiring lease supports recovery. */}
  }
  return reply({error:e instanceof Error?e.message:'Account change unavailable'},409);
 }
});
