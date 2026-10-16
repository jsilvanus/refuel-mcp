import {before,after,describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import {buildApp} from '../src/app.js';
import {PostgresStore} from '../src/storage/postgres.js';

const token='refuel-test-bearer-token-'+randomBytes(32).toString('hex');
const userId='test-'+randomUUID();
let store:PostgresStore,app:FastifyInstance,base='';
before(async()=>{
 store=new PostgresStore();await store.migrate();
 await store.createUser({id:userId,name:'Fuel Test User',createdAt:Date.now()});
 app=await buildApp({publicUrl:'http://127.0.0.1',jwtSecret:randomBytes(32),store,users:store,db:store.pool,authMode:'bearer',bearerToken:token,defaultUserId:userId,logger:false});
 await app.listen({host:'127.0.0.1',port:0});
 const address=app.server.address();base=typeof address==='object'&&address?'http://127.0.0.1:'+address.port:'';
});
after(async()=>{await app.close();await store.pool.query('DELETE FROM users WHERE id=$1',[userId]);await store.close();});
async function rpc(method:string,params:unknown={},auth=true,id=1){
 const response=await fetch(base+'/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream',...(auth?{authorization:'Bearer '+token}:{})},body:JSON.stringify({jsonrpc:'2.0',id,method,params})});
 const text=await response.text();
 const line=text.split('\n').find(x=>x.startsWith('data: '));
 return {status:response.status,headers:response.headers,message:line?JSON.parse(line.slice(6)):text?JSON.parse(text):null};
}
const toolValue=(r:any)=>JSON.parse(r.message.result.content[0].text);
describe('Refuel MCP over Streamable HTTP',()=>{
 it('requires the configured bearer token',async()=>{
  const r=await rpc('tools/list',{},false);
  assert.equal(r.status,401);
  assert.match(r.headers.get('www-authenticate')??'','Bearer');
 });
 it('creates a car, records refuelling, marks a falling odometer untrusted, and reads summaries',async()=>{
  const init=await rpc('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'test',version:'1'}});
  assert.equal(init.status,200);
  const list=await rpc('tools/list',{},true,2);
  assert.equal(list.status,200);
  const names=list.message.result.tools.map((x:any)=>x.name);
  assert.ok(names.includes('save_car'));assert.ok(names.includes('save_refueling_record'));
  const created=toolValue(await rpc('tools/call',{name:'save_car',arguments:{name:'Test Car',is_default:true}},true,3));
  const carId=created.id;assert.ok(carId);
  const first=toolValue(await rpc('tools/call',{name:'save_refueling_record',arguments:{car_id:carId,event_at:'2026-10-01T10:00:00Z',litres:40,total_paid:70,price_per_litre:1.75,odometer_km:10000}},true,4));
  assert.equal(first.record.odometer_trust,'trusted');
  const second=toolValue(await rpc('tools/call',{name:'save_refueling_record',arguments:{car_id:carId,event_at:'2026-10-10T10:00:00Z',litres:35,total_paid:61.25,price_per_litre:1.75,odometer_km:9900}},true,5));
  assert.equal(second.record.odometer_trust,'untrusted');
  assert.ok(second.odometer_warning);
  const read=await rpc('resources/read',{uri:'fuel://summary/months/2026-10'},true,6);
  assert.equal(read.status,200);
  const summary=JSON.parse(read.message.result.contents[0].text);
  assert.equal(summary.summary.record_count,2);
  assert.equal(summary.summary.litres_purchased,75);
  assert.equal(summary.summary.total_spend,131.25);
 });
});
