import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import * as crypto from 'node:crypto';
import ts from 'typescript';
const root=resolve(import.meta.dirname,'..');
function load(file,mocks={}){const exports={};const code=ts.transpileModule(readFileSync(resolve(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports',code)(name=>{if(name==='node:crypto')return crypto;if(name in mocks)return mocks[name];throw new Error(`Unexpected import ${name}`);},exports);return exports;}
const shared={invoiceBalanceCents:invoice=>Math.max(0,invoice.total_cents-invoice.amount_paid_cents),fmtMoney:cents=>String(cents)};
const invoice={id:'invoice-test',number:'INV-TEST',total_cents:24000,amount_paid_cents:10000,customer_name:'Test Customer',customer_email:'test@example.test',status:'draft',service_autopay_authorization_id:'auth-test',service_autopay_finalized_at:'2026-10-12T00:00:00Z',square_publish_attempt_key:null,square_publish_fingerprint:null,square_invoice_id:null,hosted_payment_url:null};
const items=[{name:'House Washing',quantity:1,unit_price_cents:30000,line_total_cents:24000}];

test('authorized Square invoice collects only the balance using saved card and email',async()=>{
 const calls=[];const original=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);calls.push({url,body});if(url.endsWith('/orders'))return Response.json({order:{id:'order-test'}});if(url.endsWith('/invoices'))return Response.json({invoice:{id:'square-test',version:0}});if(url.endsWith('/publish'))return Response.json({invoice:{public_url:'https://example.test/pay'}});throw new Error('Unexpected provider operation');};
 try{
 const {createSquareInvoice}=load('lib/canes/square.ts',{'./square-config':{SQUARE_API_BASE:'https://square.example.test',SQUARE_ENV:'sandbox',SQUARE_VERSION:'test'},'./square-cards':{invoiceCardAuthorization:async()=>({customerId:'customer-test',cardId:'card-test'})},'@/lib/canes/supabase':{squarePaymentsReady:()=>true},'@/lib/canes/invoices':{getInvoicePayments:async()=>[]},'@/lib/canes/push-events':{},'@/lib/canes/payment-notifications':{},'@/lib/canes/types':shared});
 assert.equal((await createSquareInvoice(invoice,items,'attempt-test')).error,undefined);
 assert.equal(calls.length,3);const request=calls.find(call=>call.url.endsWith('/invoices')).body.invoice;
 assert.equal(request.delivery_method,'EMAIL');assert.equal(request.primary_recipient.customer_id,'customer-test');assert.equal(request.payment_requests[0].automatic_payment_source,'CARD_ON_FILE');assert.equal(request.payment_requests[0].card_id,'card-test');
 const order=calls[0].body.order;assert.equal(order.line_items[0].base_price_money.amount,30000);assert.equal(order.discounts[0].amount_money.amount,16000);
 }finally{globalThis.fetch=original;}
});

test('uncertain card invoice retry retains provider identities and reuses one operation key',async()=>{
 let current={...invoice};const attempts=[];let released=0;
 const db={rpc:async(name,args)=>{if(name==='claim_invoice_billing_operation'){current.billing_operation_id=args.p_operation_id;return {data:true,error:null};}if(name==='release_invoice_billing_operation'){released++;return {data:true,error:null};}throw new Error(name);},from:()=>{let patch;const query={update(value){patch=value;return query;},eq(){return query;},is(){return query;},neq(){return query;},select(){return query;},async maybeSingle(){current={...current,...patch};return {data:{id:current.id},error:null};}};return query;}};
 const fingerprint=load('lib/canes/invoice-publish-fingerprint.ts');
 const {publishServiceInvoice}=load('lib/canes/service-billing.ts',{'@urso/types':shared,'./supabase':{canesDb:()=>db},'./invoices':{getInvoice:async()=>({...current}),getInvoiceItems:async()=>items},'./square':{createSquareInvoice:async(_bill,_items,key)=>{attempts.push(key);return attempts.length===1?{error:'timeout',squareInvoiceId:'square-test',squareOrderId:'order-test',hostedUrl:null}:{squareInvoiceId:'square-test',squareOrderId:'order-test',hostedUrl:'https://example.test/pay'};}},'./invoice-publish-fingerprint':fingerprint,'./push-events':{pushPaymentIssue:async()=>{}}});
 assert.equal((await publishServiceInvoice(current.id)).ok,false);assert.equal(current.square_invoice_id,'square-test');assert.ok(current.square_publish_attempt_key);
 assert.equal((await publishServiceInvoice(current.id)).ok,true);assert.equal(attempts[0],attempts[1]);assert.equal(current.square_publish_attempt_key,null);assert.equal(released,2);
 await publishServiceInvoice(current.id);assert.equal(attempts.length,2);
 current={...invoice,square_publish_attempt_key:'old',square_publish_fingerprint:'different'};
 assert.equal((await publishServiceInvoice(current.id)).ok,false);assert.equal(attempts.length,2);
});

test('lost card creation response recovers the verified card without storing or reusing a nonce',async()=>{
 const original=globalThis.fetch,calls=[],writes=[];
 const card={id:'card-test',customer_id:'customer-test',reference_id:'enrollment-test',enabled:true,last_4:'1111'};
 globalThis.fetch=async(url,options)=>{calls.push(url);assert.equal(options.method,'GET');return Response.json(url.includes('?')?{cards:[card]}:{card});};
 const db={from:table=>{const query={update(value){writes.push({table,value});return query;},eq(){return query;},in(){return query;},select(){return query;},async maybeSingle(){return {data:{id:'enrollment-test'},error:null};},async upsert(value){writes.push({table,value});return {error:null};}};return query;}};
 try{const {saveEnrollmentCard}=load('lib/canes/square-cards.ts',{'./supabase':{canesDb:()=>db},'./square-config':{SQUARE_API_BASE:'https://square.example.test',squareHeaders:()=>({})}});await saveEnrollmentCard({id:'enrollment-test',state:'preparing',square_customer_id:'customer-test',customer_name:'Test',customer_email:'test@example.test',snapshot:{},choices:[],terms_text:'Terms',terms_version:'test'},'nonce-not-stored');assert.equal(calls.length,2);assert.equal(JSON.stringify(writes).includes('nonce-not-stored'),false);assert.equal(writes[0].value.square_card_id,'card-test');}finally{globalThis.fetch=original;}
});
