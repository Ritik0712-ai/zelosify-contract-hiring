"use client";
import {createContext,useContext,useEffect,useState} from 'react';
import {usePathname,useRouter} from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {useTheme} from 'next-themes';
import {BriefcaseBusiness,Building2,ChevronRight,LogOut,Moon,Sun,ShieldCheck} from 'lucide-react';
import api from '@/utils/Axios/AxiosInstance';
import './hiring.css';
const Context=createContext(null);
export function useHiring(){return useContext(Context);}
export function Skeleton({rows=4}){return <div aria-label="Loading" aria-busy="true" className="hire-skeletons">{Array.from({length:rows},(_,i)=><div key={i} className="hire-skeleton" />)}</div>;}
export function ErrorState({message,retry}){return <div role="alert" className="hire-error"><strong>We couldn’t load this view.</strong><p>{message}</p>{retry&&<button className="hire-button secondary" onClick={retry}>Try again</button>}</div>;}
export default function HiringWorkspace({children}){
 const pathname=usePathname(),router=useRouter();
 const [user,setUser]=useState(null),[error,setError]=useState(''),[logoutBusy,setLogoutBusy]=useState(false);
 const {resolvedTheme,setTheme}=useTheme();
 const [mounted,setMounted]=useState(false);useEffect(()=>setMounted(true),[]);
 const expected=pathname.startsWith('/vendor/')?'IT_VENDOR':'HIRING_MANAGER';
 useEffect(()=>{
  const controller=new AbortController();
  api.get('/auth/user',{signal:controller.signal}).then(({data})=>{
   if(data.role!==expected){setError('This workspace is not available for your role.');return;}setUser(data);
  }).catch(e=>{if(e.code==='ERR_CANCELED')return;if(e.response?.status===401)router.replace('/login');else setError('Your session could not be verified. Refresh this page to try again.');});
  return()=>controller.abort();
 },[expected,router]);
 const root=expected==='IT_VENDOR'?'/vendor/openings':'/hiring-manager/openings';
 async function logout(){setLogoutBusy(true);try{await api.post('/auth/logout');localStorage.removeItem('zelosify_user');router.replace('/login');}catch{setLogoutBusy(false);setError('Sign out could not be completed. Please try again.');}}
 return <div className="hiring-workspace">
  <aside className="hire-sidebar">
   <Link className="hire-brand" href={root} aria-label="Zelosify openings"><Image src="/assets/logos/zelosify_Dark.png" width={120} height={32} alt="Zelosify" /></Link>
   <div className="hire-workspace-label">Contract hiring</div>
   <nav aria-label="Hiring workspace"><Link href={root} className="hire-nav-active"><BriefcaseBusiness size={18}/>Openings<ChevronRight size={15}/></Link></nav>
   <div className="hire-sidebar-bottom"><ShieldCheck size={18}/><p>Your workspace is private to your organization.</p></div>
  </aside>
  <div className="hire-main">
   <header className="hire-topbar"><div className="hire-tenant"><Building2 size={17}/><span>{user?.tenant?.companyName||'Your organization'}</span></div>
    <div className="hire-top-actions"><span className="hire-persona">{expected==='IT_VENDOR'?'IT vendor':'Hiring manager'}</span>
     <button className="hire-icon-button" aria-label="Toggle color theme" onClick={()=>setTheme(resolvedTheme==='dark'?'light':'dark')}>{mounted&&resolvedTheme==='dark'?<Sun size={18}/>:<Moon size={18}/>}</button>
     <button className="hire-icon-button" aria-label="Sign out" disabled={logoutBusy} onClick={logout}><LogOut size={18}/></button>
     <div className="hire-avatar" title={user?`${user.firstName||''} ${user.lastName||''}`:'Profile'}>{expected==='IT_VENDOR'?'DV':'DM'}</div>
    </div>
   </header>
   <main className="hire-content">{error?<ErrorState message={error}/>:!user?<Skeleton/>:<Context.Provider value={{user,role:expected,root}}>{children}</Context.Provider>}</main>
   <footer className="hire-footer">Zelosify <span>Contract hiring workspace</span></footer>
  </div>
 </div>;
}
