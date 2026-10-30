"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {ArrowUpRight,BriefcaseBusiness,MapPin,Search,SlidersHorizontal} from 'lucide-react';
import {useHiring,Skeleton,ErrorState} from './HiringWorkspace';
import useHiringResource from './useHiringResource';
export function Status({status}){return <span className={`hire-status ${status.toLowerCase()}`}><span/>{({OPEN:'Open',CLOSED:'Closed',ON_HOLD:'On hold',SUBMITTED:'Submitted',SHORTLISTED:'Shortlisted',REJECTED:'Rejected'})[status]||status}</span>;}
export const dateLabel=value=>new Date(value).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
export function Pagination({page,total,limit,onChange}){const pages=Math.max(1,Math.ceil(total/limit));return <div className="hire-pagination"><span>{total?`${(page-1)*limit+1}–${Math.min(page*limit,total)} of ${total}`:'0 results'}</span><div><button aria-label="Previous page" className="hire-button secondary" disabled={page<=1} onClick={()=>onChange(page-1)}>Previous</button><span>Page {page} of {pages}</span><button aria-label="Next page" className="hire-button secondary" disabled={page>=pages} onClick={()=>onChange(page+1)}>Next</button></div></div>;}
export default function OpeningsPage(){
 const {role,root}=useHiring();const [search,setSearch]=useState(''),[query,setQuery]=useState(''),[status,setStatus]=useState(''),[page,setPage]=useState(1);
 useEffect(()=>{const t=setTimeout(()=>setQuery(search.trim()),250);return()=>clearTimeout(t);},[search]);
 const params=new URLSearchParams({page:String(page),limit:'12',...(query?{search:query}:{}),...(status?{status}:{})});
 const {data,loading,error,refresh}=useHiringResource(`${root}?${params}`);
 return <>
  <div className="hire-page-heading"><div><div className="hire-breadcrumb">Contract hiring</div><h1>Contract openings</h1><p>{role==='IT_VENDOR'?'Find the right opening for your candidates and submit their profiles securely.':'Review your assigned openings and move the right candidates forward.'}</p></div><span className="hire-count-label">{data?`${data.total} ${role==='IT_VENDOR'?'available':'assigned'} openings`:'Loading openings'}</span></div>
  <section className="hire-panel" aria-label="Contract openings">
   <div className="hire-toolbar"><label className="hire-search"><Search size={18}/><input maxLength={100} aria-label="Search openings" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Search by role or location"/></label><label className="hire-filter"><SlidersHorizontal size={16}/><select aria-label="Filter opening status" value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="">All statuses</option><option value="OPEN">Open</option><option value="ON_HOLD">On hold</option><option value="CLOSED">Closed</option></select></label></div>
   {error?<ErrorState message={error} retry={refresh}/>:loading?<Skeleton rows={6}/>:!data?.items.length?<div className="hire-empty"><BriefcaseBusiness size={32}/><h2>No openings found</h2><p>{search||status?'Try a different search or clear your filters.':'New openings will appear here when they are assigned to your workspace.'}</p>{(search||status)&&<button className="hire-button secondary" onClick={()=>{setSearch('');setStatus('');setPage(1);}}>Clear filters</button>}</div>:<>
   <div className="hire-table-wrap"><table className="hire-openings-table"><thead><tr><th>Opening</th><th>Location & contract</th><th>Hiring manager</th><th>{role==='IT_VENDOR'?'Your profiles':'Profiles'}</th><th>Status</th><th><span className="hire-sr-only">View</span></th></tr></thead><tbody>{data.items.map(o=><tr key={o.id}>
    <td><Link className="hire-opening-link" href={`${root}/${o.id}`}>{o.title}</Link><div className="hire-meta">BW-{o.id.slice(-4)} <span className="hire-dot"/> {o.experienceMin}–{o.experienceMax||'+'} years experience</div></td>
    <td><div className="hire-location"><MapPin size={14}/>{o.location}</div><div className="hire-meta">{o.contractType} <span className="hire-dot"/> {o.workMode.toLowerCase()}</div></td>
    <td><div>{o.hiringManager.firstName} {o.hiringManager.lastName}</div><div className="hire-meta">Posted {dateLabel(o.postedDate)}</div></td>
    <td><span className="hire-profile-count">{o.profilesCount}</span></td><td><Status status={o.status}/></td><td><Link className="hire-row-link" href={`${root}/${o.id}`} aria-label={`View ${o.title}`}><ArrowUpRight size={18}/></Link></td>
   </tr>)}</tbody></table></div><Pagination page={page} total={data.total} limit={12} onChange={setPage}/></>}
  </section>
  <div className="hire-list-note"><BriefcaseBusiness size={16}/>{role==='IT_VENDOR'?'Only your own submitted profiles are visible in this workspace.':'Only openings assigned to you are visible in this workspace.'}</div>
 </>;
}
