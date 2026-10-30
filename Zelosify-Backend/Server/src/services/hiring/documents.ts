import {unzipSync} from 'fflate';
import {HttpError} from './errors.js';

export const PDF='application/pdf';
export const PPTX='application/vnd.openxmlformats-officedocument.presentationml.presentation';
export const MAX_FILE_BYTES=10*1024*1024;
export const MAX_BATCH_BYTES=25*1024*1024;
export type FileSpec={name:string;size:number;type:string};
export function fileSpec(value:unknown): FileSpec {
  const v=value as Record<string,unknown>;
  if(!v || typeof v!=='object' || typeof v.name!=='string' || typeof v.size!=='number' || typeof v.type!=='string')throw new HttpError(400,'Each file needs a name, size and type.');
  const name=v.name.normalize('NFKC').trim();
  if(name.length<1||name.length>180||/[\\/\x00-\x1f\x7f]/.test(name))throw new HttpError(400,'Use a file name without folders or control characters (up to 180 characters).');
  const type=name.toLowerCase().endsWith('.pdf')?PDF:name.toLowerCase().endsWith('.pptx')?PPTX:null;
  if(!type || (v.type!==type && v.type!=='' && v.type!=='application/octet-stream'))throw new HttpError(400,'Only PDF and PPTX candidate profiles are accepted.');
  if(!Number.isSafeInteger(v.size)||v.size<1||v.size>MAX_FILE_BYTES)throw new HttpError(400,'Each file must be between 1 byte and 10 MB.');
  return {name,size:v.size,type};
}
export function batchSpec(value:unknown):FileSpec[] {
  if(!Array.isArray(value)||value.length<1||value.length>5)throw new HttpError(400,'Select between 1 and 5 profiles.');
  const files=value.map(fileSpec);
  if(files.reduce((n,f)=>n+f.size,0)>MAX_BATCH_BYTES)throw new HttpError(400,'The combined upload must be 25 MB or smaller.');
  return files;
}
export function pptxParts(buffer:Buffer) {
  let count=0,total=0;
  try {
    unzipSync(buffer,{filter:entry=>{
      count++;total+=entry.originalSize;
      if(count>2000||total>50*1024*1024||entry.originalSize>10*1024*1024||entry.name.includes('../')||entry.name.startsWith('/'))throw new Error('Archive limits exceeded');
      if(/vbaProject\.bin$/i.test(entry.name))throw new Error('Macros are not accepted');
      return false;
    }});
    const parts=unzipSync(buffer,{filter:e=>e.name==='[Content_Types].xml'||e.name==='ppt/presentation.xml'||/^ppt\/slides\/slide\d+\.xml$/.test(e.name)});
    const content=Buffer.from(parts['[Content_Types].xml']||[]).toString();
    if(!parts['ppt/presentation.xml']||!content.includes('presentationml.presentation.main+xml'))throw new Error('Invalid presentation');
    return parts;
  }catch{throw new HttpError(400,'The PPTX is invalid, encrypted, macro-enabled or exceeds safe archive limits.');}
}
export function validateDocument(buffer:Buffer,spec:FileSpec) {
  if(buffer.length!==spec.size)throw new HttpError(400,'A file changed after upload authorization. Select it again.');
  if(spec.type===PDF){
    if(!/^%PDF-\d\.\d/.test(buffer.subarray(0,12).toString())||!buffer.subarray(-2048).includes(Buffer.from('%%EOF')))throw new HttpError(400,'The PDF is invalid or incomplete.');
  }else pptxParts(buffer);
}
function escape(value:string){return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
export function pptxPreview(buffer:Buffer,name:string):string {
  const parts=pptxParts(buffer);
  const slides=Object.keys(parts).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b)=>Number(a.match(/slide(\d+)/)?.[1])-Number(b.match(/slide(\d+)/)?.[1]));
  const text=slides.map((n,i)=>{
    const xml=Buffer.from(parts[n]).toString();
    const lines=Array.from(xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)).map(m=>m[1].replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&'));
    return `<section><h2>Slide ${i+1}</h2>${lines.length?lines.map(t=>`<p>${escape(t)}</p>`).join(''):'<p>No text on this slide.</p>'}</section>`;
  }).join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(name)}</title><style>body{font:16px/1.6 system-ui;color:#172133;background:#f7f9fc;margin:0;padding:24px}h1{font-size:22px}h2{font-size:16px;color:#2859cc}section{background:white;border:1px solid #dbe2ed;border-radius:8px;padding:20px;margin:16px 0}p{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>${escape(name)}</h1><p>Text preview. Download the presentation to view its original layout and images.</p>${text||'<p>No slides with text were found.</p>'}</html>`;
}
