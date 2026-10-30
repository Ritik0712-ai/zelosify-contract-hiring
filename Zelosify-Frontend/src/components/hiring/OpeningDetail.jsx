"use client";
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {ArrowLeft,BriefcaseBusiness,CalendarDays,Check,CheckCircle2,Download,Eye,FileText,MapPin,Trash2,UploadCloud,UserRound,X} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/UI/shadcn/dialog';
import api from '@/utils/Axios/AxiosInstance';
import PdfPreview from './PdfPreview';
import {useVirtualizer} from '@tanstack/react-virtual';
import {useHiring,Skeleton,ErrorState} from './HiringWorkspace';
import useHiringResource from './useHiringResource';
import {Status,dateLabel,Pagination} from './OpeningsPage';
const sizeLabel=bytes=>bytes<1024*1024?`${Math.max(1,Math.round(bytes/1024))} KB`:`${(bytes/1024/1024).toFixed(1)} MB`;
function UploadProfiles({opening,onComplete}){
 const input=useRef(null);const [files,setFiles]=useState([]),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState(''),[dragging,setDragging]=useState(false);
 function select(incoming){
  setError('');const next=[...files,...Array.from(incoming)].filter((f,i,all)=>all.findIndex(o=>o.name===f.name&&o.size===f.size&&o.lastModified===f.lastModified)===i);
  if(next.length>5){setError('Select up to 5 profiles per submission.');return;}
  if(next.some(f=>!(/\.(pdf|pptx)$/i.test(f.name))||f.size===0||f.size>10*1024*1024)){setError('Choose PDF or PPTX files, each between 1 byte and 10 MB.');return;}
  if(next.reduce((n,f)=>n+f.size,0)>25*1024*1024){setError('The combined file size must be 25 MB or smaller.');return;}
  setFiles(next);
 }
 async function submit(){
  setBusy(true);setError('');setProgress(0);
  try{
   const {data:intent}=await api.post(`/vendor/openings/${opening.id}/profiles/presign`,{files:files.map(f=>({name:f.name,size:f.size,type:f.type}))});
   const form=new FormData();form.append('uploadIntentId',intent.uploadIntentId);files.forEach(f=>form.append('files',f,f.name));
   await api.post(intent.uploadPath,form,{onUploadProgress:event=>setProgress(Math.min(99,Math.round((event.progress||0)*100)))});
   const count=files.length;setFiles([]);if(input.current)input.current.value='';onComplete(`${count} ${count===1?'profile':'profiles'} submitted successfully.`);
  }catch(e){setError(e.response?.data?.message||'The upload could not be completed. Your files remain selected so you can try again.');}
  finally{setBusy(false);setProgress(0);}
 }
 const open=opening.status==='OPEN';
 return <section className="hire-panel hire-upload-panel" aria-labelledby="upload-title"><div className="hire-section-heading"><div><h2 id="upload-title">Submit candidate profiles</h2><p>Share resumes for this opening. Only you and the assigned hiring manager can view them.</p></div><UploadCloud size={22}/></div>
 {!open?<div className="hire-inline-note">This opening is {opening.status==='CLOSED'?'closed':'on hold'} and is not accepting new profiles.</div>:<>
 <input className="hire-sr-only" ref={input} id="candidate-files" aria-label="Candidate profile files" type="file" multiple accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" disabled={busy} onChange={e=>{select(e.target.files);e.target.value='';}}/>
 <div className={`hire-dropzone ${dragging?'dragging':''}`} onDragOver={e=>{e.preventDefault();if(!busy)setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);if(!busy)select(e.dataTransfer.files);}}>
  <div className="hire-upload-icon"><UploadCloud size={24}/></div><div><strong>Drag candidate profiles here</strong><p>PDF or PPTX. Up to 5 files, 10 MB each.</p></div><button className="hire-button secondary" disabled={busy} onClick={()=>input.current?.click()}>Select files</button>
 </div>
 {files.length>0&&<ul className="hire-selected-files">{files.map((f,i)=><li key={`${f.name}-${f.size}-${i}`}><FileText size={18}/><span>{f.name}<small>{sizeLabel(f.size)}</small></span><button className="hire-icon-button" disabled={busy} aria-label={`Remove ${f.name} from selection`} onClick={()=>{setFiles(files.filter((_,j)=>j!==i));setError('');}}><X size={16}/></button></li>)}</ul>}
 {busy&&<div className="hire-progress" role="status"><progress max="100" value={progress}/><span>{progress>=99?'Saving profiles securely…':`Uploading… ${progress}%`}</span></div>}
 {error&&<p className="hire-field-error" role="alert">{error}</p>}
 <div className="hire-upload-footer"><span>25 MB maximum per submission</span><button className="hire-button" disabled={!files.length||busy} onClick={submit}>{busy?'Submitting…':`Submit ${files.length||''} ${files.length===1?'profile':'profiles'}`}<UploadCloud size={16}/></button></div>
 </>}
 </section>;
}
function Preview({profile,onClose,root}){
 const [state,setState]=useState({loading:true,error:'',blob:null,slides:[]});
 useEffect(()=>{
  if(!profile)return;
  const controller=new AbortController();
  api.get(`${root.replace('/openings','')}/profiles/${profile.id}/preview`,{responseType:'blob',signal:controller.signal}).then(async({data})=>{
    if(profile.mimeType==='application/pdf'){setState({loading:false,error:'',blob:data,slides:[]});return;}
    const parsed=new DOMParser().parseFromString(await data.text(),'text/html');
    const slides=Array.from(parsed.querySelectorAll('section')).map(section=>({title:section.querySelector('h2')?.textContent||'Slide',lines:Array.from(section.querySelectorAll('p')).map(p=>p.textContent)}));
    setState({loading:false,error:'',blob:null,slides});
  }).catch(e=>{if(e.code!=='ERR_CANCELED')setState({loading:false,error:'This preview could not be loaded. Close it and try again.',blob:null,slides:[]});});
  return()=>controller.abort();
 },[profile,root]);
 async function download(){
  try{const {data}=await api.get(`${root.replace('/openings','')}/profiles/${profile.id}/preview?download=1`,{responseType:'blob'});const url=URL.createObjectURL(data);const a=document.createElement('a');a.href=url;a.download=profile.fileName;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{setState(s=>({...s,error:'Download failed. Please try again.'}));}
 }
 return <Dialog open={!!profile} onOpenChange={open=>{if(!open)onClose();}}><DialogContent className="hire-preview-dialog"><DialogHeader><DialogTitle>{profile?.fileName}</DialogTitle><DialogDescription>{profile?.mimeType==='application/pdf'?'PDF preview':'Presentation text preview. Download to view the original layout.'}</DialogDescription></DialogHeader>
 {state.error?<ErrorState message={state.error}/>:state.loading?<Skeleton/>:<div className="hire-document-preview">{state.blob?<PdfPreview blob={state.blob}/>:<div className="hire-slide-preview">{state.slides.length?state.slides.map((slide,i)=><section key={i}><h3>{slide.title}</h3>{slide.lines.map((line,j)=><p key={j}>{line}</p>)}</section>):<p>No slide text is available. Download the original to view the presentation.</p>}</div>}</div>}
 <DialogFooter><button className="hire-button secondary" onClick={onClose}>Close preview</button><button className="hire-button" onClick={download} disabled={state.loading}><Download size={16}/>Download original</button></DialogFooter></DialogContent></Dialog>;
}
function ProfileList({items,children}){
 const scroll=useRef(null),enabled=items.length>50;
 const virtualizer=useVirtualizer({count:items.length,getScrollElement:()=>scroll.current,estimateSize:()=>260,overscan:3,enabled,getItemKey:index=>items[index].id});
 if(!enabled)return <ul className="hire-profile-list">{items.map(p=><li key={p.id} className="hire-profile-row">{children(p)}</li>)}</ul>;
 return <div className="hire-virtual-profiles" ref={scroll} tabIndex={0} aria-label="Scrollable candidate profiles"><ul className="hire-profile-list" style={{height:virtualizer.getTotalSize(),position:'relative'}}>{virtualizer.getVirtualItems().map(row=><li key={row.key} data-index={row.index} ref={virtualizer.measureElement} aria-posinset={row.index+1} aria-setsize={items.length} className="hire-profile-row" style={{position:'absolute',top:0,left:0,width:'100%',transform:`translateY(${row.start}px)`}}>{children(items[row.index])}</li>)}</ul></div>;
}
function Recommendation({profile,onRetry}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const state=profile.recommendationJob?.state||'PENDING';
 async function retry(){setBusy(true);setError('');try{await api.post(`/hiring-manager/profiles/${profile.id}/recommendation/retry`,{});onRetry();}catch(e){setError(e.response?.data?.message||'Retry could not be started.');}finally{setBusy(false);}}
 if(state!=='COMPLETED'||profile.recommendationScore==null){
  const failed=state==='FAILED';const messages={PROCESSING_TIMEOUT:'Processing reached its time limit.',NO_READABLE_TEXT:'No readable text found. Upload a text-based resume.',INVALID_DOCUMENT:'The document could not be parsed.',DOCUMENT_TOO_LONG:'The resume exceeds the text limit.',PROVIDER_QUOTA:'The AI provider has reached its usage limit.',PROVIDER_UNAVAILABLE:'The AI provider is temporarily unavailable.'};
  return <div className={`hire-ai-status ${failed?'failed':''}`}><strong>{failed?'Recommendation unavailable':state==='RUNNING'?'Analyzing resume…':state==='RETRY'?'Waiting to retry…':state==='CANCELLED'?'Analysis cancelled':'Analysis queued'}</strong><p>{failed?(messages[profile.recommendationJob?.errorCode]||'Analysis could not be completed. You can retry or review the original resume.'):'You can preview the resume and record a decision while analysis runs.'}</p>{failed&&<button className="hire-button secondary" disabled={busy} onClick={retry}>{busy?'Starting…':'Retry analysis'}</button>}{error&&<p role="alert">{error}</p>}</div>;
 }
 const category=profile.recommendationCategory;
 return <div className="hire-recommendation"><div className="hire-ai-heading"><span className={`hire-ai-badge ${category?.toLowerCase()}`}>{category==='RECOMMENDED'?'Recommended':category==='BORDERLINE'?'Borderline':'Not recommended'}</span><span className="hire-ai-score">{Math.round(profile.recommendationScore*100)}%<small>match score</small></span></div><p>{profile.recommendationReason}</p><div className="hire-ai-metadata"><span title="Completeness of explicit experience, skills and location evidence; not a probability of job success.">{Math.round(profile.recommendationConfidence*100)}% evidence confidence</span><span>{(profile.recommendationLatencyMs/1000).toFixed(2)}s processing</span><span>{profile.recommendationVersion}</span></div><small className="hire-ai-advisory">AI assistance · Review the original resume before deciding.</small></div>;
}
export default function OpeningDetail({id}){
 const {role,root}=useHiring();const [page,setPage]=useState(1),[pageSize,setPageSize]=useState(10),[status,setStatus]=useState(''),[notice,setNotice]=useState(''),[action,setAction]=useState(null),[busy,setBusy]=useState(false),[actionError,setActionError]=useState(''),[preview,setPreview]=useState(null);
 const opening=useHiringResource(`${root}/${id}`);
 const profiles=useHiringResource(`${root}/${id}/profiles?${new URLSearchParams({page:String(page),limit:String(pageSize),...(status?{status}:{})})}`);
 const {data:profileData,refresh:refreshProfiles}=profiles;
 useEffect(()=>{
  if(role!=='HIRING_MANAGER'||!profileData?.items.some(p=>['PENDING','RUNNING','RETRY'].includes(p.recommendationJob?.state)))return;
  const timer=setTimeout(()=>refreshProfiles(true),3000);return()=>clearTimeout(timer);
 },[role,profileData,refreshProfiles]);
 function refreshed(message){setNotice(message);setPage(1);opening.refresh();profiles.refresh();}
 async function confirm(){
  setBusy(true);setActionError('');
  try{
   const path=`${root.replace('/openings','')}/profiles/${action.profile.id}`;
   if(action.kind==='delete')await api.delete(path);else await api.post(`${path}/${action.kind}`,{expectedStatus:action.profile.status});
   const message=action.kind==='delete'?'Profile removed from this opening.':action.kind==='shortlist'?'Candidate shortlisted.':'Candidate rejected.';
   setAction(null);refreshed(message);
  }catch(e){setActionError(e.response?.data?.message||'The change could not be saved. Try again.');if(e.response?.status===409)profiles.refresh();}
  finally{setBusy(false);}
 }
 if(opening.error)return <><Link className="hire-back" href={root}><ArrowLeft size={16}/>All openings</Link><ErrorState message={opening.error} retry={opening.refresh}/></>;
 if(!opening.data)return <Skeleton rows={5}/>;
 const o=opening.data;
 return <>
 <Link className="hire-back" href={root}><ArrowLeft size={16}/>All openings</Link>
 <div className="hire-opening-brief"><div className="hire-brief-top"><span className="hire-requisition">BW-{o.id.slice(-4)}</span><Status status={o.status}/></div><h1>{o.title}</h1><div className="hire-brief-facts"><span><MapPin size={16}/>{o.location}</span><span><BriefcaseBusiness size={16}/>{o.contractType} contract</span><span><UserRound size={16}/>{o.experienceMin}–{o.experienceMax||'+'} years experience</span></div></div>
 <div className="hire-detail-grid"><section className="hire-panel hire-description"><h2>About this opening</h2><p>{o.description}</p><h3>Required skills</h3><div className="hire-skills">{o.requiredSkills.map(s=><span key={s}>{s}</span>)}</div></section>
 <aside className="hire-panel hire-opening-facts"><h2>Opening details</h2><dl><div><dt>Hiring manager</dt><dd>{o.hiringManager.firstName} {o.hiringManager.lastName}</dd></div><div><dt>Work arrangement</dt><dd>{o.workMode.toLowerCase()}</dd></div><div><dt>Posted</dt><dd>{dateLabel(o.postedDate)}</dd></div>{o.expectedCompletionDate&&<div><dt>Target hiring date</dt><dd>{dateLabel(o.expectedCompletionDate)}</dd></div>}</dl></aside></div>
 {notice&&<div role="status" className="hire-success"><CheckCircle2 size={18}/>{notice}<button className="hire-icon-button" aria-label="Dismiss notification" onClick={()=>setNotice('')}><X size={15}/></button></div>}
 {role==='IT_VENDOR'&&<UploadProfiles opening={o} onComplete={refreshed}/>}
 <section className="hire-panel hire-profiles" aria-labelledby="profiles-title"><div className="hire-section-heading"><div><h2 id="profiles-title">{role==='IT_VENDOR'?'Your submitted profiles':'Candidate profiles'} <span className="hire-counter">{profiles.data?.total||0}</span></h2><p>{role==='IT_VENDOR'?'Manage the profiles you have submitted for this opening.':'Review AI matches alongside each resume, then record your decision.'}</p></div><div className="hire-profile-filters"><select aria-label="Profiles per page" value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1);}}><option value={10}>10 per page</option><option value={25}>25 per page</option><option value={100}>100 per page</option></select><select aria-label="Filter profile status" value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="">All profiles</option><option value="SUBMITTED">Submitted</option><option value="SHORTLISTED">Shortlisted</option><option value="REJECTED">Rejected</option></select></div></div>
 {profiles.error?<ErrorState message={profiles.error} retry={profiles.refresh}/>:profiles.loading?<Skeleton rows={3}/>:!profiles.data?.items.length?<div className="hire-empty compact"><FileText size={30}/><h3>{status?'No profiles match this status':'No profiles submitted yet'}</h3><p>{role==='IT_VENDOR'?'Select candidate resumes above to make your first submission.':'Profiles will appear here when a vendor submits candidates for this opening.'}</p></div>:<><ProfileList items={profiles.data.items}>{p=><><div className={`hire-file-icon ${p.mimeType==='application/pdf'?'pdf':'pptx'}`}><FileText size={22}/><small>{p.mimeType==='application/pdf'?'PDF':'PPTX'}</small></div><div className="hire-profile-info"><h3>{p.fileName}</h3><p>{sizeLabel(p.fileSize)} <span className="hire-dot"/> Submitted {dateLabel(p.submittedAt)}{p.uploader&&<> <span className="hire-dot"/>{p.uploader.firstName} {p.uploader.lastName}</>}</p><Status status={p.status}/>{role==='HIRING_MANAGER'&&<Recommendation profile={p} onRetry={()=>profiles.refresh(true)}/>}</div><div className="hire-profile-actions"><button className="hire-button secondary" onClick={()=>setPreview(p)}><Eye size={16}/>Preview</button>{role==='IT_VENDOR'?<button className="hire-icon-button danger" aria-label={`Delete ${p.fileName}`} onClick={()=>{setActionError('');setAction({kind:'delete',profile:p});}}><Trash2 size={18}/></button>:<><button className="hire-button shortlist" disabled={p.status==='SHORTLISTED'} onClick={()=>{setActionError('');setAction({kind:'shortlist',profile:p});}}><Check size={16}/>{p.status==='SHORTLISTED'?'Shortlisted':'Shortlist'}</button><button className="hire-button reject" disabled={p.status==='REJECTED'} onClick={()=>{setActionError('');setAction({kind:'reject',profile:p});}}><X size={16}/>{p.status==='REJECTED'?'Rejected':'Reject'}</button></>}</div></>}</ProfileList><Pagination page={page} total={profiles.data.total} limit={pageSize} onChange={setPage}/></>}
 </section>
 {preview&&<Preview key={preview.id} profile={preview} root={root} onClose={()=>setPreview(null)}/>}
 {action&&<Dialog open={true} onOpenChange={open=>{if(!open&&!busy)setAction(null);}}><DialogContent className="hire-confirm-dialog"><DialogHeader><DialogTitle>{action?.kind==='delete'?'Remove this profile?':action?.kind==='shortlist'?'Shortlist this candidate?':'Reject this candidate?'}</DialogTitle><DialogDescription>{action?.profile.fileName}</DialogDescription></DialogHeader><p>{action?.kind==='delete'?'This profile will no longer appear in the opening. Its submission record is retained.':'The updated decision will be visible to the vendor who submitted this profile.'}</p>{actionError&&<p className="hire-field-error" role="alert">{actionError}</p>}<DialogFooter><button className="hire-button secondary" disabled={busy} onClick={()=>setAction(null)}>Cancel</button><button className={`hire-button ${action?.kind==='reject'||action?.kind==='delete'?'reject':''}`} disabled={busy} onClick={confirm}>{busy?'Saving…':action?.kind==='delete'?'Remove profile':action?.kind==='shortlist'?'Confirm shortlist':'Confirm rejection'}</button></DialogFooter></DialogContent></Dialog>}
 </>;
}
