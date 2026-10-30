"use client";
import {useEffect,useRef,useState} from 'react';
import {Skeleton,ErrorState} from './HiringWorkspace';
export default function PdfPreview({blob}){
 const canvas=useRef(null);const [doc,setDoc]=useState(null),[page,setPage]=useState(1),[error,setError]=useState(''),[rendering,setRendering]=useState(true),[text,setText]=useState('');
 useEffect(()=>{
  let task,cancelled=false;
  (async()=>{
   try{const pdf=await import('pdfjs-dist');pdf.GlobalWorkerOptions.workerSrc='/pdf.worker.min.mjs';
    if(cancelled)return;const bytes=new Uint8Array(await blob.arrayBuffer());if(cancelled)return;
    task=pdf.getDocument({data:bytes,isEvalSupported:false,useSystemFonts:true});
    const loaded=await task.promise;if(!cancelled)setDoc(loaded);
   }catch{if(!cancelled)setError('This PDF could not be rendered. Download the original to inspect it.');}
  })();return()=>{cancelled=true;task?.destroy();};
 },[blob]);
 useEffect(()=>{
  if(!doc||!canvas.current)return;
  let task,cancelled=false;setRendering(true);
  (async()=>{try{
   const pdfPage=await doc.getPage(page);if(cancelled)return;
   const natural=pdfPage.getViewport({scale:1});const width=Math.max(220,Math.min(820,canvas.current.parentElement.clientWidth-32));const ratio=Math.min(2,window.devicePixelRatio||1);
   const viewport=pdfPage.getViewport({scale:width/natural.width*ratio});const target=canvas.current;
   target.width=Math.floor(viewport.width);target.height=Math.floor(viewport.height);target.style.width=`${Math.floor(viewport.width/ratio)}px`;target.style.height=`${Math.floor(viewport.height/ratio)}px`;
   task=pdfPage.render({canvas:target,canvasContext:target.getContext('2d'),viewport});await task.promise;
   const contents=await pdfPage.getTextContent();if(!cancelled){setText(contents.items.map(i=>i.str||'').join(' '));setRendering(false);}
  }catch(e){if(!cancelled&&e.name!=='RenderingCancelledException')setError('This PDF page could not be rendered. Download the original to inspect it.');}})();
  return()=>{cancelled=true;task?.cancel();};
 },[doc,page]);
 if(error)return <ErrorState message={error}/>;
 return <div className="hire-pdf-viewer"><div className="hire-pdf-toolbar"><button className="hire-button secondary" disabled={!doc||page<=1||rendering} onClick={()=>setPage(p=>p-1)}>Previous page</button><span>{doc?`Page ${page} of ${doc.numPages}`:'Loading PDF…'}</span><button className="hire-button secondary" disabled={!doc||page>=doc.numPages||rendering} onClick={()=>setPage(p=>p+1)}>Next page</button></div><div className="hire-pdf-canvas" aria-busy={rendering}>{!doc&&<Skeleton rows={2}/>}<canvas ref={canvas} aria-label={`PDF page ${page}`}/><p className="hire-sr-only">{text}</p></div></div>;
}
