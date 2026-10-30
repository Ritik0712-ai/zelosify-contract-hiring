import 'dotenv/config';
import fs from 'node:fs/promises';
import {zipSync,strToU8} from 'fflate';
import {recommend} from '../src/services/recommendation/orchestrator.js';
import {GeminiClient} from '../src/services/recommendation/gemini.js';
const count=Number(process.env.BENCHMARK_COUNT||100),concurrency=Number(process.env.BENCHMARK_CONCURRENCY||1),timeoutMs=Number(process.env.BENCHMARK_TIMEOUT_MS||60000);
if(!Number.isInteger(count)||count<1||count>100||!Number.isInteger(concurrency)||concurrency<1||concurrency>4)throw new Error('Invalid benchmark size');
if(process.env.NODE_ENV!=='development')throw new Error('Run this explicit live-provider benchmark only in development.');
const opening={title:'Frontend Engineer',requiredSkills:['React','TypeScript','Next.js'],experienceMin:4,experienceMax:7,location:'Bengaluru',workMode:'HYBRID' as const};
function pdf(text:string){
 const escaped=text.replace(/([\\()])/g,'\\$1'),body=`BT /F1 10 Tf 30 760 Td (${escaped}) Tj ET`;
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(body)} >>\nstream\n${body}\nendstream`];
 let value='%PDF-1.4\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(value));value+=`${i+1} 0 obj\n${o}\nendobj\n`;});const start=Buffer.byteLength(value);value+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;return Buffer.from(value);
}
let quotaReached=false;let next=0;const rows:any[]=[];const startedAt=new Date().toISOString();
await fs.mkdir('.local',{recursive:true});
await Promise.all(Array.from({length:concurrency},async()=>{
 while(next<count&&!quotaReached){const index=next++,text=`Fictional test profile ${index+1}. Software engineer. Experience: ${2+index%9} years. Skills: ${index%3===0?'React, TypeScript, Next.js':index%3===1?'React, JavaScript':'Python, SQL'}. Location: ${index%4===0?'Pune':'Bengaluru'}. Education: BSc Computer Science.`,pptx=index%2===1;
 const bytes=pptx?Buffer.from(zipSync({'ppt/slides/slide1.xml':strToU8(`<p:sld><a:t>${text}</a:t></p:sld>`)})):pdf(text),start=performance.now();
 try{const r=await recommend({opening,mimeType:pptx?'application/vnd.openxmlformats-officedocument.presentationml.presentation':'application/pdf',load:async()=>bytes},new GeminiClient(),{timeoutMs});rows.push({index,type:pptx?'PPTX':'PDF',ok:true,latencyMs:Math.round(performance.now()-start),score:r.result.score,tokens:r.tokens,tools:r.trace.length});}
 catch(e:any){rows.push({index,type:pptx?'PPTX':'PDF',ok:false,latencyMs:Math.round(performance.now()-start),code:e.code||'FAILED'});if(e.code==='PROVIDER_QUOTA')quotaReached=true;}
 await fs.writeFile('.local/benchmark-recommendations-progress.json',JSON.stringify({startedAt,requested:count,completed:rows.length,rows},null,2));console.log(JSON.stringify({event:'benchmark.progress',completed:rows.length,requested:count,last:rows.at(-1)}));
 }
}));
const times=rows.filter(r=>r.ok).map(r=>r.latencyMs).sort((a,b)=>a-b),percentile=(p:number)=>times.length?times[Math.ceil(times.length*p)-1]:null;
const report={startedAt,finishedAt:new Date().toISOString(),model:process.env.GEMINI_MODEL,measurement:'Live Gemini function calls + real PDF/PPTX parsing; in-memory document loader. Excludes HTTP upload, S3, database, queue waiting. Unique synthetic job-related profiles; no real candidate data.',requested:count,concurrency,timeoutMs,completed:rows.length,skipped:count-rows.length,quotaReached,successful:times.length,failed:rows.length-times.length,percentilePopulation:'successful profiles only; failures and skipped profiles excluded, so never interpret this as a passing full-sample SLA',p50Ms:percentile(.5),p95Ms:percentile(.95),maxMs:times.at(-1)||null,under1500:times.filter(n=>n<=1500).length,slaMet:times.length===count&&times.every(n=>n<=1500)&&(percentile(.95)||Infinity)<2000,rows:rows.sort((a,b)=>a.index-b.index)};
await fs.writeFile('.local/benchmark-recommendations.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,rows:undefined},null,2));
