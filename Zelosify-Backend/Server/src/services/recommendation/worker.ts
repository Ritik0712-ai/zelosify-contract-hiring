import crypto from 'node:crypto';
import {PrismaClient,Prisma} from '@prisma/client';
import type {DocumentStore} from '../hiring/storage.js';
import {ModelClient,GeminiClient} from './gemini.js';
import {recommend} from './orchestrator.js';
import {AgentError} from './parse.js';
export const processingBudget=()=>{const n=Number(process.env.AI_PROCESSING_TIMEOUT_MS||1500);if(!Number.isInteger(n)||n<100||n>120000)throw new Error('AI_PROCESSING_TIMEOUT_MS must be 100..120000');return n;};
const json=(value:unknown)=>JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export class RecommendationWorker {
 private stopped=true;private timer?:ReturnType<typeof setTimeout>;private running?:Promise<void>;private abort=new AbortController();
 constructor(private db:PrismaClient,private storage:DocumentStore,private model:ModelClient=new GeminiClient(),private timeoutMs=processingBudget()){}
 start(){if(!this.stopped)return;this.stopped=false;this.abort=new AbortController();const tick=()=>{this.running=this.runOne().then(()=>{}).catch(()=>{console.error(JSON.stringify({event:'recommendation.worker.error',code:'WORKER_FAILURE'}));}).finally(()=>{if(!this.stopped)this.timer=setTimeout(tick,500);});};tick();}
 async stop(){this.stopped=true;clearTimeout(this.timer);this.abort.abort();await this.running;}
 async runOne(profileId?:number){
  const now=new Date(),token=crypto.randomUUID();
  const job=await this.db.$transaction(async tx=>{
   // Recover work after a process crash; a lease token fences out the old worker.
   await tx.recommendationJob.updateMany({where:{state:'RUNNING',leaseUntil:{lt:now}},data:{state:'RETRY',availableAt:now,leaseToken:null,leaseUntil:null,errorCode:'WORKER_INTERRUPTED'}});
   await tx.recommendationJob.updateMany({where:{state:{in:['PENDING','RETRY']},profile:{isDeleted:true}},data:{state:'CANCELLED',finishedAt:now}});
   await tx.recommendationJob.updateMany({where:{state:{in:['PENDING','RETRY']},attempts:{gte:3}},data:{state:'FAILED',finishedAt:now,errorCode:'ATTEMPTS_EXHAUSTED'}});
   const next=await tx.recommendationJob.findFirst({where:{...(profileId?{profileId}:{}),state:{in:['PENDING','RETRY']},attempts:{lt:3},availableAt:{lte:now},profile:{isDeleted:false}},orderBy:[{availableAt:'asc'},{id:'asc'}]});
   if(!next)return null;
   const claim=await tx.recommendationJob.updateMany({where:{id:next.id,state:next.state,attempts:next.attempts},data:{state:'RUNNING',attempts:{increment:1},startedAt:now,finishedAt:null,leaseToken:token,leaseUntil:new Date(Date.now()+this.timeoutMs+15000),errorCode:null}});
   return claim.count?{...next,attempts:next.attempts+1}:null;
  });
  if(!job)return false;
  const started=performance.now();
  const log=(event:Record<string,unknown>)=>console.log(JSON.stringify({timestamp:new Date().toISOString(),...event,jobId:job.id,profileId:job.profileId,attempt:job.attempts}));
  try{
   const profile=await this.db.hiringProfile.findFirst({where:{id:job.profileId,isDeleted:false},select:{id:true,tenantId:true,openingId:true,mimeType:true,s3Key:true,s3VersionId:true,opening:{select:{id:true,tenantId:true,title:true,requiredSkills:true,experienceMin:true,experienceMax:true,location:true,workMode:true}}}});
   if(!profile||profile.opening.tenantId!==profile.tenantId)throw new AgentError('PROFILE_UNAVAILABLE');
   const {title,requiredSkills,experienceMin,experienceMax,location,workMode}=profile.opening;
   const result=await recommend({opening:{title,requiredSkills,experienceMin,experienceMax,location,workMode},mimeType:profile.mimeType,
    load:signal=>new Promise<Buffer>((resolve,reject)=>{
     if(signal.aborted)return reject(new AgentError('PROCESSING_TIMEOUT'));
     const abort=()=>reject(new AgentError('PROCESSING_TIMEOUT'));signal.addEventListener('abort',abort,{once:true});
     this.storage.get(profile.s3Key,profile.s3VersionId).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
    })},this.model,{timeoutMs:Math.max(1,this.timeoutMs-Math.round(performance.now()-started)),signal:this.abort.signal,log});
   const latencyMs=Math.round(performance.now()-started);
   if(latencyMs>this.timeoutMs)throw new AgentError('PROCESSING_TIMEOUT');
   const saved=await this.db.$transaction(async tx=>{
    const claimed=await tx.recommendationJob.updateMany({where:{id:job.id,state:'RUNNING',leaseToken:token},data:{state:'COMPLETED',finishedAt:new Date(),leaseToken:null,leaseUntil:null,errorCode:null,latencyMs,audit:json({trace:result.trace,tokens:result.tokens,model:result.model,version:result.version,budgetMs:this.timeoutMs})}});
    if(!claimed.count)return false;
    const updated=await tx.hiringProfile.updateMany({where:{id:profile.id,tenantId:profile.tenantId,openingId:profile.openingId,isDeleted:false},data:{recommended:result.result.recommended,recommendationScore:result.result.score,recommendationReason:result.result.reason,recommendationConfidence:result.result.confidence,recommendationCategory:result.result.category,recommendationVersion:result.version,recommendationLatencyMs:latencyMs,recommendedAt:new Date(),recommendationData:json({features:result.features,vector:result.vector})}});
    if(!updated.count)await tx.recommendationJob.update({where:{id:job.id},data:{state:'CANCELLED'}});
    return updated.count>0;
   });
   log({event:saved?'recommendation.final':'recommendation.cancelled',score:result.result.score,category:result.result.category,confidence:result.result.confidence,latencyMs,slaMet:latencyMs<=1500,tokens:result.tokens});
  }catch(e){
   const error=this.abort.signal.aborted?new AgentError('WORKER_INTERRUPTED',true):e instanceof AgentError?e:new AgentError('PROCESSING_FAILED');
   const retry=error.retryable&&job.attempts<3;
   const audit=(error as any).audit;
   await this.db.$transaction([this.db.recommendationJob.updateMany({where:{id:job.id,state:'RUNNING',leaseToken:token},data:{state:error.code==='PROFILE_UNAVAILABLE'?'CANCELLED':retry?'RETRY':'FAILED',errorCode:error.code,finishedAt:new Date(),leaseToken:null,leaseUntil:null,availableAt:new Date(Date.now()+Math.max((error as any).retryAfterMs||0,Math.min(120000,15000*2**(job.attempts-1)))),latencyMs:Math.round(performance.now()-started),...(audit?{audit:json(audit)}:{})}})]);
   log({event:'recommendation.error',code:error.code,retry,latencyMs:Math.round(performance.now()-started)});
  }
  return true;
 }
}
