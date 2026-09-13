export type Provider = "XENDIT"|"MIDTRANS";
export type Credentials = {secret:string;webhook_secret?:string;is_live:boolean;provider:Provider;provider_id?:string;amount:number;status:string};
export class GatewayError extends Error { constructor(public code:string,public definite=false){super(code);} }
const allowedCheckoutHosts = new Set(["checkout.xendit.co","checkout-staging.xendit.co","xen.to","dev.xen.to","app.midtrans.com","app.sandbox.midtrans.com"]);
export function safeCheckout(value:unknown){if(typeof value!=="string")throw new GatewayError("INVALID_CHECKOUT_URL");const u=new URL(value);if(u.protocol!=="https:"||!allowedCheckoutHosts.has(u.hostname)||u.username||u.password)throw new GatewayError("INVALID_CHECKOUT_URL");return u.href;}
export async function providerRequest(url:string,c:Credentials,body?:unknown){
 let r:Response;try{r=await fetch(url,{method:body?"POST":"GET",headers:{Authorization:`Basic ${btoa(c.secret+":")}`,"Content-Type":"application/json",Accept:"application/json"},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});}catch{throw new GatewayError("PROVIDER_UNCERTAIN");}
 if(!r.ok)throw new GatewayError("PROVIDER_REJECTED_"+r.status,[400,401,403,404,422].includes(r.status));
 try{return await r.json() as Record<string,unknown>;}catch{throw new GatewayError("PROVIDER_UNCERTAIN");}
}
export async function createCheckout(id:string,c:Credentials){
 const returnUrl="https://osekola.com/payment-return";
 if(c.provider==="XENDIT"){
  const r=await providerRequest("https://api.xendit.co/sessions",c,{reference_id:id,session_type:"PAY",mode:"PAYMENT_LINK",amount:Number(c.amount),currency:"IDR",country:"ID",locale:"id",customer:{reference_id:id.replaceAll("-",""),type:"INDIVIDUAL",individual_detail:{given_names:"OSEKOLA"}},description:"Pembayaran sekolah OSEKOLA",success_return_url:returnUrl,cancel_return_url:returnUrl});
  if(typeof r.payment_session_id!=="string")throw new GatewayError("PROVIDER_UNCERTAIN");
  return {provider_id:r.payment_session_id,checkout_url:safeCheckout(r.payment_link_url),status:"OPEN"};
 }
 const r=await providerRequest(`https://${c.is_live?"app.midtrans.com":"app.sandbox.midtrans.com"}/snap/v1/transactions`,c,{transaction_details:{order_id:id,gross_amount:Number(c.amount)},callbacks:{finish:returnUrl}});
 return {provider_id:id,checkout_url:safeCheckout(r.redirect_url),status:"OPEN"};
}
export function verifiedStatus(id:string,c:Credentials,r:Record<string,unknown>){
 if(c.provider==="XENDIT"){
  if(r.reference_id!==id||r.payment_session_id!==c.provider_id||r.session_type!=="PAY"||r.currency!=="IDR"||Number(r.amount)!==Number(c.amount))throw new GatewayError("PROVIDER_MISMATCH");
  if(r.status==="COMPLETED"&&typeof r.payment_id==="string")return {status:"PAID",amount:Number(r.amount),currency:"IDR",payment_id:r.payment_id};
  if(["EXPIRED","CANCELED"].includes(String(r.status)))return {status:"EXPIRED"};
 }else{
  if(r.order_id!==id||r.currency!=="IDR"||Number(r.gross_amount)!==Number(c.amount))throw new GatewayError("PROVIDER_MISMATCH");
  if((r.transaction_status==="settlement"||(r.transaction_status==="capture"&&r.fraud_status==="accept"))&&typeof r.transaction_id==="string")return {status:"PAID",amount:Number(r.gross_amount),currency:"IDR",payment_id:r.transaction_id};
  if(["expire","cancel","deny","failure"].includes(String(r.transaction_status)))return {status:"EXPIRED"};
 }
 return {status:"OPEN"};
}
export async function reconcile(id:string,c:Credentials){
 if(!c.provider_id)throw new GatewayError("RECONCILIATION_REQUIRED");
 const url=c.provider==="XENDIT"?`https://api.xendit.co/sessions/${encodeURIComponent(c.provider_id)}`:`https://${c.is_live?"api.midtrans.com":"api.sandbox.midtrans.com"}/v2/${encodeURIComponent(id)}/status`;
 return verifiedStatus(id,c,await providerRequest(url,c));
}
export function constantEqual(a:string,b:string){const x=new TextEncoder().encode(a),y=new TextEncoder().encode(b);let diff=x.length^y.length;for(let i=0;i<Math.max(x.length,y.length);i++)diff|=(x[i]??0)^(y[i]??0);return diff===0;}
