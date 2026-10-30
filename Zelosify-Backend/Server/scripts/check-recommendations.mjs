import 'dotenv/config';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {zipSync,strToU8} from 'fflate';
import {makeDemoPdf} from './demo-fixtures.mjs';
assert.equal(process.env.NODE_ENV,'development');
const base=`http://localhost:${process.env.PORT||5050}/api/v1`,opening='20000000-0000-4000-8000-000000000001';
async function login(username){const r=await fetch(`${base}/auth/verify-login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({usernameOrEmail:username,password:process.env.LOCAL_DEMO_PASSWORD})});assert.equal(r.status,200);return r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');}
const vendor=await login('vendor.demo'),manager=await login('manager.demo'),otherManager=await login('manager.two');
const req=(path,cookie,options={})=>fetch(`${base}${path}`,{...options,headers:{cookie,...options.headers}});
const body={experienceYears:5,skills:['React','TypeScript','Next.js'],location:'Bengaluru'};
const content='Fictional applicant. 5 years experience. Skills: React, TypeScript, Next.js. Location: Bengaluru. Education: BSc Computer Science.';
const pptx=Buffer.from(zipSync({'[Content_Types].xml':strToU8('<Types><Override ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>'),'ppt/presentation.xml':strToU8('<p:presentation/>'),'ppt/slides/slide1.xml':strToU8(`<p:sld><a:t>${content}</a:t></p:sld>`)}));
const suffix=crypto.randomUUID(),files=[{name:`live-agent-${suffix}.pdf`,bytes:makeDemoPdf('Fictional AI check'),type:'application/pdf'},{name:`live-agent-${suffix}.pptx`,bytes:pptx,type:'application/vnd.openxmlformats-officedocument.presentationml.presentation'}];
const ids=[];const started=performance.now();
try{
 const ticketResponse=await req(`/vendor/openings/${opening}/profiles/presign`,vendor,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({files:files.map(f=>({name:f.name,size:f.bytes.length,type:f.type}))})});assert.equal(ticketResponse.status,201);const ticket=await ticketResponse.json();
 const form=new FormData();form.append('uploadIntentId',ticket.uploadIntentId);files.forEach(f=>form.append('files',new Blob([f.bytes],{type:f.type}),f.name));
 const uploadStart=performance.now(),submitted=await req(`/vendor/openings/${opening}/profiles/upload`,vendor,{method:'POST',body:form});assert.equal(submitted.status,201);ids.push(...(await submitted.json()).items.map(p=>p.id));const submissionMs=Math.round(performance.now()-uploadStart);
 console.log(JSON.stringify({event:'live-ai.submitted',count:ids.length,submissionMs}));
 const deadline=Date.now()+210000;let items=[];
 while(Date.now()<deadline){const response=await req(`/hiring-manager/openings/${opening}/profiles?limit=100`,manager);assert.equal(response.status,200);items=(await response.json()).items.filter(p=>ids.includes(p.id));if(items.length===2&&items.every(p=>['COMPLETED','FAILED'].includes(p.recommendationJob?.state)))break;await new Promise(resolve=>setTimeout(resolve,3000));}
 assert.equal(items.length,2);assert(items.every(p=>p.recommendationJob?.state==='COMPLETED'),JSON.stringify(items.map(p=>({type:p.mimeType,state:p.recommendationJob?.state,code:p.recommendationJob?.errorCode}))));
 for(const p of items){assert(p.recommendationScore>=0&&p.recommendationScore<=1);assert(p.recommendationReason);assert.equal(p.recommendationVersion,'gemini-tools-v1');assert.equal((await req(`/hiring-manager/profiles/${p.id}/recommendation/retry`,otherManager,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,404);assert.equal((await req(`/vendor/profiles/${p.id}/recommendation/retry`,vendor,{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,404);}
 const vendorView=await(await req(`/vendor/openings/${opening}/profiles?limit=100`,vendor)).json();for(const p of vendorView.items){assert(!('recommendationScore'in p));assert(!('recommendationJob'in p));}
 const decision=await req(`/hiring-manager/profiles/${ids[0]}/shortlist`,manager,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({expectedStatus:'SUBMITTED'})});assert.equal(decision.status,200);
 console.log(JSON.stringify({liveGemini:true,liveS3:true,realKeycloak:true,automaticJobTrigger:true,managerOnlyResults:true,assignedManagerGuard:true,vendorAIFieldsAbsent:true,shortlist:true,submissionMs,totalMs:Math.round(performance.now()-started),results:items.map(p=>({mimeType:p.mimeType,score:p.recommendationScore,category:p.recommendationCategory,confidence:p.recommendationConfidence,latencyMs:p.recommendationLatencyMs}))},null,2));
}finally{for(const id of ids)await req(`/vendor/profiles/${id}`,vendor,{method:'DELETE'});}
