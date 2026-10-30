import {Worker} from 'node:worker_threads';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
export class AgentError extends Error {constructor(public code:string,public retryable=false){super(code);this.name='AgentError';}}
export function sanitize(text:string){return text.normalize('NFKC').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/[ \t]+/g,' ').trim();}
// Untrusted document parsers run outside the server event loop, with resource and time bounds.
export async function parseDocument(buffer:Buffer,mimeType:string,signal:AbortSignal):Promise<string>{
 if(signal.aborted)throw new AgentError('PROCESSING_TIMEOUT');
 if(buffer.length>10*1024*1024||!['application/pdf','application/vnd.openxmlformats-officedocument.presentationml.presentation'].includes(mimeType)||(mimeType==='application/pdf'&&!buffer.subarray(0,12).toString().startsWith('%PDF-')))throw new AgentError('INVALID_DOCUMENT');
 const worker=new Worker(`
 const {parentPort,workerData}=require('node:worker_threads');
 (async()=>{
  const bytes=Buffer.from(workerData.bytes);let text='';
  if(workerData.mime==='application/pdf'){
   const {getDocument}=await import(workerData.pdf);
   const task=getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:true,verbosity:0});
   const doc=await task.promise;if(doc.numPages>100)throw new Error('Too many pages');
   for(let page=1;page<=doc.numPages;page++){const p=await doc.getPage(page);const c=await p.getTextContent();text+=c.items.map(i=>i.str||'').join(' ')+'\\n';if(text.length>24000)throw new Error('Too much text');p.cleanup();}await task.destroy();
  }else{
   const {unzipSync}=require(workerData.zip);let total=0,count=0;
   const parts=unzipSync(bytes,{filter:e=>{total+=e.originalSize;count++;if(total>52428800||count>2000||e.originalSize>10485760)throw new Error('Archive too large');return /^ppt\\/slides\\/slide\\d+\\.xml$/.test(e.name);}});
   text=Object.keys(parts).sort((a,b)=>Number(a.match(/slide(\\d+)/)[1])-Number(b.match(/slide(\\d+)/)[1])).map(n=>Array.from(Buffer.from(parts[n]).toString().matchAll(/<a:t(?:\\s[^>]*)?>([\\s\\S]*?)<\\/a:t>/g)).map(m=>m[1]).join('\\n')).join('\\n');
   text=text.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
  }
  parentPort.postMessage({text});
 })().catch(()=>parentPort.postMessage({error:true}));`,{eval:true,execArgv:[],workerData:{bytes:buffer,mime:mimeType,pdf:pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href,zip:require.resolve('fflate')},resourceLimits:{maxOldGenerationSizeMb:192}});
 return new Promise((resolve,reject)=>{
  let done=false;
  const finish=(error?:Error,text?:string)=>{if(done)return;done=true;clearTimeout(timer);signal.removeEventListener('abort',abort);void worker.terminate();error?reject(error):resolve(text!);};
  const abort=()=>finish(new AgentError('PROCESSING_TIMEOUT'));
  const timer=setTimeout(()=>finish(new AgentError('PARSING_TIMEOUT')),15000);
  signal.addEventListener('abort',abort,{once:true});
  worker.on('error',()=>finish(new AgentError('INVALID_DOCUMENT')));
  worker.on('exit',()=>{if(!done)finish(new AgentError('INVALID_DOCUMENT'));});
  worker.on('message',data=>{if(data.error)return finish(new AgentError('INVALID_DOCUMENT'));const text=sanitize(data.text||'');if(text.length>24000)return finish(new AgentError('DOCUMENT_TOO_LONG'));if(text.length<30)return finish(new AgentError('NO_READABLE_TEXT'));finish(undefined,text);});
 });
}
