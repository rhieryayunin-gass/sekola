import {afterEach,describe,expect,it,vi} from 'vitest';
import {constantEqual,createCheckout,GatewayError,providerRequest,safeCheckout,verifiedStatus,type Credentials} from './provider';
const x:Credentials={secret:'fixture-secret',webhook_secret:'fixture-hook',is_live:false,provider:'XENDIT',provider_id:'ps-fixture',amount:125000,status:'OPEN'};
const m:Credentials={...x,provider:'MIDTRANS'};
afterEach(()=>vi.unstubAllGlobals());
describe('provider confirmation and safe fallback',()=>{
 it.each(['http://checkout.xendit.co/x','https://checkout.xendit.co.evil.test/x','javascript:alert(1)','https://user:pass@app.midtrans.com/x','https://evil.test'])('rejects untrusted checkout %s',url=>expect(()=>safeCheckout(url)).toThrow());
 it.each(['https://checkout.xendit.co/x','https://app.sandbox.midtrans.com/snap/v2/x'])('accepts provider HTTPS checkout %s',url=>expect(safeCheckout(url)).toBe(url));
 it('requires the Xendit session, reference, amount and IDR to match',()=>{
  const response={reference_id:'ref',payment_session_id:'ps-fixture',session_type:'PAY',currency:'IDR',amount:125000,status:'COMPLETED',payment_id:'paid-fixture'};
  expect(verifiedStatus('ref',x,response)).toMatchObject({status:'PAID',amount:125000});
  for(const patch of [{reference_id:'foreign'},{payment_session_id:'ps-other'},{amount:1},{currency:'USD'},{session_type:'SAVE'}])expect(()=>verifiedStatus('ref',x,{...response,...patch})).toThrow('PROVIDER_MISMATCH');
  expect(verifiedStatus('ref',x,{...response,payment_id:undefined})).toEqual({status:'OPEN'});
 });
 it.each([['settlement',undefined,'PAID'],['capture','accept','PAID'],['capture','challenge','OPEN'],['pending',undefined,'OPEN'],['expire',undefined,'EXPIRED']])('verifies Midtrans %s / %s', (status,fraud,expected)=>expect(verifiedStatus('ref',m,{order_id:'ref',gross_amount:'125000.00',currency:'IDR',transaction_status:status,fraud_status:fraud,transaction_id:'fixture'}).status).toBe(expected));
 it('rejects a Midtrans cross-order or amount mismatch',()=>{
  expect(()=>verifiedStatus('ref',m,{order_id:'other',currency:'IDR',gross_amount:125000})).toThrow();
  expect(()=>verifiedStatus('ref',m,{order_id:'ref',currency:'IDR',gross_amount:1})).toThrow();
 });
 it.each([400,401,403,404,422])('permits fallback only after a definite rejection %i',async status=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status})));await expect(providerRequest('https://provider.invalid',x,{})).rejects.toMatchObject({definite:true});});
 it.each([429,500,502,503])('never permits fallback on ambiguous response %i',async status=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status})));await expect(providerRequest('https://provider.invalid',x,{})).rejects.toMatchObject({definite:false});});
 it('never permits fallback on timeout or malformed successful response',async()=>{vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('timeout')));await expect(providerRequest('https://provider.invalid',x,{})).rejects.toMatchObject({definite:false});vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('not-json')));await expect(providerRequest('https://provider.invalid',x,{})).rejects.toBeInstanceOf(GatewayError);});
 it('keeps keys server-side and uses configured Midtrans sandbox',async()=>{const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({redirect_url:'https://app.sandbox.midtrans.com/snap/v2/test'})));vi.stubGlobal('fetch',fetcher);expect(await createCheckout('ref',m)).toMatchObject({provider_id:'ref',status:'OPEN'});expect(fetcher.mock.calls[0][0]).toBe('https://app.sandbox.midtrans.com/snap/v1/transactions');const request=fetcher.mock.calls[0][1];expect(JSON.parse(request.body).transaction_details).toEqual({order_id:'ref',gross_amount:125000});expect(request.headers.Authorization).toBe('Basic '+btoa('fixture-secret:'));});
 it('checks callback tokens exactly',()=>{expect(constantEqual('abc','abc')).toBe(true);expect(constantEqual('abc','abcd')).toBe(false);expect(constantEqual('abc','abd')).toBe(false);expect(constantEqual('','secret')).toBe(false);});
});
