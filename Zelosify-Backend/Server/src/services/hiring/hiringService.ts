import crypto from 'node:crypto';
import {PrismaClient,Prisma,ProfileStatus,Role} from '@prisma/client';
import {HttpError} from './errors.js';
import {batchSpec,validateDocument,FileSpec,pptxPreview,PPTX} from './documents.js';
import type {DocumentStore,StoredObject} from './storage.js';
export type Actor={id:string;tenantId:string;role:Role};
export type Page={page:number;limit:number;search?:string;status?:string};
const profileSelect={id:true,fileName:true,mimeType:true,fileSize:true,submittedAt:true,status:true,shortlistedAt:true,rejectedAt:true} as const;
const managerProfileSelect={...profileSelect,recommended:true,recommendationScore:true,recommendationReason:true,recommendationLatencyMs:true,recommendationVersion:true,recommendationConfidence:true,recommendationCategory:true,recommendedAt:true,recommendationJob:{select:{state:true,errorCode:true,attempts:true}},uploader:{select:{firstName:true,lastName:true,username:true}}} as const;
export class HiringService {
  constructor(private db:PrismaClient,private storage:DocumentStore){}
  private requireRole(actor:Actor,role:Role){if(!actor.tenantId||actor.role!==role)throw new HttpError(403,'This action is not available for your role.');}
  private openingWhere(actor:Actor,id?:string):Prisma.OpeningWhereInput {
    if(!actor.tenantId||!['IT_VENDOR','HIRING_MANAGER'].includes(actor.role))throw new HttpError(403,'Access denied.');
    return {tenantId:actor.tenantId,...(id?{id}:{}),...(actor.role==='HIRING_MANAGER'?{hiringManagerId:actor.id}:{})};
  }
  private async scopedOpening(actor:Actor,id:string,tx:Prisma.TransactionClient=this.db){
    const opening=await tx.opening.findFirst({where:this.openingWhere(actor,id),include:{hiringManager:{select:{firstName:true,lastName:true}}}});
    if(!opening)throw new HttpError(404,'Opening not found.');
    return opening;
  }
  async listOpenings(actor:Actor,page:Page){
    if(!actor.tenantId||!['IT_VENDOR','HIRING_MANAGER'].includes(actor.role))throw new HttpError(403,'Access denied.');
    const where:Prisma.OpeningWhereInput={...this.openingWhere(actor),...(page.search?{OR:[{title:{contains:page.search,mode:'insensitive'}},{location:{contains:page.search,mode:'insensitive'}}]}:{}),...(page.status?{status:page.status as any}:{})};
    const profileWhere={isDeleted:false,...(actor.role==='IT_VENDOR'?{uploadedBy:actor.id}:{})};
    const [items,total]=await this.db.$transaction([
      this.db.opening.findMany({where,orderBy:[{postedDate:'desc'},{id:'asc'}],skip:(page.page-1)*page.limit,take:page.limit,
        include:{hiringManager:{select:{firstName:true,lastName:true}},_count:{select:{hiringProfiles:{where:profileWhere}}}}}),
      this.db.opening.count({where}),
    ]);
    return {items:items.map(({_count,...o})=>({...o,profilesCount:_count.hiringProfiles})),total,page:page.page,limit:page.limit};
  }
  async opening(actor:Actor,id:string){
    const opening=await this.scopedOpening(actor,id);
    const count=await this.db.hiringProfile.count({where:{openingId:id,tenantId:actor.tenantId,isDeleted:false,...(actor.role==='IT_VENDOR'?{uploadedBy:actor.id}:{})}});
    return {...opening,profilesCount:count};
  }
  async profiles(actor:Actor,id:string,page:Page){
    await this.scopedOpening(actor,id);
    const where:Prisma.HiringProfileWhereInput={openingId:id,tenantId:actor.tenantId,isDeleted:false,
      ...(actor.role==='IT_VENDOR'?{uploadedBy:actor.id}:{}),...(page.status?{status:page.status as ProfileStatus}:{})};
    const [items,total]=await this.db.$transaction([
      this.db.hiringProfile.findMany({where,select:actor.role==='IT_VENDOR'?profileSelect:managerProfileSelect,orderBy:[{submittedAt:'desc'},{id:'desc'}],skip:(page.page-1)*page.limit,take:page.limit}),
      this.db.hiringProfile.count({where}),
    ]);
    return {items,total,page:page.page,limit:page.limit};
  }
  async authorizeUpload(actor:Actor,id:string,input:unknown){
    this.requireRole(actor,'IT_VENDOR');
    const files=batchSpec(input);
    const intent=await this.db.$transaction(async tx=>{
      const opening=await this.scopedOpening(actor,id,tx);
      if(opening.status!=='OPEN')throw new HttpError(409,'This opening is not accepting profiles.');
      return tx.uploadIntent.create({data:{tenantId:actor.tenantId,openingId:id,uploadedBy:actor.id,files,expiresAt:new Date(Date.now()+10*60*1000)}});
    });
    return {uploadIntentId:intent.id,expiresAt:intent.expiresAt,uploadPath:`/vendor/openings/${id}/profiles/upload`,files};
  }
  async submit(actor:Actor,id:string,intentId:string,uploads:{originalname:string;mimetype:string;buffer:Buffer;size:number}[]){
    this.requireRole(actor,'IT_VENDOR');
    await this.scopedOpening(actor,id);
    const intent=await this.db.uploadIntent.findFirst({where:{id:intentId,tenantId:actor.tenantId,openingId:id,uploadedBy:actor.id}});
    if(!intent)throw new HttpError(404,'Upload authorization not found.');
    if(intent.state==='COMPLETE')return {items:await this.db.hiringProfile.findMany({where:{uploadIntentId:intentId,uploadedBy:actor.id,isDeleted:false},select:profileSelect}),replayed:true};
    const actual=batchSpec(uploads.map(f=>({name:f.originalname,size:f.size,type:f.mimetype})));
    const expected=intent.files as FileSpec[];
    if(JSON.stringify(actual)!==JSON.stringify(expected))throw new HttpError(400,'The selected files do not match this upload authorization.');
    uploads.forEach((f,i)=>validateDocument(f.buffer,expected[i]));
    const claimed=await this.db.$transaction(async tx=>{
      const opening=await this.scopedOpening(actor,id,tx);
      if(opening.status!=='OPEN')throw new HttpError(409,'This opening is not accepting profiles.');
      return tx.uploadIntent.updateMany({where:{id:intentId,state:'READY',expiresAt:{gt:new Date()}},data:{state:'UPLOADING'}});
    });
    if(!claimed.count)throw new HttpError(409,'This upload is expired or already being processed. Select the files again.');
    const stored:StoredObject[]=[];
    try {
      for(let i=0;i<uploads.length;i++){
        const file=expected[i];
        const key=`${actor.tenantId}/${id}/${intent.createdAt.getTime()}_${intentId}_${i}_${file.name}`;
        stored.push(await this.storage.put(key,uploads[i].buffer,file.type));
        await this.db.$transaction([this.db.uploadIntent.update({where:{id:intentId},data:{storedObjects:stored as any}})]);
      }
      const items=await this.db.$transaction(async tx=>{
        const opening=await this.scopedOpening(actor,id,tx);
        if(opening.status!=='OPEN')throw new HttpError(409,'The opening stopped accepting profiles during upload.');
        const uploader=await tx.user.findFirst({where:{id:actor.id,tenantId:actor.tenantId,role:'IT_VENDOR'}});
        if(!uploader)throw new HttpError(403,'Your upload access has changed.');
        const result=[];
        for(let i=0;i<uploads.length;i++){
          const profile=await tx.hiringProfile.create({data:{tenantId:actor.tenantId,openingId:id,uploadedBy:actor.id,uploadIntentId:intentId,fileIndex:i,
            s3Key:stored[i].key,s3VersionId:stored[i].versionId,fileName:expected[i].name,mimeType:expected[i].type,fileSize:expected[i].size,
            checksum:crypto.createHash('sha256').update(uploads[i].buffer).digest('hex'),recommendationJob:{create:{}}},select:profileSelect});
          result.push(profile);
        }
        await tx.uploadIntent.update({where:{id:intentId},data:{state:'COMPLETE'}});
        return result;
      });
      console.log(JSON.stringify({event:'profiles.submitted',openingId:id,count:items.length,tenantId:actor.tenantId}));
      return {items,replayed:false};
    }catch(error){
      const cleanup=await Promise.allSettled(stored.map(o=>this.storage.remove(o)));
      const retained=stored.filter((_,i)=>cleanup[i].status==='rejected');
      await this.db.$transaction([this.db.uploadIntent.update({where:{id:intentId},data:{state:'FAILED',storedObjects:retained as any}})]);
      if(retained.length)console.error(JSON.stringify({event:'upload.cleanup.required',intentId,count:retained.length}));
      throw error;
    }
  }
  private profileWhere(actor:Actor,id:number):Prisma.HiringProfileWhereInput {
    return {id,tenantId:actor.tenantId,isDeleted:false,
      ...(actor.role==='IT_VENDOR'?{uploadedBy:actor.id}:{}),
      opening:this.openingWhere(actor)};
  }
  async preview(actor:Actor,id:number,download:boolean){
    const profile=await this.db.hiringProfile.findFirst({where:this.profileWhere(actor,id)});
    if(!profile)throw new HttpError(404,'Profile not found.');
    const body=await this.storage.get(profile.s3Key,profile.s3VersionId);
    return {body:profile.mimeType===PPTX&&!download?Buffer.from(pptxPreview(body,profile.fileName)):body,
      type:profile.mimeType===PPTX&&!download?'text/html; charset=utf-8':profile.mimeType,name:profile.fileName};
  }
  async remove(actor:Actor,id:number){
    this.requireRole(actor,'IT_VENDOR');
    await this.db.$transaction(async tx=>{
      const profile=await tx.hiringProfile.findFirst({where:{id,tenantId:actor.tenantId,uploadedBy:actor.id}});
      if(!profile)throw new HttpError(404,'Profile not found.');
      await tx.hiringProfile.updateMany({where:{id,tenantId:actor.tenantId,uploadedBy:actor.id,isDeleted:false},data:{isDeleted:true,deletedAt:new Date()}});
      await tx.recommendationJob.updateMany({where:{profileId:id,state:{in:['PENDING','RETRY','RUNNING']}},data:{state:'CANCELLED'}});
    });
  }
  async retryRecommendation(actor:Actor,id:number){
    this.requireRole(actor,'HIRING_MANAGER');
    return this.db.$transaction(async tx=>{
      const profile=await tx.hiringProfile.findFirst({where:this.profileWhere(actor,id)});
      if(!profile)throw new HttpError(404,'Profile not found.');
      const changed=await tx.recommendationJob.updateMany({where:{profileId:id,state:'FAILED'},data:{state:'PENDING',attempts:0,availableAt:new Date(),finishedAt:null,errorCode:null,leaseToken:null,leaseUntil:null}});
      if(!changed.count)throw new HttpError(409,'Only a failed recommendation can be retried.');
      return {state:'PENDING'};
    });
  }
  async decide(actor:Actor,id:number,target:'SHORTLISTED'|'REJECTED',expected:ProfileStatus){
    this.requireRole(actor,'HIRING_MANAGER');
    return this.db.$transaction(async tx=>{
      const profile=await tx.hiringProfile.findFirst({where:this.profileWhere(actor,id)});
      if(!profile)throw new HttpError(404,'Profile not found.');
      if(profile.status===target)return tx.hiringProfile.findUnique({where:{id},select:managerProfileSelect});
      if(profile.status!==expected)throw new HttpError(409,'This profile changed. Refresh the list before deciding.');
      const now=new Date();
      const changed=await tx.hiringProfile.updateMany({where:{...this.profileWhere(actor,id),status:expected},data:{status:target,
        shortlistedAt:target==='SHORTLISTED'?now:null,shortlistedBy:target==='SHORTLISTED'?actor.id:null,
        rejectedAt:target==='REJECTED'?now:null,rejectedBy:target==='REJECTED'?actor.id:null}});
      if(!changed.count)throw new HttpError(409,'This profile changed. Refresh the list before deciding.');
      await tx.profileDecision.create({data:{profileId:id,actorId:actor.id,fromStatus:profile.status,toStatus:target}});
      return tx.hiringProfile.findUnique({where:{id},select:managerProfileSelect});
    });
  }
}
