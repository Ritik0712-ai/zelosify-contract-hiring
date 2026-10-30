import 'dotenv/config';
import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {PrismaClient,Role} from '@prisma/client';
import crypto from 'node:crypto';
import {zipSync,strToU8} from 'fflate';
import {HiringService,Actor} from '../../src/services/hiring/hiringService.js';
import {DocumentStore,StoredObject} from '../../src/services/hiring/storage.js';
import {batchSpec,MAX_FILE_BYTES,PDF,PPTX} from '../../src/services/hiring/documents.js';
import {RecommendationWorker} from '../../src/services/recommendation/worker.js';
import {ModelClient} from '../../src/services/recommendation/gemini.js';
import {AgentError} from '../../src/services/recommendation/parse.js';
const db=new PrismaClient();
function successfulModel():ModelClient {
 const facts={experienceYears:5,skills:['React'],location:'Bengaluru',education:[],keywords:[],evidence:{experienceYears:'5 years',skills:'React',location:'Bengaluru'}};
 const names=['parse_resume','extract_features','normalize_skills','match_profile','score_profile','finish_recommendation'];
 return {model:'TEST-TRANSPORT',async turn(_system,contents){const count=contents.flatMap(c=>c.parts).filter(p=>p.functionResponse).length;const name=names[Math.min(count,5)];const scored=contents.flatMap(c=>c.parts).find(p=>p.functionResponse?.name==='score_profile')?.functionResponse.response.result;return {content:{role:'model',parts:[{functionCall:{name,args:name==='extract_features'?facts:name==='finish_recommendation'?{score:scored.score,recommended:scored.recommended,confidence:scored.confidence,reason:scored.reason}:{}}}]},usage:{input:1,output:1,thinking:0},latencyMs:0};}};
}
const aiPptx=Buffer.from(zipSync({'[Content_Types].xml':strToU8('<Types><Override ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>'),'ppt/presentation.xml':strToU8('<p:presentation/>'),'ppt/slides/slide1.xml':strToU8('<p:sld><a:t>Fictional software engineer. 5 years experience. Skills: React. Location: Bengaluru.</a:t></p:sld>')}));
const tenants=[`test-hiring-${crypto.randomUUID()}`,`test-hiring-${crypto.randomUUID()}`];
class MemoryStore implements DocumentStore {
 values=new Map<string,Buffer>();puts=0;failAt=0;failRemove=false;
 async put(key:string,body:Buffer){if(++this.puts===this.failAt)throw new Error('simulated storage failure');this.values.set(key,body);return {key,versionId:'v1'};}
 async get(key:string){const b=this.values.get(key);if(!b)throw new Error('missing');return b;}
 async remove(object:StoredObject){if(this.failRemove)throw new Error('simulated cleanup failure');this.values.delete(object.key);}
}
const pdf=Buffer.from('%PDF-1.4\n1 0 obj <</Type /Catalog>> endobj\n%%EOF');
const presentation=Buffer.from(zipSync({'[Content_Types].xml':strToU8('<Types><Override ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>'),'ppt/presentation.xml':strToU8('<p:presentation/>'),'ppt/slides/slide1.xml':strToU8('<p:sld><a:t>Demo &lt;script&gt;alert(1)&lt;/script&gt;</a:t></p:sld>')}));
function upload(name='candidate.pdf',buffer=pdf,type=PDF){return {originalname:name,mimetype:type,buffer,size:buffer.length};}
let vendor:Actor,otherVendor:Actor,manager:Actor,otherManager:Actor,foreignVendor:Actor;
let openingId:string,otherOpeningId:string,foreignOpeningId:string;
let store:MemoryStore,service:HiringService;
async function clearProfiles(){
 await db.$transaction(async tx=>{
  await tx.recommendationJob.deleteMany({where:{profile:{tenantId:{in:tenants}}}});
  await tx.profileDecision.deleteMany({where:{profile:{tenantId:{in:tenants}}}});
  await tx.hiringProfile.deleteMany({where:{tenantId:{in:tenants}}});
  await tx.uploadIntent.deleteMany({where:{tenantId:{in:tenants}}});
 });
}
async function submit(actor=vendor,id=openingId,files=[upload()]){
 const ticket=await service.authorizeUpload(actor,id,files.map(f=>({name:f.originalname,size:f.size,type:f.mimetype})));
 return {ticket,result:await service.submit(actor,id,ticket.uploadIntentId,files)};
}
describe('Hiring workflow with real PostgreSQL and isolated test storage',()=>{
 beforeAll(async()=>{
  if(!['development','test'].includes(process.env.NODE_ENV||'')||new URL(process.env.DATABASE_URL!).hostname!=='localhost')throw new Error('Integration tests require the local development database');
  await db.$transaction(async tx=>{
   for(const tenantId of tenants)await tx.tenants.create({data:{tenantId,companyName:'Disposable integration fixture'}});
   async function person(tenantId:string,role:Role){const u=await tx.user.create({data:{email:`${crypto.randomUUID()}@example.test`,role,tenantId}});return {id:u.id,tenantId,role};}
   vendor=await person(tenants[0],'IT_VENDOR');otherVendor=await person(tenants[0],'IT_VENDOR');manager=await person(tenants[0],'HIRING_MANAGER');otherManager=await person(tenants[0],'HIRING_MANAGER');foreignVendor=await person(tenants[1],'IT_VENDOR');const foreignManager=await person(tenants[1],'HIRING_MANAGER');
   async function opening(actor:Actor){return (await tx.opening.create({data:{tenantId:actor.tenantId,hiringManagerId:actor.id,title:'Integration opening',description:'Fixture',location:'Remote',contractType:'6 months',requiredSkills:['React'],experienceMin:2,experienceMax:5}})).id;}
   openingId=await opening(manager);otherOpeningId=await opening(otherManager);foreignOpeningId=await opening(foreignManager);
  });
 });
 beforeEach(async()=>{await clearProfiles();store=new MemoryStore();service=new HiringService(db,store);});
 afterAll(async()=>{await clearProfiles();await db.$transaction(async tx=>{await tx.opening.deleteMany({where:{tenantId:{in:tenants}}});await tx.user.deleteMany({where:{tenantId:{in:tenants}}});await tx.tenants.deleteMany({where:{tenantId:{in:tenants}}});});await db.$disconnect();});
 it('lists only tenant openings for vendors and only assigned openings for managers',async()=>{
  const v=await service.listOpenings(vendor,{page:1,limit:12});expect(v.total).toBe(2);expect(v.items.map(o=>o.id)).not.toContain(foreignOpeningId);
  const m=await service.listOpenings(manager,{page:1,limit:12});expect(m.items.map(o=>o.id)).toEqual([openingId]);
  await expect(service.opening(manager,otherOpeningId)).rejects.toMatchObject({status:404});
  await expect(service.opening(foreignVendor,openingId)).rejects.toMatchObject({status:404});
 });
 it('submits PDF and PPTX atomically and replays without duplicate objects or jobs',async()=>{
  const files=[upload(),upload('candidate.pptx',presentation,PPTX)];const {ticket,result}=await submit(vendor,openingId,files);
  expect(result.items).toHaveLength(2);expect(store.puts).toBe(2);expect(await db.recommendationJob.count({where:{profile:{tenantId:tenants[0]}}})).toBe(2);
  const replay=await service.submit(vendor,openingId,ticket.uploadIntentId,files);expect(replay.replayed).toBe(true);expect(store.puts).toBe(2);expect(replay.items.map(p=>p.id)).toEqual(result.items.map(p=>p.id));
 });
 it('hides other vendor uploads, counts and recommendation fields',async()=>{
  const {result}=await submit();const profile=result.items[0];
  const own=await service.profiles(vendor,openingId,{page:1,limit:10});expect(own.total).toBe(1);expect(own.items[0]).not.toHaveProperty('recommended');expect(own.items[0]).not.toHaveProperty('s3Key');
  expect((await service.profiles(otherVendor,openingId,{page:1,limit:10})).total).toBe(0);
  expect((await service.opening(otherVendor,openingId)).profilesCount).toBe(0);
  await expect(service.preview(otherVendor,profile.id,false)).rejects.toMatchObject({status:404});
  await expect(service.remove(otherVendor,profile.id)).rejects.toMatchObject({status:404});
 });
 it('rejects a different manager and tenant on preview and decisions',async()=>{
  const p=(await submit()).result.items[0];
  for(const a of [otherManager,foreignVendor])await expect(service.preview(a,p.id,false)).rejects.toMatchObject({status:404});
  await expect(service.decide(otherManager,p.id,'SHORTLISTED','SUBMITTED')).rejects.toMatchObject({status:404});
  await expect(service.decide(vendor,p.id,'SHORTLISTED','SUBMITTED')).rejects.toMatchObject({status:403});
 });
 it('records decisions, permits an explicit change and rejects stale state',async()=>{
  const p=(await submit()).result.items[0];
  expect((await service.decide(manager,p.id,'SHORTLISTED','SUBMITTED'))?.status).toBe('SHORTLISTED');
  await expect(service.decide(manager,p.id,'REJECTED','SUBMITTED')).rejects.toMatchObject({status:409});
  expect((await service.decide(manager,p.id,'REJECTED','SHORTLISTED'))?.status).toBe('REJECTED');
  await service.decide(manager,p.id,'REJECTED','SUBMITTED');
  expect(await db.profileDecision.count({where:{profileId:p.id}})).toBe(2);
 });
 it('soft-deletes an owned profile without removing its stored object and blocks further use',async()=>{
  const p=(await submit()).result.items[0];await service.remove(vendor,p.id);await service.remove(vendor,p.id);
  expect((await db.hiringProfile.findUniqueOrThrow({where:{id:p.id}})).isDeleted).toBe(true);expect(store.values.size).toBe(1);
  expect((await service.profiles(manager,openingId,{page:1,limit:10})).total).toBe(0);
  await expect(service.preview(vendor,p.id,false)).rejects.toMatchObject({status:404});
  await expect(service.decide(manager,p.id,'SHORTLISTED','SUBMITTED')).rejects.toMatchObject({status:404});
 });
 it('rejects spoofed extensions, oversized files, invalid PDFs and unsafe archive paths',async()=>{
  expect(()=>batchSpec([{name:'malware.exe',size:10,type:PDF}])).toThrow();
  expect(()=>batchSpec([{name:'large.pdf',size:MAX_FILE_BYTES+1,type:PDF}])).toThrow();
  expect(()=>batchSpec([{name:'../escape.pdf',size:10,type:PDF}])).toThrow();
  const bad=upload('spoof.pdf',Buffer.from('not a PDF'));await expect(submit(vendor,openingId,[bad])).rejects.toMatchObject({status:400});
  const zip=Buffer.from(zipSync({'../escape':strToU8('bad'),'ppt/presentation.xml':strToU8('bad')}));
  await expect(submit(vendor,openingId,[upload('unsafe.pptx',zip,PPTX)])).rejects.toMatchObject({status:400});
  expect(store.puts).toBe(0);
 });
 it('prevents foreign, expired and mismatched upload authorizations',async()=>{
  const file=upload();const ticket=await service.authorizeUpload(vendor,openingId,[{name:file.originalname,size:file.size,type:file.mimetype}]);
  await expect(service.submit(otherVendor,openingId,ticket.uploadIntentId,[file])).rejects.toMatchObject({status:404});
  await expect(service.submit(vendor,otherOpeningId,ticket.uploadIntentId,[file])).rejects.toMatchObject({status:404});
  await expect(service.submit(vendor,openingId,ticket.uploadIntentId,[upload('renamed.pdf')])).rejects.toMatchObject({status:400});
  await db.$transaction([db.uploadIntent.update({where:{id:ticket.uploadIntentId},data:{expiresAt:new Date(0)}})]);
  await expect(service.submit(vendor,openingId,ticket.uploadIntentId,[file])).rejects.toMatchObject({status:409});
 });
 it('does not accept profiles when an opening is on hold',async()=>{
  await db.$transaction([db.opening.update({where:{id:openingId},data:{status:'ON_HOLD'}})]);
  try{await expect(submit()).rejects.toMatchObject({status:409});}finally{await db.$transaction([db.opening.update({where:{id:openingId},data:{status:'OPEN'}})]);}
 });
 it('compensates partial S3 writes and leaves no profiles or jobs on storage failure',async()=>{
  store.failAt=2;
  await expect(submit(vendor,openingId,[upload(),upload('second.pdf')])).rejects.toThrow('simulated');
  expect(store.values.size).toBe(0);expect(await db.hiringProfile.count({where:{tenantId:tenants[0]}})).toBe(0);expect(await db.recommendationJob.count({where:{profile:{tenantId:tenants[0]}}})).toBe(0);
  expect((await db.uploadIntent.findFirstOrThrow({where:{tenantId:tenants[0]}})).state).toBe('FAILED');
 });
 it('retains cleanup receipts when the storage compensation fails',async()=>{
  store.failAt=2;store.failRemove=true;
  await expect(submit(vendor,openingId,[upload(),upload('second.pdf')])).rejects.toThrow();
  const intent=await db.uploadIntent.findFirstOrThrow({where:{tenantId:tenants[0]}});expect(intent.state).toBe('FAILED');expect((intent.storedObjects as any[])).toHaveLength(1);
 });
 it('rolls back the first profile and job when the second database create fails',async()=>{
  let creates=0;
  const failing=db.$extends({query:{hiringProfile:{async create({args,query}){if(++creates===2)throw new Error('simulated database write failure');return query(args);}}}});
  service=new HiringService(failing as unknown as PrismaClient,store);
  await expect(submit(vendor,openingId,[upload(),upload('second.pdf')])).rejects.toThrow('simulated database');
  expect(await db.hiringProfile.count({where:{tenantId:tenants[0]}})).toBe(0);
  expect(await db.recommendationJob.count({where:{profile:{tenantId:tenants[0]}}})).toBe(0);
  expect(store.values.size).toBe(0);
 });
 it('claims a concurrently submitted intent only once',async()=>{
  const file=upload();const ticket=await service.authorizeUpload(vendor,openingId,[{name:file.originalname,size:file.size,type:file.mimetype}]);
  const outcomes=await Promise.allSettled([service.submit(vendor,openingId,ticket.uploadIntentId,[file]),service.submit(vendor,openingId,ticket.uploadIntentId,[file])]);
  expect(outcomes.filter(r=>r.status==='fulfilled').length).toBeGreaterThanOrEqual(1);
  expect(await db.hiringProfile.count({where:{uploadIntentId:ticket.uploadIntentId}})).toBe(1);expect(store.puts).toBe(1);
 });
 it('escapes presentation text in a sandboxed preview and returns original downloads',async()=>{
  const p=(await submit(vendor,openingId,[upload('candidate.pptx',presentation,PPTX)])).result.items[0];
  const preview=await service.preview(manager,p.id,false);expect(preview.type).toContain('text/html');expect(preview.body.toString()).toContain('&lt;script&gt;');expect(preview.body.toString()).not.toContain('<script>');
  expect((await service.preview(manager,p.id,true)).body).toEqual(presentation);
 });
 it('supports paginated profiles and status filters without losing rows',async()=>{
  await submit(vendor,openingId,[upload('one.pdf'),upload('two.pdf'),upload('three.pdf')]);
  const first=await service.profiles(manager,openingId,{page:1,limit:2});const second=await service.profiles(manager,openingId,{page:2,limit:2});
  expect(first.total).toBe(3);expect(first.items).toHaveLength(2);expect(second.items).toHaveLength(1);expect(new Set([...first.items,...second.items].map(p=>p.id)).size).toBe(3);
  expect((await service.profiles(manager,openingId,{page:1,limit:2,status:'REJECTED'})).total).toBe(0);
 });
 it('runs submission through worker and decision with manager-only results, exactly once',async()=>{
  const {result}=await submit(vendor,openingId,[upload('resume.pptx',aiPptx,PPTX)]),id=result.items[0].id;
  const worker=new RecommendationWorker(db,store,successfulModel(),10000);
  expect(await worker.runOne(id)).toBe(true);expect(await worker.runOne(id)).toBe(false);
  const raw=await db.hiringProfile.findUniqueOrThrow({where:{id},include:{recommendationJob:true}});
  expect(raw.recommendationScore).toBe(1);expect(raw.recommendationJob?.state).toBe('COMPLETED');expect(raw.recommendationData).toHaveProperty('vector');expect(raw.recommendationJob?.audit).toHaveProperty('trace');
  const own=await service.profiles(vendor,openingId,{page:1,limit:10});expect(own.items[0]).not.toHaveProperty('recommendationJob');expect(own.items[0]).not.toHaveProperty('recommendationScore');
  expect((await service.profiles(manager,openingId,{page:1,limit:10})).items[0]).toHaveProperty('recommendationScore',1);
  await service.decide(manager,id,'SHORTLISTED','SUBMITTED');expect((await db.hiringProfile.findUniqueOrThrow({where:{id}})).status).toBe('SHORTLISTED');
  await expect(service.retryRecommendation(vendor,id)).rejects.toMatchObject({status:403});await expect(service.retryRecommendation(otherManager,id)).rejects.toMatchObject({status:404});await expect(service.retryRecommendation(manager,id)).rejects.toMatchObject({status:409});
 });
 it('records quota retry and exhausted failures without partial recommendation; scoped manager may retry',async()=>{
  const {result}=await submit(),id=result.items[0].id;
  const model:ModelClient={model:'TEST',turn:async()=>{throw new AgentError('PROVIDER_QUOTA',true);}};
  const worker=new RecommendationWorker(db,store,model,1000);
  await worker.runOne(id);
  expect(await db.recommendationJob.findUnique({where:{profileId:id}})).toMatchObject({state:'RETRY',attempts:1,errorCode:'PROVIDER_QUOTA'});
  expect((await db.hiringProfile.findUniqueOrThrow({where:{id}})).recommendationScore).toBeNull();
  await db.$transaction([db.recommendationJob.update({where:{profileId:id},data:{attempts:2,availableAt:new Date(0)}})]);await worker.runOne(id);
  expect(await db.recommendationJob.findUnique({where:{profileId:id}})).toMatchObject({state:'FAILED',attempts:3});
  await expect(service.retryRecommendation(otherVendor,id)).rejects.toMatchObject({status:403});await expect(service.retryRecommendation(foreignVendor,id)).rejects.toMatchObject({status:403});
  await service.retryRecommendation(manager,id);expect(await db.recommendationJob.findUnique({where:{profileId:id}})).toMatchObject({state:'PENDING',attempts:0,errorCode:null});
 });
 it('fences concurrent workers and cancellation during processing',async()=>{
  const {result}=await submit(vendor,openingId,[upload('resume.pptx',aiPptx,PPTX)]),id=result.items[0].id;
  const model=successfulModel(),original=model.turn.bind(model);let cancelled=false;
  model.turn=async(...args)=>{if(!cancelled){cancelled=true;await service.remove(vendor,id);}return original(...args);};
  const a=new RecommendationWorker(db,store,model,10000),b=new RecommendationWorker(db,store,model,10000);
  const results=await Promise.all([a.runOne(id),b.runOne(id)]);expect(results.filter(Boolean)).toHaveLength(1);
  expect(await db.recommendationJob.findUnique({where:{profileId:id}})).toMatchObject({state:'CANCELLED'});expect((await db.hiringProfile.findUniqueOrThrow({where:{id}})).recommendationScore).toBeNull();
 });
 it('recovers a crashed lease and completes once',async()=>{
  const {result}=await submit(vendor,openingId,[upload('resume.pptx',aiPptx,PPTX)]),id=result.items[0].id;
  await db.$transaction([db.recommendationJob.update({where:{profileId:id},data:{state:'RUNNING',leaseToken:'stale',leaseUntil:new Date(0),attempts:1}})]);
  await new RecommendationWorker(db,store,successfulModel(),10000).runOne(id);
  expect(await db.recommendationJob.findUnique({where:{profileId:id}})).toMatchObject({state:'COMPLETED',attempts:2,leaseToken:null});
 });

 it('rolls back the completed job if recommendation persistence fails',async()=>{
  const {result}=await submit(vendor,openingId,[upload('resume.pptx',aiPptx,PPTX)]),id=result.items[0].id;
  const failing=db.$extends({query:{hiringProfile:{async updateMany(){throw new Error('simulated recommendation persistence failure');}}}});
  await new RecommendationWorker(failing as unknown as PrismaClient,store,successfulModel(),10000).runOne(id);
  const profile=await db.hiringProfile.findUniqueOrThrow({where:{id},include:{recommendationJob:true}});
  expect(profile.recommendationScore).toBeNull();expect(profile.recommendationData).toBeNull();expect(profile.recommendationJob?.state).toBe('FAILED');
 });

 it('processes 100 submitted profiles with the scripted transport and atomic persistence (not a live SLA)',async()=>{
  const ids:number[]=[];
  for(let batch=0;batch<20;batch++){
   const {result}=await submit(vendor,openingId,Array.from({length:5},(_,index)=>upload(`load-${batch*5+index}.pptx`,aiPptx,PPTX)));ids.push(...result.items.map(p=>p.id));
  }
  const times:number[]=[];let cursor=0;
  await Promise.all(Array.from({length:2},async()=>{const worker=new RecommendationWorker(db,store,successfulModel(),10000);while(cursor<ids.length){const id=ids[cursor++],start=performance.now();await worker.runOne(id);times.push(Math.round(performance.now()-start));}}));
  const results=await db.hiringProfile.findMany({where:{id:{in:ids}},include:{recommendationJob:true}});expect(results).toHaveLength(100);expect(results.every(p=>p.recommendationScore===1&&p.recommendationJob?.state==='COMPLETED')).toBe(true);
  times.sort((a,b)=>a-b);console.log(JSON.stringify({event:'test.load100',transport:'SCRIPTED_NOT_LIVE',profiles:100,p95Ms:times[94],maxMs:times[99]}));
 },120000);

});
