import {constantEqual,createCheckout,GatewayError,reconcile,type Credentials} from "./provider.ts";
const base=Deno.env.get("SUPABASE_URL")!;
const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function rpc<T>(name:string,body:unknown):Promise<T>{const r=await fetch(`${base}/rest/v1/rpc/${name}`,{method:"POST",headers:{apikey:service,Authorization:`Bearer ${service}`,"Content-Type":"application/json"},body:JSON.stringify(body)});if(!r.ok){const e=await r.json();throw new GatewayError(String(e.message).includes("PAYMENT_NOT_CONFIGURED")?"PAYMENT_NOT_CONFIGURED":"PAYMENT_ACCESS_OR_STATE_DENIED");}return r.json();}
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin");const allowed=!origin||["https://osekola.com","https://www.osekola.com","http://localhost:3000"].includes(origin);
 const headers={"Content-Type":"application/json","Cache-Control":"no-store","Access-Control-Allow-Origin":allowed?(origin??"https://osekola.com"):"https://osekola.com","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS",Vary:"Origin"};
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(!allowed)return reply({error:"ORIGIN_DENIED"},403);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return reply({error:"METHOD_NOT_ALLOWED"},405);
 try{
  const raw=await req.text();if(raw.length>32000)return reply({error:"PAYLOAD_TOO_LARGE"},413);const body=JSON.parse(raw);const path=new URL(req.url).pathname;
  if(path.endsWith("/webhook/xendit")||path.endsWith("/webhook/midtrans")){
   const xendit=path.endsWith("/xendit");const id=xendit?body.data?.reference_id:body.order_id;
   if(typeof id!=="string"||!uuid.test(id))return reply({error:"INVALID_REFERENCE"},400);
   const c=await rpc<Credentials>("school_payment_credentials",{intent:id});
   if(!c||c.provider!==(xendit?"XENDIT":"MIDTRANS"))return reply({error:"INVALID_PROVIDER"},403);
   if(xendit&&(!c.webhook_secret||!constantEqual(req.headers.get("x-callback-token")??"",c.webhook_secret)))return reply({error:"INVALID_WEBHOOK"},401);
   // The notification is a signal only. Fetch authoritative status with this
   // school's server key; never trust a browser redirect or webhook body amount.
   if(!c.provider_id){
    if(xendit&&typeof body.data?.payment_session_id==="string"&&/^ps-[a-zA-Z0-9-]+$/.test(body.data.payment_session_id))c.provider_id=body.data.payment_session_id;
    else if(!xendit)c.provider_id=id;
   }
   if(c.status!=="PAID")await rpc("school_payment_record",{intent:id,payload:{...await reconcile(id,c),provider_id:c.provider_id}});
   return reply({received:true});
  }
  let actor:string|null=null;const bearer=req.headers.get("authorization")?.replace(/^Bearer /i,"");
  if(bearer&&bearer!==anon&&!bearer.startsWith("sb_publishable_")){const r=await fetch(`${base}/auth/v1/user`,{headers:{apikey:anon,Authorization:`Bearer ${bearer}`}});if(!r.ok)return reply({error:"AUTH_REQUIRED"},401);actor=(await r.json()).id;}
  if(!["bill","admission"].includes(body.kind)||!uuid.test(body.target??""))return reply({error:"INVALID_TARGET"},400);
  if(!actor&&!(body.kind==="admission"&&/^[a-f0-9]{64}$/.test(body.access_token??"")))return reply({error:"AUTH_REQUIRED"},401);
  const i=await rpc<{id:string;provider:string;status:string;checkout_url:string|null;create:boolean}>("school_payment_reserve",{actor,kind:body.kind,target:body.target,access_token:body.access_token??""});
  const c=await rpc<Credentials>("school_payment_credentials",{intent:i.id});
  if(!c)return reply({error:"PAYMENT_NOT_CONFIGURED"},503);
  if(i.create){try{const result=await createCheckout(i.id,c);await rpc("school_payment_record",{intent:i.id,payload:result});return reply({id:i.id,provider:i.provider,...result});}catch(e){await rpc("school_payment_record",{intent:i.id,payload:{status:e instanceof GatewayError&&e.definite?"FAILED":"UNKNOWN"}});
   if(e instanceof GatewayError&&e.definite&&c.provider==="XENDIT"){
    const backup=await rpc<{id:string;provider:string}>("school_payment_fallback",{failed_intent:i.id});
    try{const keys=await rpc<Credentials>("school_payment_credentials",{intent:backup.id});const result=await createCheckout(backup.id,keys);await rpc("school_payment_record",{intent:backup.id,payload:result});return reply({id:backup.id,provider:"MIDTRANS",...result});}
    catch(err){await rpc("school_payment_record",{intent:backup.id,payload:{status:err instanceof GatewayError&&err.definite?"FAILED":"UNKNOWN"}});throw err;}
   }throw e;}}
  if(!c.provider_id&&c.provider==="MIDTRANS")c.provider_id=i.id;
  if(c.provider_id){const result=await reconcile(i.id,c);await rpc("school_payment_record",{intent:i.id,payload:{...result,provider_id:c.provider_id}});return reply({id:i.id,provider:i.provider,status:result.status,checkout_url:result.status==="OPEN"?i.checkout_url:null});}
  return reply({id:i.id,status:i.status,error:"RECONCILIATION_REQUIRED"},409);
 }catch(e){return reply({error:e instanceof GatewayError?e.code:"PAYMENT_UNAVAILABLE"},e instanceof GatewayError&&e.code==="PAYMENT_ACCESS_OR_STATE_DENIED"?403:503);}
});
