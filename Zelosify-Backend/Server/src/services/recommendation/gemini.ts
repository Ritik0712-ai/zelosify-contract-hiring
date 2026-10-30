import {AgentError} from './parse.js';
export type Content={role:'user'|'model';parts:any[]};
export type Turn={content:Content;usage:{input:number;output:number;thinking:number};latencyMs:number};
export interface ModelClient {readonly model:string;turn(system:string,contents:Content[],declarations:any[],signal:AbortSignal):Promise<Turn>}
let nextRequestAt=0;
let pacingTail:Promise<void>=Promise.resolve();
function abortable<T>(work:Promise<T>,signal:AbortSignal):Promise<T>{
 if(signal.aborted)return Promise.reject(new AgentError('PROCESSING_TIMEOUT'));
 return new Promise((resolve,reject)=>{const abort=()=>reject(new AgentError('PROCESSING_TIMEOUT'));signal.addEventListener('abort',abort,{once:true});work.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});
}
async function pace(signal:AbortSignal){
 const configured=Number(process.env.GEMINI_MIN_REQUEST_INTERVAL_MS||0),interval=Number.isFinite(configured)?Math.min(60000,Math.max(0,configured)):0;
 const slot=pacingTail.then(async()=>{
  if(signal.aborted)throw new AgentError('PROCESSING_TIMEOUT');
  const wait=Math.max(0,nextRequestAt-Date.now());
  if(wait)await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new AgentError('PROCESSING_TIMEOUT'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},wait);signal.addEventListener('abort',abort,{once:true});});
  if(signal.aborted)throw new AgentError('PROCESSING_TIMEOUT');
  // A cancelled waiter must not reserve a future provider slot.
  nextRequestAt=Date.now()+interval;
 });
 pacingTail=slot.catch(()=>{});
 await abortable(slot,signal);
}
export class GeminiClient implements ModelClient {
 readonly model=process.env.GEMINI_MODEL||'gemini-3.1-flash-lite';
 async turn(system:string,contents:Content[],declarations:any[],signal:AbortSignal):Promise<Turn>{
  if(!process.env.GEMINI_API_KEY)throw new AgentError('AI_NOT_CONFIGURED');
  const start=performance.now();await pace(signal);
  let response:Response;
  try{response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':process.env.GEMINI_API_KEY},signal,
   body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents,tools:[{functionDeclarations:declarations.map(({parameters,...d})=>({...d,parametersJsonSchema:parameters}))}],toolConfig:{functionCallingConfig:{mode:'ANY'}},generationConfig:{temperature:0,maxOutputTokens:1600,...(this.model.startsWith('gemini-3')?{thinkingConfig:{thinkingLevel:'minimal'}}:{})}})});}catch{throw new AgentError(signal.aborted?'PROCESSING_TIMEOUT':'PROVIDER_UNAVAILABLE',!signal.aborted);}
  if(!response.ok){
   const error=new AgentError(response.status===429?'PROVIDER_QUOTA':response.status>=500?'PROVIDER_UNAVAILABLE':'PROVIDER_REQUEST_REJECTED',response.status===429||response.status>=500);
   if(response.status===429){const data=await response.json().catch(()=>({}));const delay=data.error?.details?.find((d:any)=>typeof d.retryDelay==='string')?.retryDelay;const seconds=typeof delay==='string'?Number(delay.replace(/s$/,'')):NaN;Object.assign(error,{retryAfterMs:Number.isFinite(seconds)?Math.min(3600000,Math.max(1000,seconds*1000)):60000});}
   throw error;
  }
  const data=await response.json();
  const content=data.candidates?.[0]?.content;
  if(!content?.parts?.some((p:any)=>p.functionCall))throw new AgentError('INVALID_MODEL_OUTPUT',true);
  // Preserve original parts, including opaque thought signatures, only in transient request history.
  return {content,usage:{input:data.usageMetadata?.promptTokenCount||0,output:data.usageMetadata?.candidatesTokenCount||0,thinking:data.usageMetadata?.thoughtsTokenCount||0},latencyMs:Math.round(performance.now()-start)};
 }
}
