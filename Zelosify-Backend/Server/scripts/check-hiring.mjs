import 'dotenv/config';
import {makeDemoPdf} from './demo-fixtures.mjs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {PrismaClient} from '@prisma/client';
assert.equal(process.env.NODE_ENV,'development');
const base=`http://localhost:${process.env.PORT||5050}/api`,db=new PrismaClient();
const opening='20000000-0000-4000-8000-000000000002';
async function login(username){const r=await fetch(`${base}/v1/auth/verify-login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({usernameOrEmail:username,password:process.env.LOCAL_DEMO_PASSWORD})});assert.equal(r.status,200,`Login failed: ${username}`);return r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');}
async function req(path,cookie,options={}){return fetch(`${base}${path}`,{...options,headers:{cookie,...options.headers}});}
const vendor=await login('vendor.demo'),partner=await login('vendor.two'),manager=await login('manager.demo'),otherManager=await login('manager.two');
const bytes=makeDemoPdf();
const name=`integration-résumé-${crypto.randomUUID()}.pdf`;
const profiles=[];const tenant=`http-test-${crypto.randomUUID()}`;
const partnerUser=await db.user.findUniqueOrThrow({where:{username:'vendor.two'}});
let moved=false;
try{
 assert.equal((await fetch(`${base}/vendor/openings`)).status,401);
 assert.equal((await fetch(`${base}/v1/auth/register`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role:'HIRING_MANAGER',tenantId:'bruce-wayne-corp'})})).status,403);
 assert.equal((await req('/vendor/openings',vendor,{headers:{origin:'https://untrusted.example'}})).status,403);
 const token=vendor.split('; ').find(c=>c.startsWith('access_token=')).slice(13).split('.');
 const claims=JSON.parse(Buffer.from(token[1],'base64url').toString());claims.realm_access={roles:['HIRING_MANAGER']};
 token[1]=Buffer.from(JSON.stringify(claims)).toString('base64url');
 assert.equal((await req('/hiring-manager/openings',vendor,{headers:{authorization:`Bearer ${token.join('.')}`}})).status,401);
 assert.equal((await req('/hiring-manager/openings',vendor)).status,403);
 assert.equal((await req('/vendor/openings',manager)).status,403);
 const list=await(await req('/vendor/openings?limit=5',vendor)).json();assert.equal(list.total,12);assert.equal(list.items.length,5);
 const assigned=await(await req('/hiring-manager/openings',manager)).json();assert.equal(assigned.total,9);
 assert.equal((await req(`/hiring-manager/openings/${opening}`,otherManager)).status,404);
 const authorized=await req(`/vendor/openings/${opening}/profiles/presign`,vendor,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({files:[{name,size:bytes.length,type:'application/pdf'}]})});assert.equal(authorized.status,201);
 const ticket=await authorized.json();
 function body(){const f=new FormData();f.append('uploadIntentId',ticket.uploadIntentId);f.append('files',new Blob([bytes],{type:'application/pdf'}),name);return f;}
 assert.equal((await req(`/vendor/openings/${opening}/profiles/upload`,partner,{method:'POST',body:body()})).status,404);
 const upload=await req(`/vendor/openings/${opening}/profiles/upload`,vendor,{method:'POST',body:body()});assert.equal(upload.status,201);const uploaded=await upload.json();const p=uploaded.items[0];profiles.push(p.id);
 const replay=await req(`/vendor/openings/${opening}/profiles/upload`,vendor,{method:'POST',body:body()});assert.equal((await replay.json()).replayed,true);
 const own=await(await req(`/vendor/openings/${opening}/profiles`,vendor)).json();assert(own.items.some(p2=>p2.id===p.id));assert(!('recommendationScore' in own.items[0]));
 const others=await(await req(`/vendor/openings/${opening}/profiles`,partner)).json();assert(!others.items.some(p2=>p2.id===p.id));
 for(const [path,cookie] of [[`/vendor/profiles/${p.id}/preview`,partner],[`/hiring-manager/profiles/${p.id}/preview`,otherManager]])assert.equal((await req(path,cookie)).status,404);
 assert.equal((await req(`/vendor/profiles/${p.id}`,partner,{method:'DELETE'})).status,404);
 const preview=await req(`/hiring-manager/profiles/${p.id}/preview`,manager);assert.equal(preview.status,200);assert(Buffer.from(await preview.arrayBuffer()).equals(bytes));
 const decide=(action,expectedStatus)=>req(`/hiring-manager/profiles/${p.id}/${action}`,manager,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({expectedStatus})});
 assert.equal((await decide('shortlist','SUBMITTED')).status,200);assert.equal((await decide('reject','SUBMITTED')).status,409);assert.equal((await decide('reject','SHORTLISTED')).status,200);
 await db.$transaction(async tx=>{await tx.tenants.create({data:{tenantId:tenant,companyName:'Disposable HTTP test tenant'}});await tx.user.update({where:{id:partnerUser.id},data:{tenantId:tenant}});});moved=true;
 assert.equal((await req(`/vendor/openings/${opening}`,partner)).status,404);
 assert.equal((await req(`/vendor/profiles/${p.id}/preview`,partner)).status,404);
 assert.equal((await req(`/vendor/openings/${opening}/profiles/presign`,partner,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({files:[{name,size:bytes.length,type:'application/pdf'}]})})).status,404);
 assert.equal((await req(`/vendor/profiles/${p.id}`,vendor,{method:'DELETE'})).status,204);
 assert.equal((await req(`/hiring-manager/profiles/${p.id}/preview`,manager)).status,404);
 console.log(JSON.stringify({liveAwsStorage:true,realKeycloakSessions:true,pagination:true,roleDenial:true,selfRegistrationDenied:true,forgedRoleDenied:true,untrustedOriginDenied:true,vendorIsolation:true,managerIsolation:true,tenantIsolation:true,previewByteMatch:true,idempotentSubmission:true,shortlistAndReject:true,staleDecisionDenied:true,softDeletion:true},null,2));
}finally{
 for(const id of profiles)await req(`/vendor/profiles/${id}`,vendor,{method:'DELETE'});
 if(moved)await db.$transaction([db.user.update({where:{id:partnerUser.id},data:{tenantId:partnerUser.tenantId}}),db.tenants.delete({where:{tenantId:tenant}})]);
 await db.$disconnect();
}
