import {S3Client,PutObjectCommand,GetObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
export type StoredObject={key:string;versionId?:string};
export interface DocumentStore {
  put(key:string,body:Buffer,type:string):Promise<StoredObject>;
  get(key:string,versionId?:string|null):Promise<Buffer>;
  remove(object:StoredObject):Promise<void>;
}
export class S3DocumentStore implements DocumentStore {
  private client=new S3Client({region:process.env.S3_AWS_REGION,maxAttempts:2});
  private bucket=process.env.S3_BUCKET_NAME!;
  async put(key:string,body:Buffer,type:string){
    const result=await this.client.send(new PutObjectCommand({Bucket:this.bucket,Key:key,Body:body,ContentType:type}),{abortSignal:AbortSignal.timeout(20000)});
    return {key,versionId:result.VersionId};
  }
  async get(key:string,versionId?:string|null){
    const result=await this.client.send(new GetObjectCommand({Bucket:this.bucket,Key:key,VersionId:versionId||undefined}),{abortSignal:AbortSignal.timeout(20000)});
    if(!result.Body)throw new Error('Stored document is unavailable');
    return Buffer.from(await result.Body.transformToByteArray());
  }
  async remove(object:StoredObject){
    await this.client.send(new DeleteObjectCommand({Bucket:this.bucket,Key:object.key,VersionId:object.versionId}));
  }
}
