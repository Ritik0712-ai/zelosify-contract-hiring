import 'dotenv/config';
import {S3Client, HeadBucketCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand} from '@aws-sdk/client-s3';
const results={checkedAt:new Date().toISOString()};
if(!process.env.GEMINI_API_KEY)throw new Error('GEMINI_API_KEY is missing');
const model=process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
const start=performance.now();
const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{
 method:'POST',headers:{'content-type':'application/json','x-goog-api-key':process.env.GEMINI_API_KEY},
 body:JSON.stringify({contents:[{role:'user',parts:[{text:'Call connection_check with status ready.'}]}],
 tools:[{functionDeclarations:[{name:'connection_check',description:'Verify function calling connectivity.',parameters:{type:'OBJECT',properties:{status:{type:'STRING'}},required:['status']}}]}],
 toolConfig:{functionCallingConfig:{mode:'ANY',allowedFunctionNames:['connection_check']}},generationConfig:{maxOutputTokens:128}}),signal:AbortSignal.timeout(30000)});
const data=await response.json();
if(!response.ok)throw new Error(`Gemini HTTP ${response.status}: ${String(data.error?.message).replaceAll(process.env.GEMINI_API_KEY,'[redacted]')}`);
const call=data.candidates?.[0]?.content?.parts?.find(p=>p.functionCall)?.functionCall;
if(call?.name!=='connection_check')throw new Error('Gemini did not return expected tool call');
results.gemini={model,toolCalling:true,latencyMs:Math.round(performance.now()-start),tokenUsage:data.usageMetadata};
if(process.env.S3_BUCKET_NAME){
 const s3=new S3Client({region:process.env.S3_AWS_REGION});
 const Bucket=process.env.S3_BUCKET_NAME;
 await s3.send(new HeadBucketCommand({Bucket}));
 const Key=`setup-checks/${crypto.randomUUID()}.txt`, Body='Zelosify connection check';
 let version;
 try{
  const written=await s3.send(new PutObjectCommand({Bucket,Key,Body,ContentType:'text/plain'})); version=written.VersionId;
  const read=await s3.send(new GetObjectCommand({Bucket,Key,VersionId:version}));
  if(await read.Body.transformToString()!==Body)throw new Error('S3 content verification failed');
  results.s3={bucket:Bucket,region:process.env.S3_AWS_REGION,readWriteVerified:true};
 }finally{if(version)await s3.send(new DeleteObjectCommand({Bucket,Key,VersionId:version}));s3.destroy();}
}else results.s3={status:'waiting for bucket setup'};
console.log(JSON.stringify(results,null,2));
